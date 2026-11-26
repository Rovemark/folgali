import Link from 'next/link'
import Portrait from '@/components/Portrait'
import type { Attendee } from '@/lib/events/types'

/** Who answered an event (the answers are public): the portrait and the name, each to the profile. */
export default function RsvpList({ items, lang, empty }: { items: Attendee[]; lang: string; empty: string }) {
  if (items.length === 0) return <p className="fine">{empty}</p>
  return (
    <ul className="ev-who">
      {items.map((a) => (
        <li key={a.rover.uid}>
          <Link href={`/${lang}/r/${a.rover.handle}`} className="ev-who-item">
            <Portrait ficha={a.rover.rosto} nome={a.rover.nome} tamanho={64} decorative />
            <span dir="auto">{a.rover.nome}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
