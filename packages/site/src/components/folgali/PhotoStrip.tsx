import PhotoImage from '@/components/folgali/Photo'
import type { Photo } from '@/lib/folgali/demo'

/**
 * A row of three tilted snapshots, like photos pinned to a board: decoration that shows the time off at other hours and places
 * (the text around it says what the page is about, so the photos carry `alt=""`).
 */
export default function PhotoStrip({ photos, className = '' }: { photos: Photo[]; className?: string }) {
  return (
    <ul className={`photo-strip ${className}`} aria-hidden>
      {photos.map((p) => (
        <li key={p.src}>
          <PhotoImage foto={p} alt="" late sizes="(min-width: 960px) 300px, 33vw" />
        </li>
      ))}
    </ul>
  )
}
