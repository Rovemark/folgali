// The video of a publication (protocol 0.11.0 part 3, `video`): one per post, reply, forum topic or forum reply, never next to
// images. Light on purpose (it goes to the browser): the type, the addresses and the check of what came from the relay.
//
// The same rule as the images (src/lib/images.ts): the `src` of a video and of its poster is ALWAYS this site's own domain
// (`/video/<hash>.<ext>`, `/midia/<hash>.<ext>`), built only from a checked hash. Never an address that came ready from outside, not
// even the short presigned URL the relay may answer with: the site's route follows it on the server.
import { EXTENSION, IMAGE_FORMATS, HASH_RE, IMAGE_LIMITS, type ImageFormat } from './images'

export const VIDEO_FORMATS = ['mp4', 'webm'] as const
export type VideoFormat = (typeof VIDEO_FORMATS)[number]
export const VIDEO_MIME_TYPE: Record<VideoFormat, string> = { mp4: 'video/mp4', webm: 'video/webm' }

/** LIMITES_DE_VIDEO of the protocol. */
export const VIDEO_LIMITS = { bytesMax: 50 * 1048576, duracaoMaxS: 60, ladoMaxPx: 4096, altMax: 280 } as const
/** The same short cache as the images: a video the moderation takes down leaves the caches in minutes. */
export const VIDEO_CACHE = 'public, max-age=300'
/** The file name on the site's route: the hash and the extension of the format. */
export const VIDEO_FILE_RE = /^([0-9a-f]{64})\.(mp4|webm)$/

export interface VideoThumbnail {
  hash: string
  formato: ImageFormat
  largura: number
  altura: number
}

export interface NetworkVideo {
  /** the `video` object (a report of the video points here) */
  id?: string
  hash: string
  formato: VideoFormat
  largura: number
  altura: number
  bytes: number
  duracaoMs: number
  /** the author's description; empty when she wrote none (the screen then gives a generic name) */
  alt: string
  /** the poster frame the author's device drew and uploaded, or null */
  miniatura: VideoThumbnail | null
}

/** A video answer of the relay, as the site's route passes it on: the status, the headers that matter, the streamed body. */
export interface VideoResponse {
  status: 200 | 206 | 416
  formato: VideoFormat
  tamanho: number | null
  faixa: string | null
  corpo: ReadableStream<Uint8Array> | null
}

/** One byte range the way a player asks for it (`bytes=0-`, `bytes=100-199`, `bytes=-500`); anything else is not passed on. */
export const RANGE_RE = /^bytes=(?:\d{1,12}-\d{0,12}|-\d{1,12})$/

/** The address of the video on this site, or null when the hash or the format is not valid. */
export function videoUrl(v: Pick<NetworkVideo, 'hash' | 'formato'>): string | null {
  if (typeof v.hash !== 'string' || !HASH_RE.test(v.hash) || !(VIDEO_FORMATS as readonly string[]).includes(v.formato)) return null
  return `/video/${v.hash}.${v.formato}`
}

/** The address of the poster on this site (the image route), or null. */
export function thumbnailUrl(m: VideoThumbnail | null | undefined): string | null {
  if (!m || typeof m.hash !== 'string' || !HASH_RE.test(m.hash) || !(IMAGE_FORMATS as readonly string[]).includes(m.formato)) return null
  return `/midia/${m.hash}.${EXTENSION[m.formato]}`
}

const integerBetween = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max

/** The poster of a video from the relay; anything that does not match the protocol is null (the video stays, without a poster). */
export function sanitizeThumbnail(x: unknown): VideoThumbnail | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  if (typeof o.hash !== 'string' || !HASH_RE.test(o.hash)) return null
  if (typeof o.formato !== 'string' || !(IMAGE_FORMATS as readonly string[]).includes(o.formato)) return null
  if (!integerBetween(o.largura, 1, IMAGE_LIMITS.ladoMaxPx) || !integerBetween(o.altura, 1, IMAGE_LIMITS.ladoMaxPx)) return null
  return { hash: o.hash, formato: o.formato as ImageFormat, largura: o.largura, altura: o.altura }
}

/**
 * Checks a video that came from the relay. Only the known fields are copied (anything else the relay sends is dropped); a field that
 * does not match the protocol makes the whole video null (the screen does not show it). A poster in a crooked shape only loses the poster.
 */
export function sanitizeVideo(x: unknown): NetworkVideo | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  if (typeof o.hash !== 'string' || !HASH_RE.test(o.hash)) return null
  if (typeof o.formato !== 'string' || !(VIDEO_FORMATS as readonly string[]).includes(o.formato)) return null
  if (!integerBetween(o.largura, 1, VIDEO_LIMITS.ladoMaxPx) || !integerBetween(o.altura, 1, VIDEO_LIMITS.ladoMaxPx)) return null
  if (!integerBetween(o.bytes, 1, VIDEO_LIMITS.bytesMax)) return null
  if (!integerBetween(o.duracaoMs, 1, (VIDEO_LIMITS.duracaoMaxS + 1) * 1000 - 1)) return null
  const alt = typeof o.alt === 'string' ? o.alt.trim() : ''
  if ([...alt].length > VIDEO_LIMITS.altMax || /[\r\n]/.test(alt)) return null
  const thumbnail = sanitizeThumbnail(o.miniatura)
  // the poster is an image, never the video itself
  const v: NetworkVideo = { hash: o.hash, formato: o.formato as VideoFormat, largura: o.largura, altura: o.altura, bytes: o.bytes, duracaoMs: o.duracaoMs, alt, miniatura: thumbnail && thumbnail.hash !== o.hash ? thumbnail : null }
  if (typeof o.id === 'string' && /^ob_[A-Za-z0-9_-]{43}$/.test(o.id)) v.id = o.id
  return v
}

/** The video field of an item the relay sent, only when there is one to show. */
export function videoOf(o: { video?: unknown }): { video?: NetworkVideo } {
  const v = sanitizeVideo(o.video)
  return v ? { video: v } : {}
}

/** "0:07", "1:00": the duration as a player shows it (whole seconds, rounded down like the protocol's limit). */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
