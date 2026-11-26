import Link from 'next/link'
import type { ReactNode } from 'react'
import Portrait from '@/components/Portrait'
import Photo from '@/components/folgali/Photo'
import { PHOTOS, events } from '@/lib/folgali/demo'
import { eventHour, dayBadge } from '@/lib/folgali/dates'
import { fmt, plural, type Dictionary, type Ready } from '@/lib/i18n'
import type { MemberItem, Community } from '@/lib/social/types'

/**
 * The right column of a community, as in the reference screen: About, Next event and Moderators. About and the team come from the
 * relay; the next events too on a real relay (0.11.0 part 4, `nextEvents`, src/components/events/MiniEvents.tsx), and in the
 * demonstration the invented one.
 */
export default function CommunitySide({ c, team, d, lang, demonstration, nextEvents }: { c: Community; team: MemberItem[]; d: Dictionary; lang: Ready; demonstration: boolean; nextEvents?: ReactNode }) {
  const t = d.socFolgali.comunidade
  const next = demonstration ? events(new Date()).find((e) => e.comunidade === c.nome) : undefined
  const people = team.length > 0 ? team.map((m) => m.rover) : [c.dono]
  return (
    <aside className="com-side" aria-label={t.lado}>
      <section className="box lat-block" aria-labelledby="com-lado-sobre">
        <h2 id="com-lado-sobre" className="lat-title">{t.sobre}</h2>
        <p className="com-side-text">{c.descricao}</p>
        <p className="fine">{plural(t.membros, c.membros)}</p>
      </section>
      {nextEvents}
      {next && (
        <section className="box lat-block" aria-labelledby="com-lado-evento">
          <h2 id="com-lado-evento" className="lat-title">{t.proximoEvento}</h2>
          <Link href={`/${lang}/eventos/${next.id}`} className="com-side-event">
            <Photo foto={PHOTOS[next.foto]} alt="" className="com-side-photo" />
            <span>
              <strong>{next.titulo}</strong>
              <span className="fine">{dayBadge(next.em, lang)} · {eventHour(next.em, lang)}</span>
            </span>
          </Link>
        </section>
      )}
      <section className="box lat-block" aria-labelledby="com-lado-mod">
        <h2 id="com-lado-mod" className="lat-title">{t.moderadores}</h2>
        <ul className="lat-online">
          {people.slice(0, 4).map((r) => (
            <li key={r.uid}>
              <Link href={`/${lang}/r/${r.handle}`} className="lat-row">
                <Portrait ficha={r.rosto} nome={r.nome} tamanho={44} decorative />
                <span className="lat-nome">{r.nome}</span>
              </Link>
            </li>
          ))}
        </ul>
        {c.moderadores > people.length && <p className="fine">{fmt(t.maisModeradores, { n: String(c.moderadores - people.length) })}</p>}
      </section>
    </aside>
  )
}
