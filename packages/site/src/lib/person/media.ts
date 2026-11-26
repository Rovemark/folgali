// A person's own profile photo (decision of 25/11/2026), on the BROWSER side:
//   1. the picture the person chose is decoded and drawn on a canvas at the crop she picked, and encoded again as JPEG: the pixels are
//      recoded here, so nothing of the original file (metadata, location, a second file hidden after the image) survives;
//   2. the JPEG segments the relay would strip anyway (APPn and COM, which hold JFIF, EXIF and comments) are taken out with the SAME
//      rules as the protocol's `limparImagem` (packages/protocol/src/media.js), so the hash computed here is the relay's hash;
//   3. the upload credential (`Rover-Envio`) is signed with the device key, for `PUT /v1/midia/<hash>` only.
// No dependency: this file runs in the browser.
import { canonical, toB64u } from './device'

export const PHOTO_FORMATS = ['image/jpeg', 'image/png', 'image/webp'] as const
/** The picture the person picks, before it is reduced here (a phone photo is often 3 to 8 MB). */
export const PHOTO_INPUT_MAX_BYTES = 15 * 1048576
/** What the relay takes after cleaning (LIMITES_DE_MIDIA.bytesMax). The recoded JPEG stays well under. */
export const PHOTO_MAX_BYTES = 1048576
/** Output sizes: a square portrait and a 3:1 cover. */
export const PHOTO_SHAPES = { retrato: { width: 640, height: 640 }, capa: { width: 1500, height: 500 } } as const
export type PhotoUse = keyof typeof PHOTO_SHAPES

/** The format by the first bytes, never by the name or the type the browser guessed. GIF, SVG, HEIC and the rest: null. */
export function sniffFormat(b: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'png'
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'webp'
  return null
}

/** An animated WebP (ANIM chunk or the animation bit of VP8X). The relay refuses it; the browser would only keep the first frame. */
export function isAnimatedWebp(b: Uint8Array): boolean {
  if (sniffFormat(b) !== 'webp' || b.length < 21) return false
  const vp8x = String.fromCharCode(...b.subarray(12, 16)) === 'VP8X'
  return (vp8x && (b[20] & 0x02) !== 0) || String.fromCharCode(...b.subarray(0, Math.min(b.length, 4096))).includes('ANIM')
}

class BadJpeg extends Error {}

/**
 * The JPEG as the relay keeps it: SOI, DQT, DHT, DRI, one SOF0/1/2, SOS with its data, EOI. APP0 to APP15 and COM go, fill bytes go,
 * anything after EOI goes. The same walk as `limparJpeg` in the protocol, for the JPEG a canvas writes (baseline, 8 bits, 3 components).
 */
export function cleanJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [Uint8Array.of(0xff, 0xd8)]
  let i = 2
  let frame = false
  let scans = 0
  const keep = new Set([0xdb, 0xc4, 0xdd, 0xc0, 0xc1, 0xc2])
  for (;;) {
    if (i >= b.length || b[i] !== 0xff) throw new BadJpeg('jpeg')
    while (i < b.length && b[i] === 0xff) i++
    const m = b[i++]
    if (m === 0xd9) {
      if (!frame || scans === 0) throw new BadJpeg('jpeg')
      out.push(Uint8Array.of(0xff, 0xd9))
      break
    }
    if (i + 2 > b.length) throw new BadJpeg('jpeg')
    const len = (b[i] << 8) | b[i + 1]
    if (len < 2 || i + len > b.length) throw new BadJpeg('jpeg')
    const segment = b.subarray(i - 2, i + len)
    i += len
    if ((m >= 0xe0 && m <= 0xef) || m === 0xfe) continue
    if (m === 0xda) {
      out.push(segment)
      const start = i
      for (;;) {
        if (i + 1 >= b.length) throw new BadJpeg('jpeg')
        if (b[i] === 0xff && b[i + 1] !== 0x00 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7)) break
        i += b[i] === 0xff ? 2 : 1
      }
      out.push(b.subarray(start, i))
      scans++
      continue
    }
    if (!keep.has(m)) throw new BadJpeg('jpeg')
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) frame = true
    out.push(segment)
  }
  const total = out.reduce((n, x) => n + x.length, 0)
  const joined = new Uint8Array(total)
  let at = 0
  for (const x of out) {
    joined.set(x, at)
    at += x.length
  }
  return joined
}

export async function sha256Hex(bytes: Uint8Array, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const d = new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource))
  return [...d].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** The upload credential domain of the protocol (0.5.0): an upload credential never reads and a read credential never uploads. */
export const UPLOAD_DOMAIN = 'rover-network/0.3/envio-de-midia\n'

/** `Authorization: Rover-Envio ...` for one `PUT /v1/midia/<hash>`, signed with the device key, valid for two minutes. */
export async function signUpload(key: CryptoKey, uid: string, target: string, t = Math.floor(Date.now() / 1000), subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const enc = new TextEncoder()
  const head = enc.encode(UPLOAD_DOMAIN)
  const body = enc.encode(canonical({ alvo: target, metodo: 'PUT', t, uid }))
  const msg = new Uint8Array(head.length + body.length)
  msg.set(head, 0)
  msg.set(body, head.length)
  return `Rover-Envio uid=${uid}, t=${t}, a=${toB64u(await subtle.sign('Ed25519', key, msg))}`
}

/** The crop the person picked: the zoom (1 = the whole short side fits) and the center, from 0 to 1 on each axis. */
export interface Crop {
  zoom: number
  x: number
  y: number
}

/** The source rectangle of a crop with the output's aspect, inside an image of `w` by `h`. */
export function cropRect(w: number, h: number, aspect: number, crop: Crop): { sx: number; sy: number; sw: number; sh: number } {
  let sw = w
  let sh = w / aspect
  if (sh > h) {
    sh = h
    sw = h * aspect
  }
  const z = Math.min(4, Math.max(1, crop.zoom))
  sw /= z
  sh /= z
  const sx = Math.min(w - sw, Math.max(0, crop.x * w - sw / 2))
  const sy = Math.min(h - sh, Math.max(0, crop.y * h - sh / 2))
  return { sx, sy, sw, sh }
}

export interface Prepared {
  bytes: Uint8Array
  hash: string
  width: number
  height: number
}

/** Draws the crop on a canvas, encodes a JPEG (lowering the quality until it fits), cleans it and hashes it. */
export async function preparePhoto(image: ImageBitmap, use: PhotoUse, crop: Crop): Promise<Prepared> {
  const { width, height } = PHOTO_SHAPES[use]
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  const r = cropRect(image.width, image.height, width / height, crop)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, width, height)
  for (const quality of [0.86, 0.78, 0.68, 0.56]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', quality))
    if (!blob) continue
    const bytes = cleanJpeg(new Uint8Array(await blob.arrayBuffer()))
    if (bytes.length <= PHOTO_MAX_BYTES * 0.9) return { bytes, hash: await sha256Hex(bytes), width, height }
  }
  throw new Error('too_big')
}

// ---------- attachments of a publication (protocol 0.11.0, `midia-livre`) ----------

/** How many images one publication carries (LIMITES_DE_MIDIA.anexosPorPostagem). */
export const ATTACH_MAX = 4
/** The longest side of an attachment after it is reduced here. The relay takes up to 4096; 2048 keeps a phone photo sharp and light. */
export const ATTACH_MAX_SIDE = 2048
/** Alternative text of an attachment: optional, one line, no address, up to this many characters (LIMITES_DE_MIDIA.alt.max). */
export const ATTACH_ALT_MAX = 280
/** JPEG qualities tried in order until the file fits. */
export const ATTACH_QUALITIES = [0.86, 0.78, 0.68, 0.56, 0.44] as const

export type PickProblem = 'type' | 'big' | 'animated'

/** Checks a picked file before decoding it: size, then the format by the first bytes. Null when it can go on. */
export async function checkPickedFile(file: Blob): Promise<PickProblem | null> {
  if (file.size > PHOTO_INPUT_MAX_BYTES) return 'big'
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
  if (!sniffFormat(head)) return 'type'
  if (isAnimatedWebp(head)) return 'animated'
  return null
}

/** The size an image of `w` by `h` leaves with: same proportion, longest side at most `max`, never enlarged, never under 1 px. */
export function fitInside(w: number, h: number, max = ATTACH_MAX_SIDE): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) throw new Error('size')
  const k = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

/** What an alternative text cannot have (the relay refuses it): a line break or an address. Null when it is fine. */
export function altProblem(alt: string): 'long' | 'line' | 'url' | null {
  if ([...alt.trim()].length > ATTACH_ALT_MAX) return 'long'
  if (/[\r\n]/.test(alt.trim())) return 'line'
  if (/(?:https?:\/\/|www\.)\S/i.test(alt)) return 'url'
  return null
}

/** Encodes the picture at `width` by `height` as JPEG with this quality. Null when the browser could not. */
export type JpegEncoder = (width: number, height: number, quality: number) => Promise<Uint8Array | null>

/** The encoder the browser uses: the picture drawn on a white canvas (transparency turns white), so only pixels leave. */
export function canvasEncoder(image: CanvasImageSource): JpegEncoder {
  let canvas: HTMLCanvasElement | null = null
  return async (width, height, quality) => {
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, width, height)
    }
    const c = canvas
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', quality))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  }
}

/**
 * An attachment as it leaves the device: the whole picture (no crop), same proportion, longest side at most 2048 px, recoded as JPEG
 * and cleaned like the profile photo (no EXIF, no location, nothing after the end of the image), under 1 MiB. The quality steps down
 * until it fits; if even the lowest does not, the picture is halved once and tried again. `too_big` when nothing fits.
 */
export async function prepareAttachment(image: { width: number; height: number }, encode: JpegEncoder = canvasEncoder(image as unknown as CanvasImageSource)): Promise<Prepared> {
  let size = fitInside(image.width, image.height)
  for (let round = 0; round < 2; round++) {
    for (const quality of ATTACH_QUALITIES) {
      const raw = await encode(size.width, size.height, quality)
      if (!raw) continue
      const bytes = cleanJpeg(raw)
      if (bytes.length <= PHOTO_MAX_BYTES) return { bytes, hash: await sha256Hex(bytes), width: size.width, height: size.height }
    }
    size = fitInside(size.width, size.height, Math.max(size.width, size.height) / 2)
  }
  throw new Error('too_big')
}

/** A picked file as it will leave: decoded by the browser and prepared (prepareAttachment). Throws when the browser cannot decode it. */
export async function prepareFile(file: Blob): Promise<Prepared> {
  const image = await createImageBitmap(file)
  try {
    return await prepareAttachment(image)
  } finally {
    image.close()
  }
}
