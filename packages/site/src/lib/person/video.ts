// A person's video (protocol 0.11.0 part 3, `video`) on the BROWSER side. The relay refuses (`422 video_invalido`) a file that still
// carries metadata, so the device cleans it first with the SAME rules as the protocol's `limparVideo` (packages/protocol/src/video.js):
//   - the container is read from the bytes (never from the name or the type the browser guessed): MP4 with one H.264 track and at most
//     one AAC track, or WebM with one VP8, VP9 or AV1 track and at most one Opus or Vorbis track; duration up to 60 s, side up to 4096 px;
//   - nothing moves inside the file: a metadata box becomes a `free` box of the same size filled with zeros (MP4), a metadata element a
//     `Void` element of the same size (WebM), and the creation and modification times are zeroed;
//   - the address is the SHA-256 of the OUTPUT (WebCrypto), so the hash computed here is the relay's hash.
// Nothing is decoded and nothing is transcoded. test/person/video-limpeza.test.ts proves byte for byte that this port and the protocol
// give the same output for the same input. No dependency: this file runs in the browser.
import { sha256Hex } from './media'

export const VIDEO_FORMATS = ['mp4', 'webm'] as const
export type VideoFormat = (typeof VIDEO_FORMATS)[number]
export const VIDEO_MIME: Record<VideoFormat, string> = { mp4: 'video/mp4', webm: 'video/webm' }

/** The protocol's LIMITES_DE_VIDEO. */
export const VIDEO_LIMITS = {
  bytesMax: 50 * 1048576,
  durationMaxS: 60,
  sideMaxPx: 4096,
  indexMaxBytes: 4 * 1048576,
  altMax: 280,
} as const

const CODECS = {
  mp4: { video: ['avc1', 'avc3'], audio: ['mp4a'] },
  webm: { video: ['V_VP8', 'V_VP9', 'V_AV1'], audio: ['A_OPUS', 'A_VORBIS'] },
} as const
const CODEC_NAME: Record<string, string> = { avc1: 'h264', avc3: 'h264', mp4a: 'aac', V_VP8: 'vp8', V_VP9: 'vp9', V_AV1: 'av1', A_OPUS: 'opus', A_VORBIS: 'vorbis' }

/** The protocol code of a refusal, as the relay would answer it. */
export type VideoRefusalCode = 'video_invalido' | 'formato_nao_aceito' | 'video_grande' | 'video_longo' | 'dimensoes_grandes'
/** Why, for the screen: the composer says something different for each one. */
export type VideoRefusalReason = 'broken' | 'not_video' | 'codec' | 'fragmented' | 'live' | 'no_duration' | 'big' | 'long' | 'dims'

class Refusal extends Error {
  constructor(
    readonly code: VideoRefusalCode,
    readonly reason: VideoRefusalReason,
    readonly extra: { bytes?: number; durationMs?: number; width?: number; height?: number } = {},
  ) {
    super(reason)
  }
}
const broken = () => new Refusal('video_invalido', 'broken')
const format = (reason: VideoRefusalReason = 'codec') => new Refusal('formato_nao_aceito', reason)

type Patch = { at: number; bytes: Uint8Array }

/** Random access over bytes in memory, bounds checked like the protocol's `ler`. */
class Reader {
  constructor(readonly b: Uint8Array) {}
  get size() {
    return this.b.length
  }
  read(at: number, length: number): Uint8Array {
    if (at < 0 || at + length > this.b.length) throw broken()
    return this.b.subarray(at, at + length)
  }
}

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength)
const u32 = (b: Uint8Array, o: number) => view(b).getUint32(o)
const i32 = (b: Uint8Array, o: number) => view(b).getInt32(o)
const latin1 = (b: Uint8Array, start = 0, end = b.length) => {
  let s = ''
  for (let i = start; i < Math.min(end, b.length); i++) s += String.fromCharCode(b[i])
  return s
}
/** An unsigned big-endian integer of 1 to `max` bytes (Buffer's readUIntBE). */
const uintBE = (b: Uint8Array, max = 6) => {
  if (b.length < 1 || b.length > max) throw broken()
  let n = 0
  for (const x of b) n = n * 256 + x
  return n
}
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))

/** `mp4`, `webm` or null, from the first bytes. */
export function videoFormatOf(head: Uint8Array): VideoFormat | null {
  if (head.length >= 12 && latin1(head, 4, 8) === 'ftyp') return 'mp4'
  if (head.length >= 4 && u32(head, 0) === 0x1a45dfa3) return 'webm'
  return null
}

// ---------- MP4 ----------

const MP4_BRANDS = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4A ', 'MSNV', 'mmp4', 'qt  ', '3gp4', '3gp5'])
const TOP_NEUTRAL = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'])
const TOP_FRAGMENTED = new Set(['moof', 'mfra', 'sidx', 'styp', 'ssix', 'prft'])
const MP4_METADATA = new Set(['udta', 'meta', 'uuid'])
const TYPE_RE = /^[\x20-\x7e\xa9]{4}$/

type Box = { type: string; start: number; content: number; end: number }

function boxes(r: Reader, start: number, end: number, top = false): Box[] {
  const list: Box[] = []
  let p = start
  while (p < end) {
    if (end - p < 8) throw broken()
    const head = r.read(p, Math.min(16, end - p))
    let size = u32(head, 0)
    const type = latin1(head, 4, 8)
    if (!TYPE_RE.test(type)) throw broken()
    let header = 8
    if (size === 1) {
      if (head.length < 16) throw broken()
      const big = view(head).getBigUint64(8)
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw broken()
      size = Number(big)
      header = 16
    } else if (size === 0) {
      if (!top) throw broken()
      size = end - p
    }
    if (size < header || p + size > end) throw broken()
    list.push({ type, start: p, content: p + header, end: p + size })
    if (list.length > 4096) throw broken()
    p += size
  }
  return list
}

const single = (list: Box[], type: string) => {
  const found = list.filter((c) => c.type === type)
  if (found.length !== 1) throw broken()
  return found[0]
}

/** The patch that turns the box into a `free` box of the same size, filled with zeros. */
const freeBox = (b: Box): Patch[] => [{ at: b.start + 4, bytes: ascii('free') }, ...(b.end > b.content ? [{ at: b.content, bytes: new Uint8Array(b.end - b.content) }] : [])]

/** Zeroes the creation and modification times of a full box (mvhd, tkhd, mdhd). Returns the version and the offset after them. */
function zeroTimes(r: Reader, b: Box, patches: Patch[]): { version: number; after: number } {
  const version = r.read(b.content, 1)[0]
  if (version > 1) throw broken()
  const n = version === 1 ? 16 : 8
  const times = r.read(b.content + 4, n)
  if (times.some((x) => x !== 0)) patches.push({ at: b.content + 4, bytes: new Uint8Array(n) })
  return { version, after: b.content + 4 + n }
}

type Inspected = { format: VideoFormat; durationMs: number; width: number; height: number; videoCodec: string; audioCodec: string | null; patches: Patch[] }

function inspectMp4(r: Reader): Inspected {
  const top = boxes(r, 0, r.size, true)
  if (top.length > 64) throw broken()
  const ftyp = top[0]
  if (ftyp.type !== 'ftyp' || ftyp.end - ftyp.content < 8 || (ftyp.end - ftyp.content) % 4 !== 0 || ftyp.end - ftyp.content > 256) throw broken()
  const brands = r.read(ftyp.content, ftyp.end - ftyp.content)
  const read = [latin1(brands, 0, 4)]
  for (let i = 8; i < brands.length; i += 4) read.push(latin1(brands, i, i + 4))
  if (!read.some((m) => MP4_BRANDS.has(m))) throw format('not_video')
  const patches: Patch[] = []
  for (const c of top) {
    if (TOP_FRAGMENTED.has(c.type)) throw format('fragmented')
    if (MP4_METADATA.has(c.type)) patches.push(...freeBox(c))
    else if (!TOP_NEUTRAL.has(c.type)) throw broken()
  }
  if (!top.some((c) => c.type === 'mdat' && c.end > c.content)) throw broken()
  const moov = single(top, 'moov')
  if (moov.end - moov.start > VIDEO_LIMITS.indexMaxBytes) throw broken()
  const inside = boxes(r, moov.content, moov.end)
  if (inside.some((c) => c.type === 'mvex')) throw format('fragmented')
  const mvhd = single(inside, 'mvhd')
  const { version, after } = zeroTimes(r, mvhd, patches)
  const time = r.read(after, version === 1 ? 12 : 8)
  const scale = u32(time, 0)
  const duration = version === 1 ? Number(view(time).getBigUint64(4)) : u32(time, 4)
  if (scale === 0 || duration === 0 || (version === 0 && duration === 0xffffffff)) throw broken()
  const durationMs = Math.round((duration * 1000) / scale)

  let video: { codec: string; width: number; height: number } | null = null
  let audio: { codec: string } | null = null
  for (const c of inside) {
    if (MP4_METADATA.has(c.type)) {
      patches.push(...freeBox(c))
      continue
    }
    if (c.type !== 'trak') continue
    const parts = boxes(r, c.content, c.end)
    const mdia = single(parts, 'mdia')
    const media = boxes(r, mdia.content, mdia.end)
    const hdlr = single(media, 'hdlr')
    const handler = latin1(r.read(hdlr.content + 8, 4))
    if (handler !== 'vide' && handler !== 'soun') {
      // timed metadata, timecode, subtitles: out
      patches.push(...freeBox(c))
      continue
    }
    const ofTrack: Patch[] = []
    for (const p of parts) if (MP4_METADATA.has(p.type)) ofTrack.push(...freeBox(p))
    for (const p of media) if (MP4_METADATA.has(p.type)) ofTrack.push(...freeBox(p))
    const tkhd = single(parts, 'tkhd')
    const t = zeroTimes(r, tkhd, ofTrack)
    zeroTimes(r, single(media, 'mdhd'), ofTrack)
    const minfBox = single(media, 'minf')
    const minf = boxes(r, minfBox.content, minfBox.end)
    const stblBox = single(minf, 'stbl')
    const stbl = boxes(r, stblBox.content, stblBox.end)
    const stsd = single(stbl, 'stsd')
    if (stsd.end - stsd.content < 16) throw broken()
    const description = r.read(stsd.content, 16)
    if (u32(description, 4) !== 1) throw format()
    const codec = latin1(description, 12, 16)
    patches.push(...ofTrack)
    if (handler === 'vide') {
      if (video) throw format()
      if (!(CODECS.mp4.video as readonly string[]).includes(codec)) throw format()
      // tkhd: after the times come track id (4), reserved (4), duration (4 or 8), reserved (8), layer, group, volume, reserved (8),
      // the matrix (36) and the size on screen in 16.16 fixed point
      const base = t.after + 8 + (t.version === 1 ? 8 : 4) + 16
      const end = r.read(base, 44)
      const [a, d] = [i32(end, 0), i32(end, 16)]
      const [w, h] = [u32(end, 36) >>> 16, u32(end, 40) >>> 16]
      // a quarter turn (the phone held upright) swaps what the screen shows
      video = { codec, ...(a === 0 && d === 0 ? { width: h, height: w } : { width: w, height: h }) }
    } else {
      if (audio) throw format()
      if (!(CODECS.mp4.audio as readonly string[]).includes(codec)) throw format()
      audio = { codec }
    }
  }
  if (!video) throw format()
  return { format: 'mp4', durationMs, width: video.width, height: video.height, videoCodec: CODEC_NAME[video.codec], audioCodec: audio ? CODEC_NAME[audio.codec] : null, patches }
}

// ---------- WebM (EBML) ----------

const ID = {
  ebml: 0x1a45dfa3, docType: 0x4282, segment: 0x18538067, seekHead: 0x114d9b74, info: 0x1549a966, tracks: 0x1654ae6b, cues: 0x1c53bb6b,
  cluster: 0x1f43b675, tags: 0x1254c367, attachments: 0x1941a469, chapters: 0x1043a770, void: 0xec, crc: 0xbf,
  timecodeScale: 0x2ad7b1, duration: 0x4489, title: 0x7ba9, dateUtc: 0x4461, segmentFilename: 0x7384, prevFilename: 0x3c83ab, nextFilename: 0x3e83bb,
  trackEntry: 0xae, trackType: 0x83, codecId: 0x86, trackName: 0x536e, video: 0xe0, pixelWidth: 0xb0, pixelHeight: 0xba,
} as const
const SEGMENT_NEUTRAL = new Set<number>([ID.seekHead, ID.info, ID.tracks, ID.cues, ID.cluster, ID.void, ID.crc])
const SEGMENT_METADATA = new Set<number>([ID.tags, ID.attachments, ID.chapters])
const INFO_METADATA = new Set<number>([ID.title, ID.dateUtc, ID.segmentFilename, ID.prevFilename, ID.nextFilename])

type El = { id: number; start: number; content: number; end: number | null }
type SizedEl = El & { end: number }

/** One EBML element header at `p`: the id (with its marker), the size (null when "unknown") and where the payload starts. */
function element(r: Reader, p: number, end: number): El {
  if (end - p < 2) throw broken()
  const head = r.read(p, Math.min(12, end - p))
  const nId = Math.clz32(head[0]) - 23
  if (nId < 1 || nId > 4 || head.length < nId + 1) throw broken()
  let id = 0
  for (let i = 0; i < nId; i++) id = id * 256 + head[i]
  const nSize = Math.clz32(head[nId]) - 23
  if (nSize < 1 || nSize > 8 || head.length < nId + nSize) throw broken()
  let size = head[nId] & (0xff >> nSize)
  let allOnes = size === 0xff >> nSize
  for (let i = 1; i < nSize; i++) {
    size = size * 256 + head[nId + i]
    allOnes &&= head[nId + i] === 0xff
  }
  const content = p + nId + nSize
  if (allOnes) return { id, start: p, content, end: null }
  if (!Number.isSafeInteger(size) || content + size > end) throw broken()
  return { id, start: p, content, end: content + size }
}

function elements(r: Reader, start: number, end: number): SizedEl[] {
  const list: SizedEl[] = []
  let p = start
  while (p < end) {
    const e = element(r, p, end)
    if (e.end === null) throw format('live')
    list.push(e as SizedEl)
    if (list.length > 65536) throw broken()
    p = e.end
  }
  return list
}

/** The patch that turns the element into a `Void` element of the same total size. */
function voidElement(e: SizedEl): Patch {
  const total = e.end - e.start
  if (total < 2) throw broken()
  const b = new Uint8Array(total)
  b[0] = ID.void
  if (total - 2 <= 126) b[1] = 0x80 | (total - 2)
  else {
    // an 8-byte size: marker 0x01 and 56 bits (the protocol writes the low 48 at offset 3)
    if (total < 9) throw broken()
    b[1] = 0x01
    let n = total - 9
    for (let i = 8; i >= 3; i--) {
      b[i] = n % 256
      n = Math.floor(n / 256)
    }
  }
  return { at: e.start, bytes: b }
}

function inspectWebm(r: Reader): Inspected {
  const header = element(r, 0, r.size)
  if (header.id !== ID.ebml || header.end === null || header.end - header.content > 256) throw broken()
  const docType = elements(r, header.content, header.end).find((e) => e.id === ID.docType)
  if (!docType || latin1(r.read(docType.content, docType.end - docType.content)).replace(/\0+$/, '') !== 'webm') throw format('not_video')
  const seg = element(r, header.end, r.size)
  if (seg.id !== ID.segment) throw broken()
  if (seg.end === null) throw format('live')
  if (seg.end !== r.size) throw broken()
  const patches: Patch[] = []
  let info: SizedEl | null = null
  let tracks: SizedEl | null = null
  let clusters = 0
  let index = 0
  for (const e of elements(r, seg.content, seg.end)) {
    if (SEGMENT_METADATA.has(e.id)) {
      patches.push(voidElement(e))
      continue
    }
    if (!SEGMENT_NEUTRAL.has(e.id)) throw broken()
    if (e.id === ID.cluster) {
      clusters++
      continue
    }
    if (e.id !== ID.void) index += e.end - e.start
    if (e.id === ID.info) {
      if (info) throw broken()
      info = e
    }
    if (e.id === ID.tracks) {
      if (tracks) throw broken()
      tracks = e
    }
  }
  if (!info || !tracks || clusters === 0) throw broken()
  if (index > VIDEO_LIMITS.indexMaxBytes) throw broken()

  let scale = 1_000_000
  let duration: number | null = null
  for (const e of elements(r, info.content, info.end)) {
    if (INFO_METADATA.has(e.id)) patches.push(voidElement(e))
    else if (e.id === ID.timecodeScale) scale = uintBE(r.read(e.content, e.end - e.content))
    else if (e.id === ID.duration) {
      const b = r.read(e.content, e.end - e.content)
      if (b.length !== 4 && b.length !== 8) throw broken()
      duration = b.length === 4 ? view(b).getFloat32(0) : view(b).getFloat64(0)
    }
  }
  if (duration === null || !Number.isFinite(duration) || duration <= 0 || scale <= 0) throw format('no_duration')
  const durationMs = Math.round((duration * scale) / 1_000_000)

  let video: { codec: string; width: number; height: number } | null = null
  let audio: { codec: string } | null = null
  for (const track of elements(r, tracks.content, tracks.end)) {
    if (track.id === ID.void || track.id === ID.crc) continue
    if (track.id !== ID.trackEntry) throw broken()
    const fields = elements(r, track.content, track.end)
    const field = (id: number) => fields.find((c) => c.id === id)
    const kindEl = field(ID.trackType)
    const codecEl = field(ID.codecId)
    if (!kindEl || !codecEl) throw broken()
    const kind = uintBE(r.read(kindEl.content, kindEl.end - kindEl.content))
    const codec = latin1(r.read(codecEl.content, Math.min(32, codecEl.end - codecEl.content))).replace(/\0+$/, '')
    for (const c of fields) if (c.id === ID.trackName) patches.push(voidElement(c))
    if (kind === 1) {
      if (video) throw format()
      if (!(CODECS.webm.video as readonly string[]).includes(codec)) throw format()
      const frame = field(ID.video)
      if (!frame) throw broken()
      const dims = elements(r, frame.content, frame.end)
      const measure = (id: number) => {
        const e = dims.find((c) => c.id === id)
        if (!e) throw broken()
        return uintBE(r.read(e.content, e.end - e.content))
      }
      video = { codec, width: measure(ID.pixelWidth), height: measure(ID.pixelHeight) }
    } else if (kind === 2) {
      if (audio) throw format()
      if (!(CODECS.webm.audio as readonly string[]).includes(codec)) throw format()
      audio = { codec }
    } else throw format()
  }
  if (!video) throw format()
  return { format: 'webm', durationMs, width: video.width, height: video.height, videoCodec: CODEC_NAME[video.codec], audioCodec: audio ? CODEC_NAME[audio.codec] : null, patches }
}

// ---------- inspection and cleaning ----------

export type VideoRefusal = { ok: false; code: VideoRefusalCode; reason: VideoRefusalReason; bytes?: number; durationMs?: number; width?: number; height?: number }
export type VideoInspection = ({ ok: true; bytes: number } & Inspected) | VideoRefusal

/**
 * Reads the container and says what the video is, or why it is refused (the protocol's `inspecionarVideo`). `patches` is what
 * `cleanVideo` would write: a clean file has none. Never throws on bad bytes.
 */
export function inspectVideo(bytes: Uint8Array): VideoInspection {
  try {
    const r = new Reader(bytes)
    if (r.size > VIDEO_LIMITS.bytesMax) throw new Refusal('video_grande', 'big', { bytes: r.size })
    if (r.size < 32) throw format('not_video')
    const kind = videoFormatOf(r.read(0, 12))
    if (!kind) throw format('not_video')
    const x = kind === 'mp4' ? inspectMp4(r) : inspectWebm(r)
    if (Math.floor(x.durationMs / 1000) > VIDEO_LIMITS.durationMaxS) throw new Refusal('video_longo', 'long', { durationMs: x.durationMs })
    if (x.durationMs < 1) throw broken()
    if (x.width < 1 || x.height < 1) throw broken()
    if (x.width > VIDEO_LIMITS.sideMaxPx || x.height > VIDEO_LIMITS.sideMaxPx) throw new Refusal('dimensoes_grandes', 'dims', { width: x.width, height: x.height })
    return { ok: true, ...x, bytes: r.size }
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, code: e.code, reason: e.reason, ...e.extra }
    if (e instanceof RangeError) return { ok: false, code: 'video_invalido', reason: 'broken' }
    throw e
  }
}

/** A video as it leaves the device: the cleaned bytes, their address and what the container says. */
export interface CleanVideo {
  bytes: Uint8Array
  hash: string
  format: VideoFormat
  durationMs: number
  width: number
  height: number
  videoCodec: string
  audioCodec: string | null
  /** something was taken out */
  changed: boolean
}

/**
 * Cleans a video held in memory (the protocol's `limparVideo`): applies the patches on a COPY, checks the copy reads the same with
 * nothing left to clean, and hashes it.
 */
export async function cleanVideo(input: Uint8Array, subtle?: SubtleCrypto): Promise<({ ok: true } & CleanVideo) | VideoRefusal> {
  const r = inspectVideo(input)
  if (!r.ok) return r
  const out = new Uint8Array(input)
  for (const p of r.patches) out.set(p.bytes, p.at)
  if (r.patches.length) {
    // the output must read the same and have nothing left to patch: a file the cleaning cannot settle is refused, not half cleaned
    const again = inspectVideo(out)
    if (!again.ok || again.patches.length) return { ok: false, code: 'video_invalido', reason: 'broken' }
  }
  const { format: f, durationMs, width, height, videoCodec, audioCodec } = r
  return { ok: true, bytes: out, hash: await sha256Hex(out, subtle), format: f, durationMs, width, height, videoCodec, audioCodec, changed: r.patches.length > 0 }
}

// ---------- what the composer checks before reading the whole file ----------

/** The first check of a picked file, before it is read whole: the size, then the container by the first bytes. Null when it can go on. */
export async function checkPickedVideo(file: Blob): Promise<VideoRefusal | null> {
  if (file.size > VIDEO_LIMITS.bytesMax) return { ok: false, code: 'video_grande', reason: 'big', bytes: file.size }
  if (file.size < 32) return { ok: false, code: 'formato_nao_aceito', reason: 'not_video' }
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  return videoFormatOf(head) ? null : { ok: false, code: 'formato_nao_aceito', reason: 'not_video' }
}

/** A picked file read whole and cleaned (cleanVideo), after the first check (checkPickedVideo). */
export async function prepareVideo(file: Blob): Promise<({ ok: true } & CleanVideo) | VideoRefusal> {
  const first = await checkPickedVideo(file)
  if (first) return first
  return cleanVideo(new Uint8Array(await file.arrayBuffer()))
}

export { formatDuration } from '../videos'

/** "8,4 MB": a size in the page language, one decimal. */
export function formatMegabytes(bytes: number, lang: string): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(bytes / 1048576)
}
