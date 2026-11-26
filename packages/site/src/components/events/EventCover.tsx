import { defaultCover, galleryAlt, galleryCover } from '@/lib/folgali/gallery'

/**
 * The cover of an event: the house gallery picture the organizer chose, or a neutral house cover always the same for the same event
 * (never a scene with characters). A chosen cover has its description; the fallback is decorative.
 */
export default function EventCover({ capa: cover, id, lang, className = '', priority = false, sizes }: { capa: string | null; id: string; lang: string; className?: string; priority?: boolean; sizes?: string }) {
  const chosen = galleryCover(cover)
  const item = chosen ?? defaultCover(id)
  return (
    // eslint-disable-next-line @next/next/no-img-element -- house art already compressed as webp; the Next optimizer adds nothing here
    <img
      src={item.file}
      alt={chosen ? galleryAlt(chosen, lang) : ''}
      width={1280}
      height={853}
      className={`photo ${className}`}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      sizes={sizes}
    />
  )
}
