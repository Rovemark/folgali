'use client'

import { useEffect, useState } from 'react'
import { portrait, type PortraitState } from '@/lib/rover/portrait'
import { galleryPortrait } from '@/lib/folgali/gallery'
import { withoutHelmet } from '@/lib/folgali/plush'
import { isPersonSpec } from '@/lib/rover/person'
import type { Spec } from '@/lib/types'
import { usePlushPhoto } from '@/components/folgali/PlushPhotos'

type Props = {
  ficha: Spec
  /** name of the rover, for the alternative text and for the initial while the image does not arrive */
  nome: string
  /** side in px */
  tamanho?: number
  humor?: PortraitState
  className?: string
  /** when the name is already written beside it, the portrait is decorative */
  decorative?: boolean
}

/** The portrait of the rover, in an embroidery: a ring of stitch dots in the color of the plush. */
export default function Portrait(props: Props) {
  // 0.7.0: a person without a portrait has a people avatar, drawn here, never a plush
  if (isPersonSpec(props.ficha)) return <PersonAvatar {...props} />
  // 0.9.0: a portrait chosen from the house gallery
  const g = galleryPortrait(props.ficha.galeria)
  if (g) return <PortraitImage {...props} src={g.file} cor={g.color ?? props.ficha.cor} />
  return <PlushPhotoOrDrawing {...props} />
}

/** Demonstration: the photographed plush when the cast has one; otherwise the drawn portrait. */
function PlushPhotoOrDrawing(props: Props) {
  const photo = usePlushPhoto(props.nome)
  if (!photo) return <PlushPortrait {...props} />
  return <PortraitImage {...props} src={photo} cor={withoutHelmet(props.ficha).cor} />
}

/** A plush photo (the gallery or the demonstration cast) in the stitched ring. */
function PortraitImage({ nome: name, tamanho: size = 48, className = '', decorative = false, src, cor: color }: Props & { src: string; cor: string }) {
  return (
    <span className={`portrait portrait-photo ${className}`} style={{ ['--pelucia' as string]: color, width: size, height: size }} data-pronto="1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={size} height={size} alt={decorative ? '' : name} className="portrait-img" decoding="async" loading="lazy" />
    </span>
  )
}

/** The avatar of a person without a portrait: the silhouette of a person over their stable color. */
function PersonAvatar({ ficha: token, nome: name, tamanho: size = 48, className = '', decorative = false }: Props) {
  return (
    <span className={`portrait portrait-person ${className}`} style={{ ['--pelucia' as string]: token.cor, width: size, height: size }} data-pronto="1" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : name}>
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden focusable="false">
        <circle cx="24" cy="24" r="24" fill="var(--pelucia)" />
        <circle cx="24" cy="19" r="8" fill="var(--marfim)" fillOpacity="0.92" />
        <path d="M9 41c2.5-8 8.5-12 15-12s12.5 4 15 12" fill="var(--marfim)" fillOpacity="0.92" />
      </svg>
    </span>
  )
}

function PlushPortrait({ ficha: original, nome: name, tamanho: size = 48, humor = 'parado', className = '', decorative = false }: Props) {
  const token = withoutHelmet(original)
  const [url, setUrl] = useState<string | null>(null)
  const dpr = typeof window === 'undefined' ? 2 : Math.min(3, Math.max(1, Math.ceil(window.devicePixelRatio || 1)))
  const px = size * dpr
  const key = JSON.stringify([token, humor, px])

  useEffect(() => {
    let live = true
    portrait(token, humor, px)
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <span className={`portrait ${className}`} style={{ ['--pelucia' as string]: token.cor, width: size, height: size }} data-pronto={url ? '1' : '0'}>
      <span className="portrait-initial" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} width={size} height={size} alt={decorative ? '' : name} className="portrait-img" decoding="async" />
      )}
    </span>
  )
}
