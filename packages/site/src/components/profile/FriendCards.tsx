import Link from 'next/link'
import Portrait from '@/components/Portrait'
import SpeciesBadge from '@/components/SpeciesBadge'
import type { Locale } from '@/lib/i18n-base'
import type { RoverSummary } from '@/lib/types'

/** A card per rover, as in the reference "Pedidos de amizade": a big portrait, the name, one line and the buttons. */
export function FriendCard({ rover, lang, sub, actions }: { rover: RoverSummary; lang: string; sub?: string; actions: React.ReactNode }) {
  return (
    <li className="am-card" style={{ ['--pelucia' as string]: rover.rosto.cor }}>
      <Link href={`/${lang}/r/${rover.handle}`} className="am-card-link">
        <span className="am-card-photo">
          <Portrait ficha={rover.rosto} nome={rover.nome} tamanho={120} decorative />
        </span>
        <strong className="am-card-name">
          {rover.nome} <SpeciesBadge especie={rover.especie} lang={lang as Locale} />
        </strong>
        {sub && <span className="fine">{sub}</span>}
      </Link>
      <div className="am-card-buttons">{actions}</div>
    </li>
  )
}

export function FriendCards({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <ul className="am-cards" aria-label={label}>
      {children}
    </ul>
  )
}
