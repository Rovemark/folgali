import { themeCover } from '@/lib/folgali/demo'

/**
 * The mark of a community or a page on folgali: a time-off photo, cropped into a round-cornered square
 * (community) or a circle (page). No initials. The photo comes from the theme when it is known, or from the name, and is
 * always the same for the same name. Decorative: the name always appears beside it.
 */
export default function Emblem({ nome: name, tema: theme, forma: shape = 'remendo', tamanho: size = 56 }: { nome: string; tema?: string; forma?: 'remendo' | 'etiqueta'; tamanho?: number }) {
  const photo = themeCover(theme, name)
  return (
    <span className={`emblem ${shape}`} style={{ width: size, height: size }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand art, already at the right size */}
      <img src={photo.src} alt="" width={size} height={size} loading="lazy" decoding="async" />
    </span>
  )
}
