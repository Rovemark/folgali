// Network images (protocol revision 0.5.0, proposal 0005): profile portrait and up to 4 attachments per post. This module is light
// and can go to the browser: only the type, the address and the check of what came from outside.
//
// Site rule: the `src` of a network image is ALWAYS the same domain as the site (`/midia/<hash>.<ext>`), built only from the
// checked hash. Never a third-party address, never an address that came ready-made from outside. Whoever serves `/midia/...` is the site's
// own route, which fetches from the network client (fake or relay).

export const IMAGE_FORMATS = ['jpeg', 'png', 'webp'] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]

export const EXTENSION: Record<ImageFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }
export const MIME_TYPE: Record<ImageFormat, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** The same limits as the protocol (packages/protocol/src/limits.js, LIMITES_DE_MIDIA). */
export const IMAGE_LIMITS = { bytesMax: 1048576, ladoMaxPx: 4096, anexosPorPostagem: 4, altMax: 280 } as const
/** CACHE_DE_MIDIA of the protocol (25/11/2026): short, so a picture the moderation takes down leaves the caches in minutes. */
export const IMAGE_CACHE = 'public, max-age=300'

export const HASH_RE = /^[0-9a-f]{64}$/
/** The file name in the site route: the hash and the format extension. */
export const FILE_RE = /^([0-9a-f]{64})\.(jpg|png|webp)$/

export interface NetworkImage {
  /** the `imagem` object, when the relay sends it (a report of the photo points here) */
  id?: string
  /** SHA-256 of the clean bytes, in hexadecimal: the image address on the relay. */
  hash: string
  formato: ImageFormat
  largura: number
  altura: number
  /**
   * Alternative text. Up to 0.10.0 it was required; since 0.11.0 the author may leave it empty (`''`): the screen then gives the image a
   * generic name ("Imagem publicada por ..."), never an empty `alt` on an attachment.
   */
  alt: string
}

/** The image address on the site itself, or null if the hash or the format is not valid. */
export function imageUrl(i: Pick<NetworkImage, 'hash' | 'formato'>): string | null {
  if (typeof i.hash !== 'string' || !HASH_RE.test(i.hash) || !(IMAGE_FORMATS as readonly string[]).includes(i.formato)) return null
  return `/midia/${i.hash}.${EXTENSION[i.formato]}`
}

/**
 * The image portrait on a short card (`imagem` on the relay's `RoverResumo`, 2026-11-26): only what it takes to build the address. The
 * same image as `retratoImagem` on the profile; absent on an older relay, and then the screen draws the plush.
 */
export type PortraitPhoto = Pick<NetworkImage, 'hash' | 'formato'>

/** Checks the card portrait that came from the relay (or the profile's `retratoImagem`): a valid hash and a known format, or null. */
export function sanitizePortraitPhoto(x: unknown): PortraitPhoto | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  if (typeof o.hash !== 'string' || !HASH_RE.test(o.hash)) return null
  if (typeof o.formato !== 'string' || !(IMAGE_FORMATS as readonly string[]).includes(o.formato)) return null
  return { hash: o.hash, formato: o.formato as ImageFormat }
}

const integerBetween =(v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max

/** Checks an image that came from the relay. What does not match the protocol becomes null (the screen does not show it). */
export function sanitizeImage(x: unknown): NetworkImage | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.hash !== 'string' || !HASH_RE.test(o.hash)) return null
  if (typeof o.formato !== 'string' || !(IMAGE_FORMATS as readonly string[]).includes(o.formato)) return null
  if (!integerBetween(o.largura, 1, IMAGE_LIMITS.ladoMaxPx) || !integerBetween(o.altura, 1, IMAGE_LIMITS.ladoMaxPx)) return null
  if (typeof o.alt !== 'string') return null
  // 0.11.0: an empty alternative text is valid (the author wrote none); too long is still refused
  const alt = o.alt.trim()
  if ([...alt].length > IMAGE_LIMITS.altMax) return null
  const i: NetworkImage = { hash: o.hash, formato: o.formato as ImageFormat, largura: o.largura, altura: o.altura, alt }
  if (typeof o.id === 'string' && /^ob_[A-Za-z0-9_-]{43}$/.test(o.id)) i.id = o.id
  return i
}

/** A list of relay attachments: at most 4, only those that check out. */
export function sanitizeImages(x: unknown): NetworkImage[] {
  if (!Array.isArray(x)) return []
  return x.slice(0, IMAGE_LIMITS.anexosPorPostagem).map(sanitizeImage).filter((i): i is NetworkImage => i !== null)
}

/** 0.11.0: how many attachments the moderation removed from an item (`anexosRemovidos`). Anything that is not 1 to 4 counts as none. */
export function sanitizeRemovedAttachments(x: unknown): number {
  return Number.isSafeInteger(x) && (x as number) >= 1 ? Math.min(x as number, IMAGE_LIMITS.anexosPorPostagem) : 0
}

/** The attachment fields of an item the relay sent (`imagens`, `anexosRemovidos`), each only when there is something to show. */
export function attachmentsOf(o: { imagens?: unknown; anexosRemovidos?: unknown }): { imagens?: NetworkImage[]; anexosRemovidos?: number } {
  const images = sanitizeImages(o.imagens)
  const removed = sanitizeRemovedAttachments(o.anexosRemovidos)
  return { ...(images.length ? { imagens: images } : {}), ...(removed ? { anexosRemovidos: removed } : {}) }
}
