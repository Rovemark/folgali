// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.5.0 (proposal 0005): image cleaning, the `imagem` object and the upload credential, in the protocol.
// What is proven here: the format comes from the BYTES; SVG, GIF, APNG and animated WebP are refused; the GPS, EXIF and XMP bytes,
// the thumbnail and the comments do not survive; nothing after the end of the image survives (polyglot); a truncated file never
// passes or crashes the process; the pixel and byte caps hold; cleaning is idempotent and the hash is the one of the clean bytes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  UPLOAD_DOMAIN, MEDIA_LIMITS, signBytes, canonicalBytes, imageBody, uploadCredentialMatches, createSendCredential,
  createReadCredential, createObject, domainOf, objectDomain, formatFromBytes, mediaHash, imageMatchesObject,
  readUploadCredential, readReadCredential, cleanImage, validateObject, typeExistsInVersion, REQUIRES_APPROVAL, REQUIRABLE_TYPES_V3,
  AUTHORIZABLE_TYPES_V3, AUTHORIZATION_VERSIONS, requiresApproval, generateKeyPair, authorizableTypesOf
} from '../../packages/protocol/src/index.js'
import * as A from '../helpers/image-samples.js'
import { chunkPng, syntheticPng } from '../helpers/media.js'
import { NOW, newUid } from '../helpers/world.js'

// The coordinate bytes exiftool wrote (latitude 23/1, 33/1, 1053/25; longitude starts at 46/1, 39/1), in big-endian.
const rational = (n, d) => { const b = Buffer.alloc(8); b.writeUInt32BE(n, 0); b.writeUInt32BE(d, 4); return b }
const LATITUDE = Buffer.concat([rational(23, 1), rational(33, 1), rational(1053, 25)])
const LONGITUDE = Buffer.concat([rational(46, 1), rational(39, 1)])
const METADATA_MARKS = ['Exif\0\0', 'FabricanteTeste', 'AparelhoTeste', 'PessoaTeste', '<script', '<html', 'http://ns.adobe.com', 'eXIf', 'tEXt', 'zTXt', 'iTXt', 'EXIF', 'XMP ', 'ICCP', 'iCCP']

const VALID = {
  'JPEG com EXIF, GPS, XMP, comentário e miniatura': [A.gps_jpg, 'jpeg', 16, 12],
  'JPEG progressivo': [A.prog_jpg, 'jpeg', 16, 12],
  'PNG com eXIf e comentário em HTML': [A.gps_png, 'png', 8, 8],
  'PNG com transparência': [A.alpha_png, 'png', 8, 8],
  'WebP com perda e EXIF': [A.gps_webp, 'webp', 8, 8],
  'WebP sem perda': [A.lossless_webp, 'webp', 8, 8],
  'WebP com transparência (VP8X e ALPH)': [A.alpha_webp, 'webp', 8, 8]
}

for (const [name, [bytes, format, width, height]] of Object.entries(VALID)) {
  test(`${name}: accepts, measures from the headers, cleans and is idempotent`, () => {
    const r = cleanImage(bytes)
    assert.equal(r.ok, true, r.detalhe)
    assert.deepEqual([r.formato, r.largura, r.altura], [format, width, height])
    assert.equal(r.hash, mediaHash(r.bytes))
    assert.match(r.hash, /^[0-9a-f]{64}$/)
    assert.ok(r.bytes.length <= bytes.length)
    const of2 = cleanImage(r.bytes)
    assert.equal(of2.ok, true)
    assert.ok(of2.bytes.equals(r.bytes), 'cleaning what is already clean changes nothing')
    assert.equal(formatFromBytes(r.bytes), format)
    for (const brand of METADATA_MARKS) assert.equal(r.bytes.includes(Buffer.from(brand, 'latin1')), false, `left over ${JSON.stringify(brand)}`)
  })
}

test('the GPS bytes were in the samples and do NOT survive cleaning (JPEG, PNG and WebP)', () => {
  for (const sample of [A.gps_jpg, A.gps_png, A.gps_webp]) {
    assert.ok(sample.includes(LATITUDE) && sample.includes(LONGITUDE), 'the sample has GPS (without it the test would prove nothing)')
    const r = cleanImage(sample)
    assert.equal(r.ok, true)
    assert.equal(r.bytes.includes(LATITUDE), false, 'latitude survived')
    assert.equal(r.bytes.includes(LONGITUDE), false, 'longitude survived')
  }
})

test('JPEG: the embedded thumbnail (a second JPEG inside the EXIF) is removed, and only one image start remains', () => {
  const starts = (b) => { let n = 0; for (let i = 0; i < b.length - 2; i++) if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff) n++; return n }
  assert.ok(starts(A.gps_jpg) >= 2, 'the sample has a thumbnail')
  assert.equal(starts(cleanImage(A.gps_jpg).bytes), 1)
})

test('JPEG: APP2 (ICC color profile), APP14 (Adobe) and COM disappear; padding between segments too', () => {
  const segment = (m, content) => { const d = Buffer.from(content, 'latin1'); const c = Buffer.from([0xff, m, 0, 0]); c.writeUInt16BE(d.length + 2, 2); return Buffer.concat([c, d]) }
  const base = cleanImage(A.prog_jpg).bytes
  const dirty = Buffer.concat([base.subarray(0, 2), segment(0xe2, 'ICC_PROFILE\0perfil-suspeito'), segment(0xee, 'Adobe-com-coisa'), Buffer.from([0xff, 0xff]), segment(0xfe, '<html>poliglota</html>'), base.subarray(2)])
  const r = cleanImage(dirty)
  assert.equal(r.ok, true, r.detalhe)
  assert.ok(r.bytes.equals(base), 'comes out equal to the version without the segments')
})

test('format from the bytes, never from the name: SVG, HTML, XML, GIF (still and animated), APNG, animated WebP, empty and garbage are refused', () => {
  const cases = {
    svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    'svg com xml': Buffer.from('<?xml version="1.0"?><svg/>'),
    html: Buffer.from('<!doctype html><img src=x onerror=alert(1)>'),
    gif: A.g_gif,
    'gif animado': A.anim_gif,
    apng: A.anim_png,
    'webp animado': A.anim_webp,
    vazio: Buffer.alloc(0),
    lixo: Buffer.from('não é imagem nenhuma'),
    'bmp': Buffer.from('BM\0\0\0\0\0\0\0\0'),
    'pdf': Buffer.from('%PDF-1.7\n')
  }
  for (const [name, b] of Object.entries(cases)) {
    const r = cleanImage(b)
    assert.equal(r.ok, false, name)
    assert.equal(r.codigo, 'formato_nao_aceito', `${name}: ${r.detalhe}`)
  }
})

test('polyglot: what comes after the end of the image (ZIP, HTML, script) is removed, and the result equals that of the image without the attachment', () => {
  const zip = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from('conteudo-de-zip<script>alert(1)</script>')])
  const cases = [A.gps_jpg, A.prog_jpg, A.gps_png, A.lossless_webp]
  for (const b of cases) {
    const clean = cleanImage(b).bytes
    const r = cleanImage(Buffer.concat([b, zip]))
    assert.equal(r.ok, true, r.detalhe)
    assert.ok(r.bytes.equals(clean))
    assert.equal(r.bytes.includes(Buffer.from('PK')), false)
    assert.equal(r.bytes.includes(Buffer.from('<script')), false)
  }
  // "GIFAR": starts as a GIF and hides a JAR. It is never even read.
  assert.equal(cleanImage(Buffer.concat([A.g_gif, zip])).codigo, 'formato_nao_aceito')
  // HTML in a PNG text chunk
  const withHtml = syntheticPng({ antes: [chunkPng('tEXt', Buffer.from('Comment\0<html><script>alert(1)</script>', 'latin1'))] })
  const r = cleanImage(withHtml)
  assert.equal(r.ok, true)
  assert.equal(r.bytes.includes(Buffer.from('<script')), false)
  assert.ok(r.bytes.equals(cleanImage(syntheticPng()).bytes))
})

test('a file truncated at any point never passes as an image and never throws', () => {
  for (const b of [A.gps_jpg, A.prog_jpg, A.gps_png, A.alpha_png, A.gps_webp, A.lossless_webp, A.alpha_webp]) {
    const clean = cleanImage(b).bytes
    for (let cutoff = 0; cutoff < clean.length; cutoff++) {
      const r = cleanImage(clean.subarray(0, cutoff))
      assert.equal(r.ok, false, `cut at ${cutoff} of ${clean.length} (${formatFromBytes(b)}) passed`)
      assert.ok(['imagem_invalida', 'formato_nao_aceito'].includes(r.codigo), r.codigo)
    }
  }
})

test('broken structure: wrong CRC, unknown critical chunk, CMYK, two frames, IHDR not at the start', () => {
  const png = syntheticPng()
  const wrongCrc = Buffer.from(png)
  wrongCrc[wrongCrc.length - 13] ^= 0xff // a byte of the IDAT CRC... or of the IEND: any of them breaks it
  assert.equal(cleanImage(wrongCrc).codigo, 'imagem_invalida')
  const critical = syntheticPng({ antes: [chunkPng('ABCD', Buffer.from('x'))] })
  assert.equal(cleanImage(critical).codigo, 'imagem_invalida')
  // JPEG with 4 components (CMYK): changes the number of components in the SOF
  const j = Buffer.from(cleanImage(A.gps_jpg).bytes)
  const sof = j.indexOf(Buffer.from([0xff, 0xc0]))
  assert.ok(sof > 0)
  j[sof + 9] = 4
  assert.equal(cleanImage(j).codigo, 'imagem_invalida')
  // lossless JPEG (SOF3) is refused
  const withoutLoss = Buffer.from(cleanImage(A.gps_jpg).bytes)
  withoutLoss[sof + 1] = 0xc3
  assert.equal(cleanImage(withoutLoss).codigo, 'imagem_invalida')
})

test('pixel cap: 4096 on the longer side passes, 4097 is dimensoes_grandes (PNG, JPEG and WebP), without decoding', () => {
  assert.equal(cleanImage(syntheticPng({ largura: 4096, altura: 1 })).ok, true)
  assert.equal(cleanImage(syntheticPng({ largura: 1, altura: 4096 })).ok, true)
  assert.equal(cleanImage(syntheticPng({ largura: 4097, altura: 1 })).codigo, 'dimensoes_grandes')
  assert.equal(cleanImage(syntheticPng({ largura: 1, altura: 60000 })).codigo, 'dimensoes_grandes')
  assert.equal(cleanImage(syntheticPng({ largura: 0x7fffffff, altura: 0x7fffffff })).codigo, 'dimensoes_grandes')
  const j = Buffer.from(cleanImage(A.gps_jpg).bytes)
  const sof = j.indexOf(Buffer.from([0xff, 0xc0]))
  j.writeUInt16BE(4097, sof + 7) // largura
  assert.equal(cleanImage(j).codigo, 'dimensoes_grandes')
  const w = Buffer.from(cleanImage(A.lossless_webp).bytes)
  const vp8l = w.indexOf(Buffer.from('VP8L'))
  const bits = w.readUInt32LE(vp8l + 9)
  w.writeUInt32LE(((bits & ~0x3fff) | 4096) >>> 0, vp8l + 9) // largura - 1 = 4096
  assert.equal(cleanImage(w).codigo, 'dimensoes_grandes')
})

test('byte cap: up to 1 MiB passes, one byte more is imagem_grande before any read', () => {
  const base = syntheticPng()
  const fills = (total) => {
    const missing = total - base.length - 12
    return syntheticPng({ antes: [chunkPng('zzZz', Buffer.alloc(missing, 0x61))] })
  }
  const atLimit = fills(MEDIA_LIMITS.bytesMax)
  assert.equal(atLimit.length, MEDIA_LIMITS.bytesMax)
  assert.equal(cleanImage(atLimit).ok, true)
  assert.equal(cleanImage(fills(MEDIA_LIMITS.bytesMax + 1)).codigo, 'imagem_grande')
})

// ---------- the `imagem` object ----------

const pair = generateKeyPair()
const author = newUid()
const POST = `ob_${'A'.repeat(43)}`
const clean = cleanImage(A.gps_png)
const object = (body, o = {}) => createObject({ tipo: 'imagem', autor: author, criadoEm: NOW, previo: null, corpo: body, chavePrivada: pair.chavePrivada, ...o })
const attachment = (extra = {}) => ({ ...imageBody(clean, { uso: 'anexo', alvo: POST, ordem: 0, alt: 'Um quadrado verde.' }), ...extra })
const refusalField = (obj) => { const r = validateObject(obj); return r.ok ? 'ok' : r.erro.campo }

test('imagem object: valid attachment and portrait, signed under the type prefix, only in 0.3', () => {
  assert.equal(validateObject(object(attachment())).ok, true)
  const portrait = { ...attachment(), uso: 'retrato', alvo: null, ordem: null }
  assert.equal(validateObject(object(portrait)).ok, true)
  assert.equal(objectDomain('0.3', 'imagem'), 'rover-network/0.3/objeto/imagem\n')
  assert.equal(typeExistsInVersion('imagem', '0.3'), true)
  for (const v of ['0.1', '0.2']) assert.equal(refusalField(object(attachment(), { v })), 'objeto.tipo')
})

test('imagem object: free since 0.11.0 (no approval at each use); never by standing authorization; still outside the requirable list', () => {
  // 0.5.0 asked for approval at each use; 0.11.0 (proposal 0013) made media free
  assert.equal(REQUIRES_APPROVAL.imagem, false)
  // free, but OUTSIDE the list that validates the person's signed policy: an older relay would reject a policy that named imagem
  assert.equal(REQUIRABLE_TYPES_V3.includes('imagem'), false)
  assert.equal(requiresApproval('imagem', []), false)
  // no version of standing authorization covers imagem
  for (const v of AUTHORIZATION_VERSIONS) assert.equal(authorizableTypesOf(v).includes('imagem'), false, v)
  assert.equal(AUTHORIZABLE_TYPES_V3.includes('imagem'), false)
})

test('imagem object: closed schema and cross-field rules', () => {
  // 0.11.0 (proposal 0013): the alternative text is optional; an empty string is accepted (it still has to be a string)
  assert.equal(validateObject(object(attachment({ alt: '' }))).ok, true)
  const cases = [
    [attachment({ extra: 1 }), 'objeto.corpo.extra'],
    [(({ alt: _a, ...r }) => r)(attachment()), 'objeto.corpo.alt'],
    [attachment({ alt: 'a'.repeat(281) }), 'objeto.corpo.alt'],
    [attachment({ alt: 'veja https://exemplo.com/foto' }), 'objeto.corpo.alt'],
    [attachment({ alt: 'linha\noutra' }), 'objeto.corpo.alt'],
    [attachment({ alt: 'meu email é pessoa@exemplo.com' }), 'objeto.corpo.alt'],
    [attachment({ hash: clean.hash.toUpperCase() }), 'objeto.corpo.hash'],
    [attachment({ hash: '../../etc/passwd' }), 'objeto.corpo.hash'],
    [attachment({ formato: 'gif' }), 'objeto.corpo.formato'],
    [attachment({ formato: 'svg' }), 'objeto.corpo.formato'],
    [attachment({ largura: 4097 }), 'objeto.corpo.largura'],
    [attachment({ altura: 0 }), 'objeto.corpo.altura'],
    [attachment({ bytes: MEDIA_LIMITS.bytesMax + 1 }), 'objeto.corpo.bytes'],
    [attachment({ ordem: 4 }), 'objeto.corpo.ordem'],
    [attachment({ uso: 'banner' }), 'objeto.corpo.uso'],
    [attachment({ alvo: null }), 'objeto.corpo.alvo'],
    [attachment({ ordem: null }), 'objeto.corpo.ordem'],
    [{ ...attachment(), uso: 'retrato', ordem: null }, 'objeto.corpo.alvo'],
    [{ ...attachment(), uso: 'retrato', alvo: null }, 'objeto.corpo.ordem']
  ]
  for (const [body, field] of cases) assert.equal(refusalField(object(body)), field, JSON.stringify(body).slice(0, 80))
  assert.equal(attachment({ alt: 'á'.repeat(280) }).alt.length, 280)
  assert.equal(refusalField(object(attachment({ alt: 'á'.repeat(280) }))), 'ok')
})

test('the approval covers the hash and the alt text: changing either one changes the id', () => {
  const a = object(attachment())
  assert.notEqual(object(attachment({ alt: 'Outro texto.' })).id, a.id)
  assert.notEqual(object(attachment({ hash: mediaHash(Buffer.from('outra')) })).id, a.id)
})

test('imageMatchesObject: the person screen shows only the exact bytes the object cites', () => {
  const o = object(attachment())
  assert.equal(imageMatchesObject(clean.bytes, o), null)
  assert.match(imageMatchesObject(A.gps_png, o), /não são os que o objeto cita/, 'the original (with GPS) is not the approved one')
  assert.match(imageMatchesObject(cleanImage(A.alpha_png).bytes, o), /não são/)
  assert.match(imageMatchesObject(clean.bytes, object(attachment({ largura: 9 }))), /dimensões/)
  assert.match(imageMatchesObject(undefined, o), /faltam/)
})

// ---------- upload credential ----------

test('upload credential: covers the path with the hash and the method, expires in 120 s and has its own prefix', () => {
  const uid = newUid()
  const target = `/v1/midia/${clean.hash}`
  const header = createSendCredential({ chavePrivada: pair.chavePrivada, uid, alvo: target, t: NOW })
  const c = readUploadCredential(header)
  const matches = (o) => uploadCredentialMatches(c, { metodo: 'PUT', alvo: target, chave: pair.publicKey, agora: NOW, ...o })
  assert.equal(matches({}), true)
  assert.equal(matches({ alvo: `/v1/midia/${'0'.repeat(64)}` }), false, 'another hash')
  assert.equal(matches({ metodo: 'GET' }), false)
  assert.equal(matches({ agora: NOW + 121 }), false)
  assert.equal(matches({ chave: generateKeyPair().publicKey }), false)
  // the read one cannot be used to upload: another scheme in the header, and the same signature under the read prefix does not match
  const read = createReadCredential({ chavePrivada: pair.chavePrivada, uid, alvo: target, t: NOW, metodo: 'PUT' })
  assert.equal(readUploadCredential(read), null)
  assert.equal(readReadCredential(header), null, 'and the upload one cannot be used to read')
  const swapped = { ...readReadCredential(read) }
  assert.equal(uploadCredentialMatches(swapped, { metodo: 'PUT', alvo: target, chave: pair.publicKey, agora: NOW }), false)
  assert.equal(UPLOAD_DOMAIN, domainOf('0.3', 'envio-de-midia'))
  const withOtherPrefix = signBytes(domainOf('0.3', 'objeto/imagem'), canonicalBytes({ alvo: target, metodo: 'PUT', t: NOW, uid }), pair.chavePrivada)
  assert.equal(uploadCredentialMatches({ uid, t: NOW, assinatura: withOtherPrefix }, { metodo: 'PUT', alvo: target, chave: pair.publicKey, agora: NOW }), false)
})
