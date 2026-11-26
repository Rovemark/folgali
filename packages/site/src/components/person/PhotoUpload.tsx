'use client'

// "Upload photo" for the portrait (square) or the cover (3:1) in Settings > Profile. On a phone the file field opens the camera or the
// gallery. The picture is checked by its first bytes (JPEG, PNG or WebP; no GIF, no SVG, no animation), decoded, cropped by the person
// (drag to move, slider to zoom) and recoded on a canvas (src/lib/person/media.ts); then the device signs the upload and the `imagem`
// object. The relay checks it all again.
import { useEffect, useId, useRef, useState } from 'react'
import { PersonError, uploadProfilePhoto, type UploadedPhoto } from '@/lib/person/client'
import { PHOTO_SHAPES, checkPickedFile, cropRect, preparePhoto, type Crop, type PhotoUse } from '@/lib/person/media'
import { refusalText, waitOf } from '@/lib/person/refusal'
import type { AttachTexts } from '@/i18n/attach'
import type { PhotoTexts } from '@/i18n/photo'

type Props = {
  use: PhotoUse
  t: PhotoTexts
  /** the person's display name, for the alt text of the photo */
  name: string
  onDone: (photo: UploadedPhoto & { preview: string }) => void
  /** the refusals that say how long is left (protocol 0.11.0), in the page language */
  r?: AttachTexts['refusals']
  lang?: string
}

type ErrorKey = keyof PhotoTexts['errors']

/** What a relay or site refusal means for the person. */
export function photoError(e: unknown): ErrorKey {
  const code = e instanceof PersonError ? e.code : e instanceof Error ? e.message : ''
  if (code === 'formato_nao_aceito') return 'type'
  if (code === 'imagem_grande' || code === 'too_big') return 'big'
  if (code === 'conta_nova') return 'young'
  if (code === 'limite_de_taxa') return 'limit'
  if (code === 'minor') return 'minor'
  if (code === 'nao_encontrado' || code === 'indisponivel') return 'off'
  return 'generic'
}

/** The 0.11.0 refusals that have their own sentence whatever the wait: no media space, a file the moderation removed, too many images. */
const OWN_SENTENCE = new Set(['cota_de_midia', 'midia_recusada', 'limite_de_estrutura'])

/**
 * The sentence the person reads for a refusal. When the relay says how long is left (`retryAfterS`), the limit and the new-account
 * refusals say it ("Você chegou ao limite de trocas de foto do perfil. Libera em 3 horas."); without a wait, the texts of the photo
 * screen stay as they were.
 */
export function photoRefusal(e: unknown, t: PhotoTexts, r?: AttachTexts['refusals'], lang = 'pt'): string {
  const code = e instanceof PersonError ? e.code : ''
  const own = r && (waitOf(e) !== null || OWN_SENTENCE.has(code)) ? refusalText(e, r, lang, 'photos') : null
  return own ?? t.errors[photoError(e)]
}

/** Checks a picked file before decoding it: size, then the format by the first bytes. Null when it can go on. */
export const checkPicked: (file: Blob) => Promise<ErrorKey | null> = checkPickedFile

export default function PhotoUpload({ use, t, name, onDone, r, lang }: Props) {
  const id = useId()
  const [image, setImage] = useState<ImageBitmap | null>(null)
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0.5, y: 0.5 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null)
  const shape = PHOTO_SHAPES[use]
  const aspect = shape.width / shape.height

  // the preview: the crop as it will leave, small
  useEffect(() => {
    const c = canvas.current
    if (!image || !c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const r = cropRect(image.width, image.height, aspect, crop)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height)
  }, [image, crop, aspect])

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    setError(null)
    if (!file) return
    const problem = await checkPicked(file)
    if (problem) return setError(t.errors[problem])
    try {
      setImage(await createImageBitmap(file))
      setCrop({ zoom: 1, x: 0.5, y: 0.5 })
    } catch {
      setError(t.errors.type)
    }
  }

  async function send() {
    if (!image || busy) return
    setBusy(true)
    setError(null)
    try {
      const prepared = await preparePhoto(image, use, crop)
      const alt = (use === 'retrato' ? t.altPortrait : t.altCover).replace('{nome}', name.trim() || '@')
      const photo = await uploadProfilePhoto(prepared, use, alt.slice(0, 280))
      const preview = URL.createObjectURL(new Blob([prepared.bytes as BlobPart], { type: 'image/jpeg' }))
      setImage(null)
      onDone({ ...photo, preview })
    } catch (x) {
      setError(photoRefusal(x, t, r, lang))
    } finally {
      setBusy(false)
    }
  }

  // drag to move the crop: the movement is turned into a share of the picture, slower when zoomed in
  const down = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, crop }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    const c = canvas.current
    if (!d || !c) return
    const box = c.getBoundingClientRect()
    const dx = (e.clientX - d.x) / box.width / d.crop.zoom
    const dy = (e.clientY - d.y) / box.height / d.crop.zoom
    setCrop({ ...d.crop, x: Math.min(1, Math.max(0, d.crop.x - dx)), y: Math.min(1, Math.max(0, d.crop.y - dy)) })
  }
  const up = () => {
    drag.current = null
  }
  const nudge = (e: React.KeyboardEvent) => {
    const step = 0.03
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!k) return
    e.preventDefault()
    setCrop((c) => ({ ...c, x: Math.min(1, Math.max(0, c.x + k[0])), y: Math.min(1, Math.max(0, c.y + k[1])) }))
  }

  return (
    <div className="pe-photo" data-uso={use}>
      {!image && (
        <label className="btn btn-secondary pe-photo-button">
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} className="reader-only" aria-describedby={`${id}-h`} />
          {use === 'retrato' ? t.uploadPortrait : t.uploadCover}
        </label>
      )}
      {image && (
        <div className="pe-crop">
          <canvas
            ref={canvas}
            width={use === 'retrato' ? 320 : 600}
            height={use === 'retrato' ? 320 : 200}
            className="pe-crop-screen"
            role="img"
            aria-label={t.cropHelp}
            tabIndex={0}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={nudge}
          />
          <p className="fine">{t.cropHelp}</p>
          <label className="pe-zoom">
            <span>{t.zoom}</span>
            <input type="range" min={1} max={4} step={0.05} value={crop.zoom} onChange={(e) => setCrop((c) => ({ ...c, zoom: Number(e.target.value) }))} />
          </label>
          <div className="pe-crop-buttons">
            <button type="button" className="btn btn-primary btn-small" onClick={send} disabled={busy} aria-busy={busy}>{busy ? t.sending : t.use}</button>
            <button type="button" className="btn btn-calm btn-small" onClick={() => setImage(null)} disabled={busy}>{t.cancel}</button>
          </div>
        </div>
      )}
      <p id={`${id}-h`} className="fine">{t.help}</p>
      {error && <p className="callout callout-notice" role="alert">{error}</p>}
    </div>
  )
}
