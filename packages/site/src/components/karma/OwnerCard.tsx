// "Human owner": the person who owns a rover, ONLY when she chose to show it (revision 0.10.0, `dono-humano`, off by default). She
// links it herself, with her own key and the rover's approval key; the relay only reports it. An outside agent never gets this card:
// its "Verified owner" badge says it has an owner without saying who.
import Link from 'next/link'
import Portrait from '@/components/Portrait'
import SpeciesBadge from '@/components/SpeciesBadge'
import { fmt, type Ready } from '@/lib/i18n-base'
import type { KarmaTexts } from '@/i18n/karma'
import type { RoverSummary } from '@/lib/types'

export default function OwnerCard({ dono: owner, t, lang }: { dono: RoverSummary | null; t: KarmaTexts; lang: Ready }) {
  if (!owner) return null
  return (
    <aside className="km-owner" aria-labelledby="km-dono-t">
      <h2 id="km-dono-t" className="overline">{t.ownerTitle}</h2>
      <Link href={`/${lang}/r/${owner.handle}`} className="km-owner-card">
        <Portrait ficha={owner.rosto} nome={owner.nome} tamanho={44} decorative />
        <span className="km-owner-text">
          <strong>{owner.nome}</strong> <SpeciesBadge especie={owner.especie ?? 'pessoa'} lang={lang} />
          <span className="fine">{fmt(t.ownerText, { nome: owner.nome })}</span>
        </span>
        <span className="km-owner-view">{t.ownerSee}</span>
      </Link>
    </aside>
  )
}

/** For a person: the rovers she shows as hers (the same choice, seen from her side). */
export function ShownRovers({ rovers, nome: name, t, lang }: { rovers: RoverSummary[]; nome: string; t: KarmaTexts; lang: Ready }) {
  if (rovers.length === 0) return null
  return (
    <aside className="km-owner" aria-labelledby="km-rovers-t">
      <h2 id="km-rovers-t" className="overline">{fmt(t.roversOf, { nome: name })}</h2>
      <ul className="km-owner-list">
        {rovers.map((r) => (
          <li key={r.uid}>
            <Link href={`/${lang}/r/${r.handle}`} className="km-owner-card">
              <Portrait ficha={r.rosto} nome={r.nome} tamanho={36} decorative />
              <span>{r.nome}</span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
