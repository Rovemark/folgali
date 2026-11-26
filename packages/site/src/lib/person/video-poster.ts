// The poster frame of a video (protocol 0.11.0 part 3): the relay never decodes nor extracts frames, so the device draws one. The
// cleaned bytes play in a hidden <video> on this page only (a blob address, nothing leaves), the first useful frame is drawn on a canvas
// and reduced like an image attachment (prepareAttachment: JPEG, cleaned, under 1 MiB, longest side 2048). Null when this browser
// cannot decode the video (a codec it does not play) or takes too long: the video still goes, without a poster.
import { canvasEncoder, prepareAttachment, type Prepared } from './media'

/** Where to look for the first useful frame: the very start often is a black fade in. */
const MOMENTS_S = [0.05, 0.6, 1.5] as const
/** A frame whose average brightness (0 to 255) is under this is "black": the next moment is tried. */
const DARK = 20

function once(el: HTMLMediaElement, ok: string, timeoutMs: number): Promise<boolean> {
  return new Promise((done) => {
    const clear = () => {
      el.removeEventListener(ok, yes)
      el.removeEventListener('error', no)
      clearTimeout(timer)
    }
    const yes = () => {
      clear()
      done(true)
    }
    const no = () => {
      clear()
      done(false)
    }
    const timer = setTimeout(no, timeoutMs)
    el.addEventListener(ok, yes)
    el.addEventListener('error', no)
  })
}

/** The average brightness of the current frame, from a tiny copy. */
function brightness(v: HTMLVideoElement): number {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 9
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 255
  ctx.drawImage(v, 0, 0, 16, 9)
  const d = ctx.getImageData(0, 0, 16, 9).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
  return sum / (d.length / 4)
}

/** Draws and prepares the poster of a cleaned video, or null. */
export async function drawPoster(bytes: Uint8Array, mime: string, timeoutMs = 8000): Promise<Prepared | null> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  try {
    if (!(await once(v, 'loadeddata', timeoutMs)) || !v.videoWidth || !v.videoHeight) return null
    const last = Math.max(0, (Number.isFinite(v.duration) ? v.duration : 0) - 0.05)
    let found = false
    for (const at of MOMENTS_S) {
      const t = Math.min(at, last)
      if (Math.abs(v.currentTime - t) > 0.001) {
        v.currentTime = t
        if (!(await once(v, 'seeked', timeoutMs))) break
      }
      found = true
      if (brightness(v) >= DARK || t >= last) break
    }
    if (!found) return null
    return await prepareAttachment({ width: v.videoWidth, height: v.videoHeight }, canvasEncoder(v))
  } catch {
    return null
  } finally {
    v.removeAttribute('src')
    v.load()
    URL.revokeObjectURL(url)
  }
}
