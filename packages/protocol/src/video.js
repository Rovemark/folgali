// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.11.0 (proposal 0013): video. Everything the client and the relay must do THE SAME lives here:
//
//   - `inspectVideo(leitor)`: reads the CONTAINER from the bytes (never from the extension nor from the content-type), checks its
//     structure, the codecs, the duration and the size on screen, and lists the `remendos` (patches) that would make the file clean.
//     It never decodes a frame and never loads the media data: it reads box and element headers through a random-access reader, so a
//     50 MB file costs a few kilobytes of memory.
//   - `cleanVideo(bytes)`: applies the patches. Nothing moves inside the file: a metadata box becomes a `free` box of the same size
//     filled with zeros (MP4) or a `Void` element of the same size (WebM), so every offset the container keeps stays right. It is
//     deterministic and idempotent; the address of the video is the SHA-256 of the OUTPUT, and a clean file has no patch left.
//   - the body of the `video` object (closed schema) and its cross-field rules.
//
// Accepted: MP4 with ONE H.264 video track and at most one AAC audio track (the QuickTime brand is read as MP4: it is the same box
// structure, and it is what a phone hands over), and WebM with ONE VP8, VP9 or AV1 video track and at most one Opus or Vorbis track.
// Not accepted: fragmented MP4 (moof), HEVC, live WebM without sizes, subtitles, attachments, a second video track.
//
// What the cleaning does NOT guarantee: that the compressed data decodes, that it carries no hidden data (inside the media data, in
// codec user data such as H.264 SEI, in a `free` box), nor that the samples of a dropped track left the file: the track is gone from
// the index and its bytes stay, unreferenced, in the media data. The relay does not transcode. See PROTOCOL.md, section 20.
import { createHash } from 'node:crypto'
import { failure, integer, closedObject, or_null, defaultValue, text, one_of } from './schema.js'
import { MEDIA_HASH_RE, MEDIA_LIMITS } from './limits.js'

export const VIDEO_FORMATS = Object.freeze(['mp4', 'webm'])
export const VIDEO_MIME_TYPE = Object.freeze({ mp4: 'video/mp4', webm: 'video/webm' })
export const VIDEO_LIMITS = Object.freeze({
  bytesMax: 50 * 1048576,
  // up to 60 seconds: what is refused is a video whose whole seconds pass 60 (a phone's "1:00" is often 60.03 s)
  duracaoMaxS: 60,
  ladoMaxPx: 4096,
  videosPorPublicacao: 1,
  // how much of the file the index may take (the `moov` box, the WebM headers); bounds the memory of the inspection
  indexMaxBytes: 4 * 1048576,
  // the upload of a video stays pending this long, like an image
  pendenteS: 3600,
  defaultQuotaBytes: 20 * 1024 * 1048576
})

const CODECS = Object.freeze({
  mp4: Object.freeze({ video: Object.freeze(['avc1', 'avc3']), audio: Object.freeze(['mp4a']) }),
  webm: Object.freeze({ video: Object.freeze(['V_VP8', 'V_VP9', 'V_AV1']), audio: Object.freeze(['A_OPUS', 'A_VORBIS']) })
})
/** The names the object carries for a codec, whatever the container calls it. */
const CODEC_NAME = Object.freeze({ avc1: 'h264', avc3: 'h264', mp4a: 'aac', V_VP8: 'vp8', V_VP9: 'vp9', V_AV1: 'av1', A_OPUS: 'opus', A_VORBIS: 'vorbis' })
export const VIDEO_CODECS = Object.freeze(['h264', 'vp8', 'vp9', 'av1'])
export const AUDIO_CODECS = Object.freeze(['aac', 'opus', 'vorbis'])

class Refusal extends Error {
  constructor(code, detail) {
    super(detail)
    this.codigo = code
    this.detalhe = detail
  }
}
const invalid = (detail) => new Refusal('video_invalido', detail)
const format = (detail) => new Refusal('formato_nao_aceito', detail)

/** A random-access reader over bytes in memory. A file reader has the same two members (`tamanho`, `ler`). */
export function byteReader(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { tamanho: b.length, ler: (position, length) => b.subarray(position, Math.min(b.length, position + length)) }
}

const read = (reader, position, length) => {
  if (position < 0 || position + length > reader.tamanho) throw invalid('o arquivo acaba no meio de uma estrutura')
  const b = reader.ler(position, length)
  if (b.length !== length) throw invalid('o arquivo acaba no meio de uma estrutura')
  return b
}

/** `mp4`, `webm` or null, from the first bytes. */
export function videoFormatFromBytes(home) {
  if (home.length >= 12 && home.toString('latin1', 4, 8) === 'ftyp') return 'mp4'
  if (home.length >= 4 && home.readUInt32BE(0) === 0x1a45dfa3) return 'webm'
  return null
}

// ====================================================================================================
// MP4 (ISO base media file format)
// ====================================================================================================

const MP4_BRANDS = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4A ', 'MSNV', 'mmp4', 'qt  ', '3gp4', '3gp5'])
const NEUTRAL_TOP = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'])
const FRAGMENTED_TOP = new Set(['moof', 'mfra', 'sidx', 'styp', 'ssix', 'prft'])
const MP4_METADATA = new Set(['udta', 'meta', 'uuid'])
const TYPE_RE = /^[\x20-\x7e\xa9]{4}$/

/** The boxes between `inicio` and `fim`, tiling it exactly. `topo`: a size of 0 ("to the end of the file") is only valid there. */
function boxes(reader, home, end, top = false) {
  const list = []
  let p = home
  while (p < end) {
    if (end - p < 8) throw invalid('sobram bytes que não formam uma caixa')
    const header = read(reader, p, Math.min(16, end - p))
    let size = header.readUInt32BE(0)
    const type = header.toString('latin1', 4, 8)
    if (!TYPE_RE.test(type)) throw invalid('caixa com tipo que não é texto')
    let headerSize = 8
    if (size === 1) {
      if (header.length < 16) throw invalid('caixa grande sem o tamanho')
      const large = header.readBigUInt64BE(8)
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid('caixa com tamanho absurdo')
      size = Number(large)
      headerSize = 16
    } else if (size === 0) {
      if (!top) throw invalid(`caixa ${type} sem tamanho fora do topo`)
      size = end - p
    }
    if (size < headerSize || p + size > end) throw invalid(`caixa ${type} com tamanho errado`)
    list.push({ tipo: type, inicio: p, conteudo: p + headerSize, fim: p + size })
    if (list.length > 4096) throw invalid('caixas demais')
    p += size
  }
  return list
}

const onlyOne = (list, type, where) => {
  const found = list.filter((c) => c.tipo === type)
  if (found.length !== 1) throw invalid(`${where} precisa de exatamente uma caixa ${type}`)
  return found[0]
}

/** The patch that turns the box into a `free` box of the same size, filled with zeros. */
const release = (box) => [
  { posicao: box.inicio + 4, bytes: Buffer.from('free', 'latin1') },
  ...(box.fim > box.conteudo ? [{ posicao: box.conteudo, bytes: Buffer.alloc(box.fim - box.conteudo) }] : [])
]

/** The patches that zero the creation and modification times of a full box (mvhd, tkhd, mdhd). Returns the offset after them. */
function zeroDates(reader, box, patches) {
  const version = read(reader, box.conteudo, 1)[0]
  if (version > 1) throw invalid(`caixa ${box.tipo} de versão desconhecida`)
  const n = version === 1 ? 16 : 8
  const dates = read(reader, box.conteudo + 4, n)
  if (dates.some((x) => x !== 0)) patches.push({ posicao: box.conteudo + 4, bytes: Buffer.alloc(n) })
  return { versao: version, depois: box.conteudo + 4 + n }
}

function inspectMp4(reader) {
  const top = boxes(reader, 0, reader.tamanho, true)
  if (top.length > 64) throw invalid('caixas demais no topo')
  const ftyp = top[0]
  if (ftyp.tipo !== 'ftyp' || ftyp.fim - ftyp.conteudo < 8 || (ftyp.fim - ftyp.conteudo) % 4 !== 0 || ftyp.fim - ftyp.conteudo > 256) throw invalid('MP4 sem a caixa ftyp no começo')
  const marks = read(reader, ftyp.conteudo, ftyp.fim - ftyp.conteudo)
  const readItems = [marks.toString('latin1', 0, 4)]
  for (let i = 8; i < marks.length; i += 4) readItems.push(marks.toString('latin1', i, i + 4))
  if (!readItems.some((m) => MP4_BRANDS.has(m))) throw format('o arquivo se declara de uma família que não é MP4')
  const patches = []
  for (const c of top) {
    if (FRAGMENTED_TOP.has(c.tipo)) throw format('MP4 fragmentado (moof) não é aceito: exporte como MP4 comum')
    if (MP4_METADATA.has(c.tipo)) patches.push(...release(c))
    else if (!NEUTRAL_TOP.has(c.tipo)) throw invalid(`caixa ${c.tipo} que o protocolo não conhece`)
  }
  if (!top.some((c) => c.tipo === 'mdat' && c.fim > c.conteudo)) throw invalid('MP4 sem dados de mídia (mdat)')
  const moov = onlyOne(top, 'moov', 'o MP4')
  if (moov.fim - moov.inicio > VIDEO_LIMITS.indexMaxBytes) throw invalid('o índice do MP4 (moov) é grande demais')
  const inside = boxes(reader, moov.conteudo, moov.fim)
  if (inside.some((c) => c.tipo === 'mvex')) throw format('MP4 fragmentado (mvex) não é aceito: exporte como MP4 comum')
  const mvhd = onlyOne(inside, 'mvhd', 'o moov')
  const { versao: version, depois: after } = zeroDates(reader, mvhd, patches)
  const time = read(reader, after, version === 1 ? 12 : 8)
  const scale = time.readUInt32BE(0)
  const duration = version === 1 ? Number(time.readBigUInt64BE(4)) : time.readUInt32BE(4)
  if (scale === 0 || duration === 0 || (version === 0 && duration === 0xffffffff)) throw invalid('MP4 sem duração declarada')
  const durationMs = Math.round((duration * 1000) / scale)

  let video = null
  let audio = null
  for (const c of inside) {
    if (MP4_METADATA.has(c.tipo)) { patches.push(...release(c)); continue }
    if (c.tipo !== 'trak') continue
    const parts = boxes(reader, c.conteudo, c.fim)
    const mdia = onlyOne(parts, 'mdia', 'a trilha')
    const media = boxes(reader, mdia.conteudo, mdia.fim)
    const hdlr = onlyOne(media, 'hdlr', 'a trilha')
    const handler = read(reader, hdlr.conteudo + 8, 4).toString('latin1')
    if (handler !== 'vide' && handler !== 'soun') { patches.push(...release(c)); continue } // timed metadata, timecode, subtitles: out
    const fromTrack = []
    for (const p of parts) if (MP4_METADATA.has(p.tipo)) fromTrack.push(...release(p))
    for (const p of media) if (MP4_METADATA.has(p.tipo)) fromTrack.push(...release(p))
    const tkhd = onlyOne(parts, 'tkhd', 'a trilha')
    const t = zeroDates(reader, tkhd, fromTrack)
    zeroDates(reader, onlyOne(media, 'mdhd', 'a trilha'), fromTrack)
    const minf = boxes(reader, onlyOne(media, 'minf', 'a trilha').conteudo, onlyOne(media, 'minf', 'a trilha').fim)
    const stbl = boxes(reader, onlyOne(minf, 'stbl', 'a trilha').conteudo, onlyOne(minf, 'stbl', 'a trilha').fim)
    const stsd = onlyOne(stbl, 'stsd', 'a trilha')
    if (stsd.fim - stsd.conteudo < 16) throw invalid('descrição de amostra curta demais')
    const description = read(reader, stsd.conteudo, 16)
    if (description.readUInt32BE(4) !== 1) throw format('cada trilha precisa de exatamente um formato de amostra')
    const codec = description.toString('latin1', 12, 16)
    patches.push(...fromTrack)
    if (handler === 'vide') {
      if (video) throw format('o vídeo precisa de exatamente uma trilha de vídeo')
      if (!CODECS.mp4.video.includes(codec)) throw format(`o vídeo MP4 precisa ser H.264 (veio ${TYPE_RE.test(codec) ? codec.trim() : 'outro codec'})`)
      // tkhd: after the times come track id (4), reserved (4), duration (4 or 8), reserved (8), layer, group, volume, reserved (8),
      // the matrix (36) and the size on screen in 16.16 fixed point
      const base = t.depois + 8 + (t.versao === 1 ? 8 : 4) + 16
      const end = read(reader, base, 44)
      const [a, d] = [end.readInt32BE(0), end.readInt32BE(16)]
      const [w, h] = [end.readUInt32BE(36) >>> 16, end.readUInt32BE(40) >>> 16]
      // a quarter turn (the phone held upright) swaps what the screen shows
      video = { codec, ...(a === 0 && d === 0 ? { largura: h, altura: w } : { largura: w, altura: h }) }
    } else {
      if (audio) throw format('o vídeo aceita no máximo uma trilha de áudio')
      if (!CODECS.mp4.audio.includes(codec)) throw format(`o áudio do MP4 precisa ser AAC (veio ${TYPE_RE.test(codec) ? codec.trim() : 'outro codec'})`)
      audio = { codec }
    }
  }
  if (!video) throw format('o arquivo não tem trilha de vídeo')
  return { formato: 'mp4', duracaoMs: durationMs, largura: video.largura, altura: video.altura, videoCodec: CODEC_NAME[video.codec], audioCodec: audio ? CODEC_NAME[audio.codec] : null, patches }
}

// ====================================================================================================
// WebM (EBML)
// ====================================================================================================

const ID = Object.freeze({
  ebml: 0x1a45dfa3, docType: 0x4282, segment: 0x18538067, seekHead: 0x114d9b74, info: 0x1549a966, tracks: 0x1654ae6b, cues: 0x1c53bb6b,
  cluster: 0x1f43b675, tags: 0x1254c367, attachments: 0x1941a469, chapters: 0x1043a770, void: 0xec, crc: 0xbf,
  timecodeScale: 0x2ad7b1, duration: 0x4489, title: 0x7ba9, dateUtc: 0x4461, segmentFilename: 0x7384, prevFilename: 0x3c83ab, nextFilename: 0x3e83bb,
  trackEntry: 0xae, trackType: 0x83, codecId: 0x86, trackName: 0x536e, video: 0xe0, pixelWidth: 0xb0, pixelHeight: 0xba
})
const NEUTRAL_SEGMENT = new Set([ID.seekHead, ID.info, ID.tracks, ID.cues, ID.cluster, ID.void, ID.crc])
const METADATA_SEGMENT = new Set([ID.tags, ID.attachments, ID.chapters])
const METADATA_INFO = new Set([ID.title, ID.dateUtc, ID.segmentFilename, ID.prevFilename, ID.nextFilename])

/** One EBML element header at `p`: the id (with its marker), the size (null when "unknown") and where the payload starts. */
function element(reader, p, end) {
  if (end - p < 2) throw invalid('sobram bytes que não formam um elemento')
  const header = read(reader, p, Math.min(12, end - p))
  const nId = Math.clz32(header[0]) - 23
  if (nId < 1 || nId > 4 || header.length < nId + 1) throw invalid('elemento com identificador inválido')
  let id = 0
  for (let i = 0; i < nId; i++) id = id * 256 + header[i]
  const nSize = Math.clz32(header[nId]) - 23
  if (nSize < 1 || nSize > 8 || header.length < nId + nSize) throw invalid('elemento com tamanho inválido')
  let size = header[nId] & (0xff >> nSize)
  let allOnes = size === (0xff >> nSize)
  for (let i = 1; i < nSize; i++) {
    size = size * 256 + header[nId + i]
    allOnes &&= header[nId + i] === 0xff
  }
  const content = p + nId + nSize
  if (allOnes) return { id, inicio: p, conteudo: content, fim: null }
  if (!Number.isSafeInteger(size) || content + size > end) throw invalid('elemento com tamanho errado')
  return { id, inicio: p, conteudo: content, fim: content + size }
}

function elements(reader, home, end) {
  const list = []
  let p = home
  while (p < end) {
    const e = element(reader, p, end)
    if (e.fim === null) throw format('WebM de transmissão ao vivo (elemento sem tamanho) não é aceito: grave num arquivo e envie o arquivo')
    list.push(e)
    if (list.length > 65536) throw invalid('elementos demais')
    p = e.fim
  }
  return list
}

/** The patch that turns the element into a `Void` element of the same total size. */
function toVoid(e) {
  const total = e.fim - e.inicio
  if (total < 2) throw invalid('elemento pequeno demais para anular')
  const b = Buffer.alloc(total)
  b[0] = ID.void
  if (total - 2 <= 126) b[1] = 0x80 | (total - 2)
  else {
    // an 8-byte size: marker 0x01 and 56 bits
    if (total < 9) throw invalid('elemento de tamanho que não cabe num Void')
    b[1] = 0x01
    b.writeUIntBE(total - 9, 3, 6)
  }
  return { posicao: e.inicio, bytes: b }
}

const unsignedInt = (b) => {
  if (b.length < 1 || b.length > 6) throw invalid('número com tamanho inesperado')
  return b.readUIntBE(0, b.length)
}

function inspectWebm(reader) {
  const headerSize = element(reader, 0, reader.tamanho)
  if (headerSize.id !== ID.ebml || headerSize.fim === null || headerSize.fim - headerSize.conteudo > 256) throw invalid('WebM sem o cabeçalho EBML')
  const type = elements(reader, headerSize.conteudo, headerSize.fim).find((e) => e.id === ID.docType)
  if (!type || read(reader, type.conteudo, type.fim - type.conteudo).toString('latin1').replace(/\0+$/, '') !== 'webm') throw format('o arquivo é Matroska e não se declara WebM')
  const segment = element(reader, headerSize.fim, reader.tamanho)
  if (segment.id !== ID.segment) throw invalid('WebM sem o segmento')
  if (segment.fim === null) throw format('WebM de transmissão ao vivo (segmento sem tamanho) não é aceito: grave num arquivo e envie o arquivo')
  if (segment.fim !== reader.tamanho) throw invalid('sobram bytes depois do segmento do WebM')
  const patches = []
  let info = null
  let tracksEl = null
  let groups = 0
  let index = 0
  for (const e of elements(reader, segment.conteudo, segment.fim)) {
    if (METADATA_SEGMENT.has(e.id)) { patches.push(toVoid(e)); continue }
    if (!NEUTRAL_SEGMENT.has(e.id)) throw invalid('WebM com um elemento que o protocolo não conhece')
    if (e.id === ID.cluster) { groups++; continue }
    if (e.id !== ID.void) index += e.fim - e.inicio
    if (e.id === ID.info) { if (info) throw invalid('WebM com duas descrições do segmento'); info = e }
    if (e.id === ID.tracks) { if (tracksEl) throw invalid('WebM com duas listas de trilhas'); tracksEl = e }
  }
  if (!info || !tracksEl || groups === 0) throw invalid('WebM sem descrição, sem trilhas ou sem dados de mídia')
  if (index > VIDEO_LIMITS.indexMaxBytes) throw invalid('o índice do WebM é grande demais')

  let scale = 1_000_000
  let duration = null
  for (const e of elements(reader, info.conteudo, info.fim)) {
    if (METADATA_INFO.has(e.id)) patches.push(toVoid(e))
    else if (e.id === ID.timecodeScale) scale = unsignedInt(read(reader, e.conteudo, e.fim - e.conteudo))
    else if (e.id === ID.duration) {
      const b = read(reader, e.conteudo, e.fim - e.conteudo)
      if (b.length !== 4 && b.length !== 8) throw invalid('duração do WebM em formato inesperado')
      duration = b.length === 4 ? b.readFloatBE(0) : b.readDoubleBE(0)
    }
  }
  if (duration === null || !Number.isFinite(duration) || duration <= 0 || scale <= 0) throw format('WebM sem duração declarada: é o que um gravador de navegador produz; passe o arquivo por um conversor antes de enviar')
  const durationMs = Math.round((duration * scale) / 1_000_000)

  let video = null
  let audio = null
  for (const trail of elements(reader, tracksEl.conteudo, tracksEl.fim)) {
    if (trail.id === ID.void || trail.id === ID.crc) continue
    if (trail.id !== ID.trackEntry) throw invalid('lista de trilhas do WebM com um elemento inesperado')
    const fields = elements(reader, trail.conteudo, trail.fim)
    const field = (id) => fields.find((c) => c.id === id)
    const trackType = field(ID.trackType)
    const codecId = field(ID.codecId)
    if (!trackType || !codecId) throw invalid('trilha do WebM sem tipo ou sem codec')
    const which = unsignedInt(read(reader, trackType.conteudo, trackType.fim - trackType.conteudo))
    const codec = read(reader, codecId.conteudo, Math.min(32, codecId.fim - codecId.conteudo)).toString('latin1').replace(/\0+$/, '')
    for (const c of fields) if (c.id === ID.trackName) patches.push(toVoid(c))
    if (which === 1) {
      if (video) throw format('o vídeo precisa de exatamente uma trilha de vídeo')
      if (!CODECS.webm.video.includes(codec)) throw format('o vídeo WebM precisa ser VP8, VP9 ou AV1')
      const frame = field(ID.video)
      if (!frame) throw invalid('trilha de vídeo do WebM sem o tamanho da imagem')
      const dims = elements(reader, frame.conteudo, frame.fim)
      const measure = (id) => {
        const e = dims.find((c) => c.id === id)
        if (!e) throw invalid('trilha de vídeo do WebM sem o tamanho da imagem')
        return unsignedInt(read(reader, e.conteudo, e.fim - e.conteudo))
      }
      video = { codec, largura: measure(ID.pixelWidth), altura: measure(ID.pixelHeight) }
    } else if (which === 2) {
      if (audio) throw format('o vídeo aceita no máximo uma trilha de áudio')
      if (!CODECS.webm.audio.includes(codec)) throw format('o áudio do WebM precisa ser Opus ou Vorbis')
      audio = { codec }
    } else throw format('o WebM só pode ter trilha de vídeo e de áudio (legenda e outras trilhas não são aceitas)')
  }
  if (!video) throw format('o arquivo não tem trilha de vídeo')
  return { formato: 'webm', duracaoMs: durationMs, largura: video.largura, altura: video.altura, videoCodec: CODEC_NAME[video.codec], audioCodec: audio ? CODEC_NAME[audio.codec] : null, patches }
}

// ====================================================================================================
// INSPECTION AND CLEANING
// ====================================================================================================

/**
 * Reads the container and says what the video is, or why it is refused. `remendos` is what `cleanVideo` would write: a clean file
 * has none. Never throws on bad bytes: every refusal comes back as `{ ok: false, codigo, detalhe }`.
 * @param {{ tamanho: number, ler: (posicao: number, comprimento: number) => Uint8Array }} leitor
 * @returns {{ ok: true, formato: 'mp4' | 'webm', duracaoMs: number, largura: number, altura: number, videoCodec: string, audioCodec: string | null,
 *   bytes: number, remendos: { posicao: number, bytes: Buffer }[] } | { ok: false, codigo: string, detalhe: string }}
 */
export function inspectVideo(reader) {
  try {
    if (!reader || !Number.isSafeInteger(reader.tamanho) || typeof reader.ler !== 'function') throw invalid('faltam os bytes do vídeo')
    if (reader.tamanho > VIDEO_LIMITS.bytesMax) throw new Refusal('video_grande', `o vídeo tem ${(reader.tamanho / 1048576).toFixed(1)} MB e o máximo é ${VIDEO_LIMITS.bytesMax / 1048576} MB`)
    if (reader.tamanho < 32) throw format('o arquivo é pequeno demais para ser um vídeo')
    const type = videoFormatFromBytes(Buffer.from(read(reader, 0, 12)))
    if (!type) throw format('só MP4 (H.264 e AAC) e WebM (VP8, VP9 ou AV1, com Opus ou Vorbis) são aceitos, conferidos pelos bytes')
    const r = type === 'mp4' ? inspectMp4(reader) : inspectWebm(reader)
    if (Math.floor(r.duracaoMs / 1000) > VIDEO_LIMITS.duracaoMaxS) throw new Refusal('video_longo', `o vídeo tem ${Math.round(r.duracaoMs / 1000)} segundos e o máximo é ${VIDEO_LIMITS.duracaoMaxS}`)
    if (r.duracaoMs < 1) throw invalid('vídeo sem duração')
    if (r.largura < 1 || r.altura < 1) throw invalid('vídeo sem tamanho de imagem')
    if (r.largura > VIDEO_LIMITS.ladoMaxPx || r.altura > VIDEO_LIMITS.ladoMaxPx) throw new Refusal('dimensoes_grandes', `o vídeo tem ${r.largura} por ${r.altura} pixels e o lado máximo é ${VIDEO_LIMITS.ladoMaxPx}`)
    return { ok: true, ...r, bytes: reader.tamanho }
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, codigo: e.codigo, detalhe: e.detalhe }
    if (e instanceof RangeError) return { ok: false, codigo: 'video_invalido', detalhe: 'o arquivo tem uma estrutura quebrada' }
    throw e
  }
}

/** SHA-256 in 64 lowercase hexadecimal characters (the same address rule as an image). */
const hashOf = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * Cleans a video held in memory: applies the patches on a COPY and returns it with its description and its address.
 * @param {Uint8Array} entrada
 * @returns {{ ok: true, bytes: Buffer, hash: string, formato: string, duracaoMs: number, largura: number, altura: number, videoCodec: string,
 *   audioCodec: string | null, mudou: boolean } | { ok: false, codigo: string, detalhe: string }}
 */
export function cleanVideo(input) {
  if (!(input instanceof Uint8Array)) return { ok: false, codigo: 'video_invalido', detalhe: 'faltam os bytes do vídeo' }
  const r = inspectVideo(byteReader(input))
  if (!r.ok) return r
  const { patches, bytes: _size, ok: _ok, ...description } = r
  const output = Buffer.from(input)
  for (const patch of patches) patch.bytes.copy(output, patch.posicao)
  if (patches.length) {
    // the output must read the same and have nothing left to patch: a file the cleaning cannot settle is refused, not half cleaned
    const again = inspectVideo(byteReader(output))
    if (!again.ok || again.patches.length) return { ok: false, codigo: 'video_invalido', detalhe: 'a limpeza não conseguiu deixar o vídeo sem metadado' }
  }
  return { ok: true, bytes: output, hash: hashOf(output), ...description, mudou: patches.length > 0 }
}

// ====================================================================================================
// THE `video` OBJECT
// ====================================================================================================

const ID_RE = /^ob_[A-Za-z0-9_-]{43}$/
const hash = defaultValue(MEDIA_HASH_RE, 'um SHA-256 em 64 caracteres hexadecimais minúsculos')

/**
 * The body of a `video` object. Always an attachment: `alvo` is the publication it belongs to (one video per publication, and a
 * publication has images OR a video). `miniatura` is the hash of an image the author uploaded as the poster frame (the relay does
 * not transcode nor extract frames; the client draws the frame and sends it), or null.
 */
export const VIDEO_BODY = closedObject({
  alvo: defaultValue(ID_RE, 'um id de objeto (ob_ e 43 caracteres)'),
  hash,
  formato: one_of(VIDEO_FORMATS),
  largura: integer({ min: 1, max: VIDEO_LIMITS.ladoMaxPx }),
  altura: integer({ min: 1, max: VIDEO_LIMITS.ladoMaxPx }),
  bytes: integer({ min: 1, max: VIDEO_LIMITS.bytesMax }),
  duracaoMs: integer({ min: 1, max: (VIDEO_LIMITS.duracaoMaxS + 1) * 1000 - 1 }),
  miniatura: or_null(hash),
  alt: text({ ...MEDIA_LIMITS.alt, multilinha: false, urls: 0, v3: true })
})

export function videoRules({ tipo: type, corpo: body }) {
  if (type !== 'video') return null
  if (body.miniatura !== null && body.miniatura === body.hash) return failure('objeto.corpo.miniatura', 'a miniatura é uma imagem, não o próprio vídeo')
  return null
}

/** The body of a `video` object from the result of the cleaning. */
export const videoBody = (clean, { alvo: target, miniatura: thumbnail = null, alt = '' }) => ({
  alvo: target, hash: clean.hash, formato: clean.formato, largura: clean.largura, altura: clean.altura, bytes: clean.bytes.length, duracaoMs: clean.duracaoMs, miniatura: thumbnail, alt
})
