// 0.11.0 part 3 (`video`): the browser cleans a video with the SAME rules as the protocol's `limparVideo`, so the relay finds nothing
// left to clean (it refuses with `422 video_invalido` otherwise) and the hash computed on the device is the relay's hash. This test
// runs the site's port (src/lib/person/video.ts, WebCrypto) and the protocol (packages/protocol/src/video.js, node:crypto) on the same
// bytes and asks for the same answer byte for byte: the synthetic containers of the root tests (test/helpers/video.js), each variant a
// camera or a phone writes, every refusal, a few thousand corrupted copies, and real files made by ffmpeg when it is installed.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkPickedVideo, cleanVideo, formatDuration, inspectVideo, prepareVideo, videoFormatOf, VIDEO_LIMITS } from '@/lib/person/video'

type Clean = { ok: true; bytes: Uint8Array; hash: string; formato: string; duracaoMs: number; largura: number; altura: number; videoCodec: string; audioCodec: string | null; mudou: boolean }
type Refusal = { ok: false; codigo: string; detalhe: string }
type Protocol = {
  cleanVideo: (b: Uint8Array) => Clean | Refusal
  inspectVideo: (l: unknown) => { ok: boolean; codigo?: string; patches?: unknown[] }
  byteReader: (b: Uint8Array) => unknown
  VIDEO_LIMITS: { bytesMax: number; duracaoMaxS: number; ladoMaxPx: number }
}
type Helpers = {
  syntheticMp4: (o?: Record<string, unknown>) => Buffer
  syntheticWebm: (o?: Record<string, unknown>) => Buffer
  el: (id: number, ...parts: (Buffer | string)[]) => Buffer
  caixa: (type: string, ...parts: (Buffer | string)[]) => Buffer
}

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const pathP = join(root, 'packages/protocol/src/video.js')
const pathA = join(root, 'test/helpers/video.js')
const has = existsSync(pathP) && existsSync(pathA)
const P = (has ? await import(/* @vite-ignore */ pathP) : null) as Protocol
const A = (has ? await import(/* @vite-ignore */ pathA) : null) as Helpers

/** Both sides on the same bytes: the same refusal code, or the same output bytes, hash and description. */
async function same(input: Uint8Array, label = '') {
  const p = P.cleanVideo(Buffer.from(input))
  const s = await cleanVideo(new Uint8Array(input))
  if (!p.ok) {
    expect(s.ok, `${label}: the protocol refused (${p.codigo}, ${p.detalhe}) and the site did not`).toBe(false)
    if (!s.ok) expect(s.code, label).toBe(p.codigo)
    return { p, s }
  }
  expect(s.ok, `${label}: the protocol accepted and the site refused (${!s.ok ? s.reason : ''})`).toBe(true)
  if (!s.ok) return { p, s }
  expect(Buffer.from(s.bytes).equals(Buffer.from(p.bytes)), `${label}: different bytes`).toBe(true)
  expect(s.hash, label).toBe(p.hash)
  expect({ f: s.format, d: s.durationMs, w: s.width, h: s.height, v: s.videoCodec, a: s.audioCodec, m: s.changed }, label).toEqual({
    f: p.formato, d: p.duracaoMs, w: p.largura, h: p.altura, v: p.videoCodec, a: p.audioCodec, m: p.mudou,
  })
  return { p, s }
}

/** A deterministic generator, so a failing corrupted copy can be found again. */
function rng(seed: number) {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 4294967296
  }
}

describe.skipIf(!has)('video cleaning: the site and the protocol give the same bytes', () => {
  it('the limits are the protocol limits', () => {
    expect(VIDEO_LIMITS.bytesMax).toBe(P.VIDEO_LIMITS.bytesMax)
    expect(VIDEO_LIMITS.durationMaxS).toBe(P.VIDEO_LIMITS.duracaoMaxS)
    expect(VIDEO_LIMITS.sideMaxPx).toBe(P.VIDEO_LIMITS.ladoMaxPx)
  })

  it('MP4: clean files pass untouched, a camera file is cleaned the same way, and the cleaning settles', async () => {
    const variants: [string, Record<string, unknown>][] = [
      ['limpo', {}],
      ['sem áudio', { audio: false }],
      ['em pé', { largura: 1920, altura: 1080, sideways: true }],
      ['índice depois dos dados', { moovFirst: false }],
      ['QuickTime', { marca: 'qt  ' }],
      ['avc3', { videoCodec: 'avc3' }],
      ['câmera com metadados', { metadados: true }],
      ['câmera, índice no fim', { metadados: true, moovFirst: false }],
      ['câmera em pé', { metadados: true, sideways: true, largura: 1280, altura: 720 }],
      ['60,9 s', { duracaoMs: 60_999 }],
      ['4096 px', { largura: 4096, altura: 2160 }],
    ]
    for (const [name, o] of variants) {
      const { p, s } = await same(A.syntheticMp4({ semente: 3, ...o }), name)
      expect(p.ok, name).toBe(true)
      if (s.ok) {
        // the output of the cleaning is clean: cleaning it again changes nothing
        expect((await cleanVideo(s.bytes)).ok && (await cleanVideo(s.bytes) as { changed: boolean }).changed, name).toBe(false)
        expect(s.changed, name).toBe(!!o.metadados)
      }
    }
    // what a camera wrote is really gone: the location atom, the XMP box, the creation dates
    const camera = await cleanVideo(new Uint8Array(A.syntheticMp4({ metadados: true })))
    expect(camera.ok).toBe(true)
    if (camera.ok) {
      const text = Buffer.from(camera.bytes).toString('latin1')
      expect(text).not.toMatch(/-23\.5505|xmpmeta|com\.apple\.quicktime\.location|nome da trilha/)
    }
  })

  it('WebM: clean files pass untouched, metadata elements turn Void of the same size', async () => {
    const variants: [string, Record<string, unknown>][] = [
      ['limpo', {}],
      ['VP8 e Vorbis', { videoCodec: 'V_VP8', audioCodec: 'A_VORBIS' }],
      ['AV1 sem áudio', { videoCodec: 'V_AV1', audio: false }],
      ['com metadados', { metadados: true }],
      ['curto', { duracaoMs: 1 }],
    ]
    for (const [name, o] of variants) {
      const { p } = await same(A.syntheticWebm({ semente: 5, ...o }), name)
      expect(p.ok, name).toBe(true)
    }
    const clean = await cleanVideo(new Uint8Array(A.syntheticWebm({ metadados: true })))
    expect(clean.ok && Buffer.from(clean.bytes).toString('utf8')).not.toMatch(/LOCATION|Férias|câmera do quarto|capítulo/)
  })

  it('WebM: a metadata element of more than 128 bytes becomes a Void with an 8-byte size, the same on both sides', async () => {
    const { el } = A
    const n = (v: number) => Buffer.from([v])
    const real = (x: number) => { const b = Buffer.alloc(8); b.writeDoubleBE(x); return b }
    const header = el(0x1a45dfa3, el(0x4286, n(1)), el(0x42f7, n(1)), el(0x4282, 'webm'), el(0x4287, n(4)), el(0x4285, n(2)))
    const info = el(0x1549a966, el(0x2ad7b1, Buffer.from([0x0f, 0x42, 0x40])), el(0x4489, real(4000)), el(0x7ba9, 'T'.repeat(300)))
    const tracksEl = el(0x1654ae6b, el(0xae, el(0xd7, n(1)), el(0x83, n(1)), el(0x86, 'V_VP9'), el(0x536e, 'N'.repeat(200)), el(0xe0, el(0xb0, Buffer.from([2, 128])), el(0xba, Buffer.from([1, 104])))))
    const marks = el(0x1254c367, el(0x7373, el(0x67c8, el(0x45a3, 'LOCATION'), el(0x4487, 'x'.repeat(4000)))))
    const group = el(0x1f43b675, el(0xe7, n(0)), el(0xa3, Buffer.alloc(300, 9)))
    const body = Buffer.concat([info, tracksEl, marks, group])
    const size = Buffer.alloc(8)
    size.writeBigUInt64BE(BigInt(body.length))
    size[0] |= 0x01
    const file = Buffer.concat([header, Buffer.from([0x18, 0x53, 0x80, 0x67]), size, body])
    const { p, s } = await same(file, 'webm com elementos grandes')
    expect(p.ok && s.ok).toBe(true)
    expect(s.ok && s.changed).toBe(true)
  })

  it('every refusal is the same code on both sides', async () => {
    const cases: [string, Buffer, string][] = [
      ['MP4 longo', A.syntheticMp4({ duracaoMs: 61_000 }), 'video_longo'],
      ['WebM longo', A.syntheticWebm({ duracaoMs: 75_000 }), 'video_longo'],
      ['MP4 largo', A.syntheticMp4({ largura: 5000, altura: 1000 }), 'dimensoes_grandes'],
      ['HEVC', A.syntheticMp4({ videoCodec: 'hvc1' }), 'formato_nao_aceito'],
      ['áudio Opus no MP4', A.syntheticMp4({ audioCodec: 'Opus' }), 'formato_nao_aceito'],
      ['fragmentado', A.syntheticMp4({ fragmentado: true }), 'formato_nao_aceito'],
      ['duas trilhas de vídeo', A.syntheticMp4({ extraTracks: [{ handler: 'vide', codec: 'avc1', largura: 64, altura: 64 }] }), 'formato_nao_aceito'],
      ['sobra depois do MP4', A.syntheticMp4({ depois: Buffer.from('lixo') }), 'video_invalido'],
      ['WebM sem duração', A.syntheticWebm({ withoutDuration: true }), 'formato_nao_aceito'],
      ['WebM ao vivo', A.syntheticWebm({ aoVivo: true }), 'formato_nao_aceito'],
      ['WebM com legenda', A.syntheticWebm({ subtitleTrack: true }), 'formato_nao_aceito'],
      ['Matroska', A.syntheticWebm({ documentType: 'matroska' }), 'formato_nao_aceito'],
      ['H.264 em WebM', A.syntheticWebm({ videoCodec: 'V_MPEG4/ISO/AVC' }), 'formato_nao_aceito'],
      ['sobra depois do WebM', A.syntheticWebm({ depois: Buffer.from('lixo') }), 'video_invalido'],
      ['GIF', Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64)]), 'formato_nao_aceito'],
      ['curto demais', Buffer.alloc(10), 'formato_nao_aceito'],
    ]
    for (const [name, bytes, code] of cases) {
      const { p } = await same(bytes, name)
      expect(p.ok ? 'ok' : p.codigo, name).toBe(code)
    }
    // the screen gets the reason and the numbers to say what passed the limit
    expect(inspectVideo(new Uint8Array(A.syntheticMp4({ duracaoMs: 61_000 })))).toMatchObject({ reason: 'long', durationMs: 61_000 })
    expect(inspectVideo(new Uint8Array(A.syntheticMp4({ largura: 5000, altura: 1000 })))).toMatchObject({ reason: 'dims', width: 5000, height: 1000 })
    expect(inspectVideo(new Uint8Array(A.syntheticMp4({ fragmentado: true })))).toMatchObject({ reason: 'fragmented' })
    expect(inspectVideo(new Uint8Array(A.syntheticWebm({ withoutDuration: true })))).toMatchObject({ reason: 'no_duration' })
    expect(inspectVideo(new Uint8Array(A.syntheticWebm({ aoVivo: true })))).toMatchObject({ reason: 'live' })
    expect(inspectVideo(new Uint8Array(A.syntheticMp4({ videoCodec: 'hvc1' })))).toMatchObject({ reason: 'codec' })
  })

  it('corrupted copies: thousands of random byte changes, the same answer on both sides', async () => {
    const bases = [A.syntheticMp4({ metadados: true }), A.syntheticMp4({ moovFirst: false, audio: false }), A.syntheticWebm({ metadados: true }), A.syntheticWebm()]
    const r = rng(20261125)
    let accepted = 0
    let refused = 0
    for (let k = 0; k < 2400; k++) {
      const base = bases[k % bases.length]
      const b = Buffer.from(base)
      const trocas = 1 + Math.floor(r() * 3)
      for (let i = 0; i < trocas; i++) b[Math.floor(r() * b.length)] = Math.floor(r() * 256)
      // now and then a cut at the end, the commonest broken upload
      const cutoff = k % 7 === 0 ? b.subarray(0, Math.max(0, b.length - 1 - Math.floor(r() * 64))) : b
      const { p } = await same(cutoff, `cópia ${k}`)
      if (p.ok) accepted++
      else refused++
    }
    // both kinds of answer were exercised
    expect(accepted).toBeGreaterThan(50)
    expect(refused).toBeGreaterThan(50)
  })

  it('real files made by ffmpeg (H.264 and AAC in MP4, VP9 and Opus in WebM, with title, date and location written in)', async () => {
    let ffmpeg = true
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    } catch {
      ffmpeg = false
    }
    if (!ffmpeg) return
    const dir = mkdtempSync(join(tmpdir(), 'video-limpeza-'))
    try {
      const common = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=15:duration=1.5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-shortest']
      const meta = ['-metadata', 'title=Festa na casa da Ana', '-metadata', 'creation_time=2026-11-25T10:00:00Z', '-metadata', 'location=-23.5505-046.6333/']
      const mp4 = join(dir, 'a.mp4')
      const webm = join(dir, 'a.webm')
      execFileSync('ffmpeg', [...common, ...meta, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart+use_metadata_tags', mp4])
      execFileSync('ffmpeg', [...common, ...meta, '-c:v', 'libvpx-vp9', '-b:v', '200k', '-c:a', 'libopus', webm])
      for (const f of [mp4, webm]) {
        const { p, s } = await same(readFileSync(f), f)
        expect(p.ok, f).toBe(true)
        expect(s.ok && s.changed, f).toBe(true)
        if (s.ok) expect(Buffer.from(s.bytes).toString('latin1')).not.toMatch(/Festa na casa|-23\.5505/)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})

describe('video: the checks before reading the whole file', () => {
  it('the container by the first bytes', () => {
    expect(videoFormatOf(Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]))).toBe('mp4')
    expect(videoFormatOf(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]))).toBe('webm')
    expect(videoFormatOf(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull()
  })
  it('a file over 50 MB is refused by its size, before being read', async () => {
    const big = { size: 50 * 1048576 + 1, slice: () => { throw new Error('read') }, arrayBuffer: () => { throw new Error('read') } } as unknown as Blob
    expect(await checkPickedVideo(big)).toMatchObject({ code: 'video_grande', reason: 'big', bytes: 50 * 1048576 + 1 })
    expect(await prepareVideo(big)).toMatchObject({ code: 'video_grande' })
  })
  it('a picture is not a video', async () => {
    const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(1)])])
    expect(await checkPickedVideo(jpeg)).toMatchObject({ code: 'formato_nao_aceito', reason: 'not_video' })
  })
  it('the duration as a player shows it', () => {
    expect(formatDuration(7_400)).toBe('0:07')
    expect(formatDuration(60_999)).toBe('1:00')
    expect(formatDuration(12_000)).toBe('0:12')
  })
})
