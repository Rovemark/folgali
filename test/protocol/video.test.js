// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013): the video container read from the bytes, the limits, and the cleaning that moves nothing.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  VIDEO_BODY, VIDEO_LIMITS, videoBody, videoFormatFromBytes, inspectVideo, byteReader, cleanVideo, videoRules
} from '../../packages/protocol/src/video.js'
import { box, syntheticMp4, syntheticWebm } from '../helpers/video.js'

const view = (bytes) => inspectVideo(byteReader(bytes))
const refusal = (bytes) => { const r = view(bytes); return r.ok ? 'ok' : r.codigo }

test('MP4: container, codecs, duration and size on screen come from the bytes', () => {
  const r = view(syntheticMp4({ duracaoMs: 12_345, largura: 1920, altura: 1080 }))
  assert.equal(r.ok, true, r.detalhe)
  assert.deepEqual(
    { formato: r.formato, duracaoMs: r.duracaoMs, largura: r.largura, altura: r.altura, v: r.videoCodec, a: r.audioCodec, patches: r.patches.length },
    { formato: 'mp4', duracaoMs: 12_345, largura: 1920, altura: 1080, v: 'h264', a: 'aac', patches: 0 }
  )
  assert.equal(view(syntheticMp4({ audio: false })).audioCodec, null)
  // the phone held upright: the track is 1920 by 1080 with a quarter turn, and the screen shows 1080 by 1920
  const upright = view(syntheticMp4({ largura: 1920, altura: 1080, sideways: true }))
  assert.deepEqual([upright.largura, upright.altura], [1080, 1920])
  // the index after the media data (what a camera writes) reads the same
  assert.equal(view(syntheticMp4({ moovFirst: false })).ok, true)
  // the QuickTime brand is the same structure and is read as MP4
  assert.equal(view(syntheticMp4({ marca: 'qt  ' })).formato, 'mp4')
  assert.equal(videoFormatFromBytes(syntheticMp4().subarray(0, 12)), 'mp4')
})

test('WebM: container, codecs, duration and size on screen come from the bytes', () => {
  const r = view(syntheticWebm({ duracaoMs: 59_000, largura: 640, altura: 360 }))
  assert.equal(r.ok, true, r.detalhe)
  assert.deepEqual(
    { formato: r.formato, duracaoMs: r.duracaoMs, largura: r.largura, altura: r.altura, v: r.videoCodec, a: r.audioCodec, patches: r.patches.length },
    { formato: 'webm', duracaoMs: 59_000, largura: 640, altura: 360, v: 'vp9', a: 'opus', patches: 0 }
  )
  assert.equal(view(syntheticWebm({ videoCodec: 'V_AV1', audioCodec: 'A_VORBIS' })).videoCodec, 'av1')
  assert.equal(videoFormatFromBytes(syntheticWebm().subarray(0, 12)), 'webm')
})

test('the limits: up to 60 seconds, 50 MB and 4096 pixels a side, each with its own refusal', () => {
  assert.equal(VIDEO_LIMITS.bytesMax, 50 * 1048576)
  assert.equal(VIDEO_LIMITS.duracaoMaxS, 60)
  assert.equal(refusal(syntheticMp4({ duracaoMs: 60_000 })), 'ok')
  assert.equal(refusal(syntheticMp4({ duracaoMs: 60_999 })), 'ok', 'a "1:00" that runs a little over is still 60 seconds')
  const long = view(syntheticMp4({ duracaoMs: 61_000 }))
  assert.deepEqual([long.codigo, long.detalhe], ['video_longo', 'o vídeo tem 61 segundos e o máximo é 60'])
  assert.equal(refusal(syntheticWebm({ duracaoMs: 61_000 })), 'video_longo')
  assert.equal(refusal(syntheticMp4({ largura: 4096, altura: 2160 })), 'ok')
  assert.equal(refusal(syntheticMp4({ largura: 4097, altura: 2160 })), 'dimensoes_grandes')
  assert.equal(refusal(syntheticWebm({ largura: 640, altura: 5000 })), 'dimensoes_grandes')
  // size: the reader says how big the file is, and nothing past the limit is even opened
  const large = inspectVideo({ tamanho: VIDEO_LIMITS.bytesMax + 1, ler: () => { throw new Error('must not read') } })
  assert.equal(large.codigo, 'video_grande')
  assert.match(large.detalhe, /o máximo é 50 MB/)
})

test('what is not accepted, by the bytes and never by the name: other containers, other codecs, fragments, live streams, extra tracks', () => {
  assert.equal(refusal(Buffer.alloc(64, 1)), 'formato_nao_aceito')
  assert.equal(refusal(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(60)])), 'formato_nao_aceito', 'a PNG named .mp4')
  assert.equal(refusal(Buffer.alloc(8)), 'formato_nao_aceito')
  assert.equal(refusal(syntheticMp4({ marca: 'heic' })), 'formato_nao_aceito')
  const hevc = view(syntheticMp4({ videoCodec: 'hvc1' }))
  assert.deepEqual([hevc.codigo, hevc.detalhe], ['formato_nao_aceito', 'o vídeo MP4 precisa ser H.264 (veio hvc1)'])
  assert.equal(refusal(syntheticMp4({ audioCodec: 'ac-3' })), 'formato_nao_aceito')
  assert.equal(refusal(syntheticMp4({ fragmentado: true })), 'formato_nao_aceito')
  assert.equal(refusal(Buffer.concat([syntheticMp4(), box('moof', Buffer.alloc(8))])), 'formato_nao_aceito')
  assert.equal(refusal(syntheticMp4({ extraTracks: [{ handler: 'vide', codec: 'avc1', largura: 10, altura: 10 }] })), 'formato_nao_aceito', 'two video tracks')
  assert.equal(refusal(syntheticMp4({ extraTracks: [{ handler: 'soun', codec: 'mp4a' }] })), 'formato_nao_aceito', 'two audio tracks')
  assert.equal(refusal(syntheticWebm({ documentType: 'matroska' })), 'formato_nao_aceito')
  assert.equal(refusal(syntheticWebm({ videoCodec: 'V_MPEG4/ISO/AVC' })), 'formato_nao_aceito')
  assert.equal(refusal(syntheticWebm({ audioCodec: 'A_AAC' })), 'formato_nao_aceito')
  assert.equal(refusal(syntheticWebm({ subtitleTrack: true })), 'formato_nao_aceito')
  assert.equal(refusal(syntheticWebm({ aoVivo: true })), 'formato_nao_aceito')
  const withoutDuration = view(syntheticWebm({ withoutDuration: true }))
  assert.equal(withoutDuration.codigo, 'formato_nao_aceito')
  assert.match(withoutDuration.detalhe, /sem duração declarada/)
})

test('a broken structure is refused without throwing: truncated, wrong sizes, bytes after the end, no media data', () => {
  const good = syntheticMp4()
  for (const cutoff of [40, 100, 300, good.length - 1]) assert.equal(refusal(good.subarray(0, cutoff)), 'video_invalido', `cut at ${cutoff}`)
  assert.equal(refusal(Buffer.concat([good, Buffer.from('<script>')])), 'video_invalido', 'polyglot after the last box')
  const withoutMdat = Buffer.concat([good.subarray(0, good.indexOf('mdat') - 4)])
  assert.equal(refusal(withoutMdat), 'video_invalido')
  const wrongSize = Buffer.from(good)
  wrongSize.writeUInt32BE(0x7fffffff, good.indexOf('moov') - 4)
  assert.equal(refusal(wrongSize), 'video_invalido')
  const w = syntheticWebm()
  for (const cutoff of [40, 90, w.length - 1]) assert.equal(refusal(w.subarray(0, cutoff)), 'video_invalido', `webm cut at ${cutoff}`)
  assert.equal(refusal(Buffer.concat([w, Buffer.from('sobra')])), 'video_invalido')
  // random bytes after a valid signature never crash the reader
  for (let i = 0; i < 200; i++) {
    const junk = Buffer.from(good)
    for (let k = 0; k < 6; k++) junk[8 + Math.floor(Math.random() * (junk.length - 8))] = Math.floor(Math.random() * 256)
    const r = view(junk)
    assert.equal(typeof r.ok, 'boolean')
  }
})

test('cleaning an MP4: dates, location, user data, the XMP box and the metadata track go, every byte keeps its place, and it is idempotent', () => {
  const dirty = syntheticMp4({ metadados: true })
  assert.ok(dirty.includes('-23.5505'))
  assert.ok(dirty.includes('xmpmeta'))
  const inspection = view(dirty)
  assert.equal(inspection.ok, true)
  assert.ok(inspection.patches.length > 0)
  const clean = cleanVideo(dirty)
  assert.equal(clean.ok, true, clean.detalhe)
  assert.equal(clean.mudou, true)
  assert.equal(clean.bytes.length, dirty.length, 'nothing moves')
  for (const trace of ['-23.5505', 'xmpmeta', 'quicktime.location', 'nome da trilha', 'mebx']) assert.equal(clean.bytes.includes(trace), false, trace)
  assert.equal(clean.hash, createHash('sha256').update(clean.bytes).digest('hex'))
  // the media data is untouched
  const mdat = dirty.indexOf('mdat')
  assert.ok(clean.bytes.subarray(mdat, mdat + 200).equals(dirty.subarray(mdat, mdat + 200)))
  // the clean file reads the same and has nothing left to patch
  const again = view(clean.bytes)
  assert.deepEqual([again.ok, again.patches.length, again.duracaoMs, again.largura], [true, 0, 3000, 1280])
  const other = cleanVideo(clean.bytes)
  assert.equal(other.hash, clean.hash)
  assert.equal(other.mudou, false)
  // a file that was already clean keeps its exact bytes
  const alreadyClean = syntheticMp4()
  assert.ok(cleanVideo(alreadyClean).bytes.equals(alreadyClean))
  // the input is never written
  assert.ok(dirty.includes('-23.5505'))
})

test('cleaning a WebM: title, date, track name, tags and chapters become Void of the same size', () => {
  const dirty = syntheticWebm({ metadados: true })
  for (const trace of ['rua tal', 'LOCATION', 'câmera do quarto', 'capítulo']) assert.ok(dirty.includes(trace), trace)
  const clean = cleanVideo(dirty)
  assert.equal(clean.ok, true, clean.detalhe)
  assert.equal(clean.bytes.length, dirty.length)
  for (const trace of ['rua tal', 'LOCATION', '-23.5505', 'câmera do quarto', 'capítulo']) assert.equal(clean.bytes.includes(trace), false, trace)
  const again = view(clean.bytes)
  assert.deepEqual([again.ok, again.patches.length, again.formato, again.duracaoMs], [true, 0, 'webm', 3000])
  assert.equal(cleanVideo(clean.bytes).hash, clean.hash)
})

test('the body of the video object: closed schema, one line of optional alt, a poster that is not the video itself', () => {
  const clean = cleanVideo(syntheticMp4({ duracaoMs: 4000 }))
  const target = `ob_${'A'.repeat(43)}`
  const body = videoBody(clean, { alvo: target, miniatura: 'b'.repeat(64), alt: 'Um gato atravessa a sala.' })
  assert.equal(VIDEO_BODY(body, 'objeto.corpo'), null)
  assert.deepEqual(Object.keys(body), ['alvo', 'hash', 'formato', 'largura', 'altura', 'bytes', 'duracaoMs', 'miniatura', 'alt'])
  assert.equal(VIDEO_BODY(videoBody(clean, { alvo: target }), 'objeto.corpo'), null, 'no poster and no alt is valid')
  for (const [bad, field] of [
    [{ ...body, extra: 1 }, 'objeto.corpo.extra'],
    [{ ...body, alvo: null }, 'objeto.corpo.alvo'],
    [{ ...body, formato: 'mov' }, 'objeto.corpo.formato'],
    [{ ...body, bytes: VIDEO_LIMITS.bytesMax + 1 }, 'objeto.corpo.bytes'],
    [{ ...body, duracaoMs: 61_000 }, 'objeto.corpo.duracaoMs'],
    [{ ...body, hash: 'B'.repeat(64) }, 'objeto.corpo.hash'],
    [{ ...body, miniatura: 'curto' }, 'objeto.corpo.miniatura'],
    [{ ...body, alt: 'veja https://exemplo.com/v' }, 'objeto.corpo.alt']
  ]) assert.equal(VIDEO_BODY(bad, 'objeto.corpo')?.caminho, field, field)
  assert.equal(videoRules({ tipo: 'video', corpo: body }), null)
  assert.equal(videoRules({ tipo: 'video', corpo: { ...body, miniatura: body.hash } }).caminho, 'objeto.corpo.miniatura')
  assert.equal(videoRules({ tipo: 'imagem', corpo: body }), null)
})
