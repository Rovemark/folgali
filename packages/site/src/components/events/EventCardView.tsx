import Link from 'next/link'
import { IcCalendar, IcGroup, IcOnline, IcPin } from '@/components/folgali/Icons'
import type { EventTexts } from '@/i18n/events'
import { dayBadge, whenText } from '@/lib/events/dates'
import type { EventCard } from '@/lib/events/types'
import { fmt, plural, type Ready } from '@/lib/i18n-base'
import EventCover from './EventCover'
import ReaderTime from './ReaderTime'

/** "3 vão · 1 talvez · 5 vagas restantes" (or "Lotado"). */
export function countsLine(e: EventCard, t: EventTexts): string {
  const parts = [plural(t.going, e.contagens.vou)]
  if (e.contagens.talvez > 0) parts.push(plural(t.maybe, e.contagens.talvez))
  if (e.vagasRestantes !== null && !e.encerrado) parts.push(e.vagasRestantes === 0 ? t.full : plural(t.spotsLeft, e.vagasRestantes))
  return parts.join(' · ')
}

/** The mark of an event that no longer takes answers: cancelled, or over. Null while it is open. */
export const stateLabel = (e: EventCard, t: EventTexts): string | null => (e.estado === 'cancelado' ? t.cancelled : e.encerrado ? t.over : null)

/**
 * One event in a list: the cover with the date badge, the title, when (in the organizer's zone and, in the browser, the reader's),
 * where (the place, or "Online"), who answered and the spots left, who organizes and in which community. Cancelled and ended events
 * say so on the cover.
 */
export default function EventCardView({ e, lang, t, priority = false, now }: { e: EventCard; lang: Ready; t: EventTexts; priority?: boolean; now?: Date }) {
  const state = stateLabel(e, t)
  const titleId = `ev-${e.id}`
  return (
    <li className="box ev-card evr-card" data-estado={e.estado === 'cancelado' ? 'cancelado' : e.encerrado ? 'encerrado' : 'ativo'} aria-labelledby={titleId}>
      <div className="ev-photo">
        <EventCover capa={e.capa} id={e.id} lang={lang} priority={priority} sizes="(min-width: 960px) 320px, 100vw" />
        <span className="ev-day">{dayBadge(e.inicio, e.fuso, lang)}</span>
        {state && <span className="evr-badge">{state}</span>}
      </div>
      <div className="ev-body">
        <h2 id={titleId}>
          <Link href={`/${lang}/eventos/${e.id}`} className="ev-link" dir="auto">
            {e.titulo}
          </Link>
        </h2>
        <p className="ev-meta">
          <IcCalendar />
          <span>{whenText(e.inicio, e.fim, e.fuso, lang, t.until, now)}</span>
        </p>
        <ReaderTime inicio={e.inicio} fim={e.fim} fuso={e.fuso} lang={lang} label={t.yourTime} until={t.until} />
        <p className="ev-meta">
          {e.online ? <IcOnline /> : <IcPin />}
          <span dir="auto">{e.online ? t.online : e.lugar}</span>
        </p>
        <p className="ev-meta">
          <IcGroup />
          <span>{countsLine(e, t)}</span>
        </p>
        <p className="fine evr-who">
          <span dir="auto">{fmt(t.by, { nome: e.organizador.nome })}</span>
          {e.comunidade && (
            <>
              {' · '}
              <span dir="auto">{fmt(t.inCommunity, { nome: e.comunidade.nome })}</span>
            </>
          )}
        </p>
      </div>
    </li>
  )
}
