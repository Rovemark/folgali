// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.5.0 (proposal 0005): images. Everything that the client and the relay must do the SAME lives here:
//
//   - `cleanImage(bytes)`: decides the format by the BYTES (never by the extension or the content-type), checks the structure,
//     removes all metadata (EXIF, GPS, XMP, ICC, text, thumbnails) and everything after the end of the image, and returns the clean
//     bytes. It does not decode pixels: it only reads headers and segments, with a memory ceiling equal to the file size.
//     It is deterministic and idempotent; the protocol hash is the SHA-256 of the OUTPUT, so the client and the relay arrive at the same one.
//   - the body of the `imagem` object (closed schema) and the rules between fields;
//   - the UPLOAD credential (`Authorization: Rover-Envio ...`), with a domain prefix of its own: the read credential does not
//     work for uploading and the upload one does not work for reading.
//
// What the cleaning does NOT guarantee: that the compressed data decodes, or that it carries no hidden data (a polyglot inside
// the compressed stream, steganography). See PROTOCOL.md, sections 16.5 and 16.9.
import { createHash } from 'node:crypto'
import { canonicalBytes } from './canonical.js'
import { signBytes, domainOf, verifySignature } from './keys.js'
import { failure, integer, closedObject, or_null, defaultValue, text, one_of } from './schema.js'
import { IMAGE_FORMATS, MEDIA_HASH_RE, LIMITS, MEDIA_LIMITS, IMAGE_USES } from './limits.js'
import { VIDEO_BODY, videoRules } from './video.js'

// ====================================================================================================
// HASH AND FORMAT
// ====================================================================================================

/** SHA-256 as 64 lowercase hexadecimal characters: the image's address on the relay. */
export const mediaHash = (bytes) => createHash('sha256').update(bytes).digest('hex')

export const isMediaHash = (s) => typeof s === 'string' && MEDIA_HASH_RE.test(s)

export const MIME_TYPE = Object.freeze({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * The format from the first bytes. Returns `jpeg`, `png`, `webp` or null. GIF, SVG, HTML, BMP, HEIC, PDF and the rest: null.
 * @param {Uint8Array} b
 */
export function formatFromBytes(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && Buffer.from(b.buffer, b.byteOffset, 8).equals(PNG_SIGNATURE)) return 'png'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp'
  return null
}

const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n))

// CRC-32 (PNG's) in plain JavaScript, so the cleaning runs the same anywhere.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ====================================================================================================
// CLEANING
// ====================================================================================================

class Refusal extends Error {
  constructor(code, detail) {
    super(detail)
    this.codigo = code
  }
}
const invalid = (detail) => new Refusal('imagem_invalida', detail)

const checkDimensions = (width, height) => {
  if (width < 1 || height < 1) throw invalid('largura ou altura zero')
  if (width > MEDIA_LIMITS.ladoMaxPx || height > MEDIA_LIMITS.ladoMaxPx) {
    throw new Refusal('dimensoes_grandes', `o lado maior passa de ${MEDIA_LIMITS.ladoMaxPx} px`)
  }
}

/**
 * Cleans an image. Never throws: returns the result or the reason for the refusal (a protocol error code).
 * @param {Uint8Array} entrada
 * @returns {{ ok: true, bytes: Buffer, formato: 'jpeg'|'png'|'webp', largura: number, altura: number, hash: string }
 *         | { ok: false, codigo: 'imagem_grande'|'formato_nao_aceito'|'imagem_invalida'|'dimensoes_grandes', detalhe: string }}
 */
export function cleanImage(input) {
  if (!(input instanceof Uint8Array)) return { ok: false, codigo: 'imagem_invalida', detalhe: 'não são bytes' }
  const b = Buffer.from(input.buffer, input.byteOffset, input.length)
  if (b.length > MEDIA_LIMITS.bytesMax) return { ok: false, codigo: 'imagem_grande', detalhe: `passa de ${MEDIA_LIMITS.bytesMax} bytes` }
  const format = formatFromBytes(b)
  if (!format) return { ok: false, codigo: 'formato_nao_aceito', detalhe: 'só JPEG, PNG e WebP, decididos pelos bytes' }
  try {
    const r = format === 'jpeg' ? cleanJpeg(b) : format === 'png' ? cleanPng(b) : cleanWebp(b)
    checkDimensions(r.largura, r.altura)
    return { ok: true, bytes: r.bytes, formato: format, largura: r.largura, altura: r.altura, hash: mediaHash(r.bytes) }
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, codigo: e.codigo, detalhe: e.message }
    return { ok: false, codigo: 'imagem_invalida', detalhe: 'estrutura ilegível' }
  }
}

// ---------- JPEG ----------

// Kept: DQT, DHT, DRI, SOF0/1/2 (only one), SOS with the compressed data, EOI. Removed: APP0 to APP15 and COM. The rest is refused.
const ACCEPTED_SOF = new Set([0xc0, 0xc1, 0xc2])
const JPEG_KEPT = new Set([0xdb, 0xc4, 0xdd])
const isApp = (m) => m >= 0xe0 && m <= 0xef

function cleanJpeg(b) {
  const output = [Buffer.from([0xff, 0xd8])]
  let i = 2
  let sof = null
  let scans = 0
  for (;;) {
    if (i >= b.length) throw invalid('JPEG truncado: falta o fim da imagem')
    if (b[i] !== 0xff) throw invalid('JPEG com byte fora de segmento')
    while (i < b.length && b[i] === 0xff) i++ // padding between segments: removed
    if (i >= b.length) throw invalid('JPEG truncado')
    const m = b[i++]
    if (m === 0xd9) {
      if (!sof || scans === 0) throw invalid('JPEG sem quadro ou sem dados')
      output.push(Buffer.from([0xff, 0xd9]))
      break // everything after EOI is removed (that is where the most common "polyglot" lives)
    }
    if (m === 0x00 || m === 0x01 || (m >= 0xd0 && m <= 0xd8)) throw invalid('JPEG com marcador fora de lugar')
    if (i + 2 > b.length) throw invalid('JPEG truncado no tamanho de um segmento')
    const length = b.readUInt16BE(i)
    if (length < 2 || i + length > b.length) throw invalid('JPEG com segmento truncado')
    const segment = b.subarray(i - 2, i + length)
    const data = b.subarray(i + 2, i + length)
    i += length
    if (isApp(m) || m === 0xfe) continue // EXIF, GPS, thumbnail, XMP, ICC, Adobe, MPF, comment: removed
    if (ACCEPTED_SOF.has(m)) {
      if (sof) throw invalid('JPEG com mais de um quadro')
      if (data.length < 6) throw invalid('JPEG com quadro curto')
      const precision = data[0]
      const height = data.readUInt16BE(1)
      const width = data.readUInt16BE(3)
      const comps = data[5]
      if (precision !== 8) throw invalid('JPEG que não é de 8 bits')
      if (comps !== 1 && comps !== 3) throw invalid('JPEG CMYK ou com componentes fora do comum')
      if (data.length !== 6 + 3 * comps) throw invalid('JPEG com quadro de tamanho errado')
      if (height === 0) throw invalid('JPEG com altura indefinida')
      sof = { largura: width, altura: height }
      output.push(segment)
      continue
    }
    if (JPEG_KEPT.has(m)) { output.push(segment); continue }
    if (m === 0xda) {
      if (!sof) throw invalid('JPEG com dados antes do quadro')
      output.push(segment)
      // Compressed data: runs to the next marker that is neither 0xFF00 (an escaped byte) nor RSTn.
      const home = i
      for (;;) {
        if (i + 1 >= b.length) throw invalid('JPEG truncado nos dados comprimidos')
        if (b[i] === 0xff) {
          const n = b[i + 1]
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { i += 2; continue }
          break
        }
        i++
      }
      output.push(b.subarray(home, i))
      scans++
      continue
    }
    throw invalid('JPEG com segmento não aceito (sem perda, aritmético, hierárquico ou desconhecido)')
  }
  if (!sof) throw invalid('JPEG sem quadro')
  return { bytes: Buffer.concat(output), largura: sof.largura, altura: sof.altura }
}

// ---------- PNG ----------

const PNG_DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
const PNG_ANIMATION = new Set(['acTL', 'fcTL', 'fdAT'])

function cleanPng(b) {
  const output = [PNG_SIGNATURE]
  let i = 8
  let ihdr = null
  let plte = false
  let trns = false
  let idat = 0 // 0 = not yet seen, 1 = in progress, 2 = finished (another chunk came after)
  let end = false
  while (!end) {
    if (i + 12 > b.length) throw invalid('PNG truncado')
    const length = b.readUInt32BE(i)
    const type = ascii(b, i + 4, 4)
    if (length > b.length - i - 12) throw invalid('PNG com chunk truncado')
    if (!/^[A-Za-z]{4}$/.test(type)) throw invalid('PNG com nome de chunk inválido')
    const chunk = b.subarray(i, i + 12 + length)
    const data = b.subarray(i + 8, i + 8 + length)
    if (crc32(b.subarray(i + 4, i + 8 + length)) !== b.readUInt32BE(i + 8 + length)) throw invalid('PNG com CRC errado')
    i += 12 + length
    if (PNG_ANIMATION.has(type)) throw new Refusal('formato_nao_aceito', 'PNG animado (APNG) não é aceito')
    if (!ihdr && type !== 'IHDR') throw invalid('PNG que não começa pelo IHDR')
    if (idat === 1 && type !== 'IDAT') idat = 2
    switch (type) {
      case 'IHDR': {
        if (ihdr || length !== 13) throw invalid('PNG com IHDR repetido ou de tamanho errado')
        const width = data.readUInt32BE(0)
        const height = data.readUInt32BE(4)
        const prof = data[8]
        const color = data[9]
        if (!PNG_DEPTHS[color]?.includes(prof)) throw invalid('PNG com profundidade e tipo de cor que não combinam')
        if (data[10] !== 0 || data[11] !== 0 || data[12] > 1) throw invalid('PNG com compressão, filtro ou entrelaçamento desconhecido')
        checkDimensions(width, height)
        ihdr = { largura: width, altura: height, cor: color }
        output.push(chunk)
        break
      }
      case 'PLTE':
        if (plte || idat || color0Or4(ihdr) || length === 0 || length % 3 !== 0 || length > 768) throw invalid('PNG com paleta fora de lugar')
        plte = true
        output.push(chunk)
        break
      case 'tRNS':
        if (trns || idat || (ihdr.cor === 3 && !plte) || ihdr.cor === 4 || ihdr.cor === 6) throw invalid('PNG com transparência fora de lugar')
        trns = true
        output.push(chunk)
        break
      case 'IDAT':
        if (idat === 2) throw invalid('PNG com dados de imagem separados')
        if (ihdr.cor === 3 && !plte) throw invalid('PNG de paleta sem paleta')
        idat = 1
        output.push(chunk)
        break
      case 'IEND':
        if (!idat || length !== 0) throw invalid('PNG sem dados de imagem')
        output.push(chunk)
        end = true // everything after IEND is removed
        break
      default:
        // Unknown critical chunk (first letter uppercase): there is no way to guarantee what it is. Ancillary: removed.
        if (type.charCodeAt(0) < 0x61) throw invalid('PNG com chunk crítico desconhecido')
    }
  }
  return { bytes: Buffer.concat(output), largura: ihdr.largura, altura: ihdr.altura }
}
const color0Or4 = (ihdr) => ihdr.cor === 0 || ihdr.cor === 4

// ---------- WebP ----------

const WEBP_ANIMATION = new Set(['ANIM', 'ANMF'])
const BIT_ALFA_VP8X = 0x10
const VP8X_ANIMATION_BIT = 0x02

function vp8Dimensions(data) {
  if (data.length < 10) throw invalid('WebP com quadro VP8 curto')
  if ((data[0] & 1) !== 0) throw invalid('WebP com quadro VP8 que não é chave')
  if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) throw invalid('WebP com quadro VP8 sem código de início')
  return { largura: data.readUInt16LE(6) & 0x3fff, altura: data.readUInt16LE(8) & 0x3fff }
}

function vp8lDimensions(data) {
  if (data.length < 5 || data[0] !== 0x2f) throw invalid('WebP sem assinatura VP8L')
  const v = data.readUInt32LE(1)
  if (v >>> 29 !== 0) throw invalid('WebP VP8L de versão desconhecida')
  return { largura: (v & 0x3fff) + 1, altura: ((v >>> 14) & 0x3fff) + 1 }
}

function cleanWebp(b) {
  const riffSize = b.readUInt32LE(4)
  if (riffSize < 4 || riffSize % 2 !== 0 || 8 + riffSize > b.length) throw invalid('WebP truncado ou com tamanho torto')
  const riffEnd = 8 + riffSize // what comes after is removed
  let i = 12
  let vp8x = null
  let alpha = null
  let frame = null
  let dims = null
  while (i < riffEnd) {
    if (i + 8 > riffEnd) throw invalid('WebP com chunk truncado')
    const type = ascii(b, i, 4)
    const length = b.readUInt32LE(i + 4)
    const withPad = length + (length & 1)
    if (length > riffEnd - i - 8 || i + 8 + withPad > riffEnd) throw invalid('WebP com chunk truncado')
    const data = b.subarray(i + 8, i + 8 + length)
    const first = i === 12
    i += 8 + withPad
    if (WEBP_ANIMATION.has(type)) throw new Refusal('formato_nao_aceito', 'WebP animado não é aceito')
    switch (type) {
      case 'VP8X': {
        if (!first || length !== 10) throw invalid('WebP com VP8X fora de lugar')
        if (data[0] & VP8X_ANIMATION_BIT) throw new Refusal('formato_nao_aceito', 'WebP animado não é aceito')
        vp8x = { alfa: (data[0] & BIT_ALFA_VP8X) !== 0, largura: data.readUIntLE(4, 3) + 1, altura: data.readUIntLE(7, 3) + 1 }
        break
      }
      case 'ALPH':
        if (!vp8x || alpha || frame) throw invalid('WebP com transparência fora de lugar')
        alpha = data
        break
      case 'VP8 ':
      case 'VP8L':
        if (frame) throw invalid('WebP com mais de um quadro')
        if (!first && !vp8x) throw invalid('WebP com quadro fora de lugar')
        frame = { tipo: type, dados: data }
        dims = type === 'VP8 ' ? vp8Dimensions(data) : vp8lDimensions(data)
        break
      default:
        if (!vp8x && frame) break // simple format: whatever comes after the frame is removed
        if (!vp8x) throw invalid('WebP sem quadro no começo')
      // EXIF, XMP, ICCP and unknown ones: removed
    }
  }
  if (!frame) throw invalid('WebP sem quadro')
  if (alpha && frame.tipo !== 'VP8 ') throw invalid('WebP com transparência separada num quadro sem perda')
  if (vp8x && (vp8x.largura !== dims.largura || vp8x.altura !== dims.altura)) throw invalid('WebP com tela de tamanho diferente do quadro')
  const chunk = (type, data) => {
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32LE(data.length, 4)
    return data.length & 1 ? [header, data, Buffer.alloc(1)] : [header, data]
  }
  const parts = []
  if (vp8x) {
    const x = Buffer.alloc(10)
    x[0] = vp8x.alfa ? BIT_ALFA_VP8X : 0
    x.writeUIntLE(dims.largura - 1, 4, 3)
    x.writeUIntLE(dims.altura - 1, 7, 3)
    parts.push(...chunk('VP8X', x))
    if (alpha) parts.push(...chunk('ALPH', alpha))
  }
  parts.push(...chunk(frame.tipo, frame.dados))
  const body = Buffer.concat(parts)
  const header = Buffer.alloc(12)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(body.length + 4, 4)
  header.write('WEBP', 8, 'ascii')
  return { bytes: Buffer.concat([header, body]), ...dims }
}

// ====================================================================================================
// `imagem` OBJECT
// ====================================================================================================

const ID_RE = /^ob_[A-Za-z0-9_-]{43}$/

export const IMAGE_BODY = closedObject({
  uso: one_of(IMAGE_USES),
  alvo: or_null(defaultValue(ID_RE, 'um id de objeto (ob_ e 43 caracteres)')),
  ordem: or_null(integer({ min: 0, max: MEDIA_LIMITS.anexosPorPostagem - 1 })),
  hash: defaultValue(MEDIA_HASH_RE, 'um SHA-256 em 64 caracteres hexadecimais minúsculos'),
  formato: one_of(IMAGE_FORMATS),
  largura: integer({ min: 1, max: MEDIA_LIMITS.ladoMaxPx }),
  altura: integer({ min: 1, max: MEDIA_LIMITS.ladoMaxPx }),
  bytes: integer({ min: 1, max: MEDIA_LIMITS.bytesMax }),
  alt: text({ ...MEDIA_LIMITS.alt, multilinha: false, urls: 0, v3: true })
})

/** Bodies of the media types (they only exist in `"v": "0.3"`). */
export const MEDIA_BODIES = Object.freeze({ imagem: IMAGE_BODY, video: VIDEO_BODY })

/** Rules between fields of the `imagem` object: an attachment carries a target and an order; a portrait and a cover (0.9.0) carry neither. */
export function mediaRules({ tipo: type, corpo: body }) {
  // 0.11.0 part 3: the `video` object has its own cross-field rule (video.js)
  if (type === 'video') return videoRules({ tipo: type, corpo: body })
  if (type !== 'imagem') return null
  if (body.uso === 'anexo') {
    if (body.alvo === null) return failure('objeto.corpo.alvo', 'o anexo precisa da postagem')
    if (body.ordem === null) return failure('objeto.corpo.ordem', 'o anexo precisa da ordem (0 a 3)')
    return null
  }
  if (body.alvo !== null) return failure('objeto.corpo.alvo', `o ${body.uso} não aponta para objeto`)
  if (body.ordem !== null) return failure('objeto.corpo.ordem', `o ${body.uso} não tem ordem`)
  return null
}

/** The body of an `imagem` object from the cleaning result. */
export const imageBody = (clean, { uso: usage, alvo: target = null, ordem: order = null, alt }) => ({
  uso: usage, alvo: target, ordem: order, hash: clean.hash, formato: clean.formato, largura: clean.largura, altura: clean.altura, bytes: clean.bytes.length, alt
})

/**
 * What the person's app checks before showing the approval screen: the bytes it will show are exactly those that the
 * object cites (SHA-256, size and format), and cleaning them changes nothing. Returns null when it checks out, or the reason.
 */
export function imageMatchesObject(bytes, object) {
  if (object?.tipo !== 'imagem') return 'o objeto não é uma imagem'
  const c = object.corpo
  if (!(bytes instanceof Uint8Array)) return 'faltam os bytes da imagem'
  if (mediaHash(bytes) !== c.hash) return 'os bytes não são os que o objeto cita'
  if (bytes.length !== c.bytes) return 'o tamanho não confere'
  const clean = cleanImage(bytes)
  if (!clean.ok || clean.hash !== c.hash) return 'a imagem não está limpa'
  if (clean.formato !== c.formato || clean.largura !== c.largura || clean.altura !== c.altura) return 'o formato ou as dimensões não conferem'
  return null
}

// ====================================================================================================
// UPLOAD CREDENTIAL
// ====================================================================================================

/** Domain prefix of the upload credential. Different from the read one: a credential never works for the other. */
export const UPLOAD_DOMAIN = domainOf('0.3', 'envio-de-midia')

const UPLOAD_RE = /^Rover-Envio uid=(rvr_[A-Za-z0-9_-]{22}), t=(\d{10}), a=([A-Za-z0-9_-]{86})$/
const uploadBytes = ({ metodo: method, alvo: target, t, uid }) => canonicalBytes({ alvo: target, metodo: method, t, uid })

/** The Authorization header of an upload. `alvo` is the path `/v1/midia/<hash>` exactly as it will be requested. */
export function createSendCredential({ chavePrivada: privateKey, uid, alvo: target, t, metodo: method = 'PUT' }) {
  return `Rover-Envio uid=${uid}, t=${t}, a=${signBytes(UPLOAD_DOMAIN, uploadBytes({ metodo: method, alvo: target, t, uid }), privateKey)}`
}

export function readUploadCredential(header) {
  const m = typeof header === 'string' ? UPLOAD_RE.exec(header) : null
  return m ? { uid: m[1], t: Number(m[2]), assinatura: m[3] } : null
}

export function uploadCredentialMatches(credential, { metodo: method, alvo: target, chave: key, agora: now }) {
  if (Math.abs(now - credential.t) > LIMITS.readToleranceS) return false
  return verifySignature(UPLOAD_DOMAIN, uploadBytes({ metodo: method, alvo: target, t: credential.t, uid: credential.uid }), credential.assinatura, key)
}
