import Link from 'next/link'
import EmptyState from '@/components/EmptyState'
import { IcCalendar, IcPlus, IcOnline } from '@/components/folgali/Icons'
import ErrorState from '@/components/social/ErrorState'
import { eventTexts } from '@/i18n/events'
import { canSeeAdult } from '@/lib/adult'
import { faceByUid } from '@/lib/domain/expression'
import { isObjectId } from '@/lib/domain/ids'
import { isToday } from '@/lib/events/dates'
import { eventsOnRelay, listEvents } from '@/lib/events/read'
import { isEventFilter, type EventCard, type EventFilter, type RelayWhen } from '@/lib/events/types'
import { issuersReady } from '@/lib/folgali/issuers'
import { SCENES } from '@/lib/folgali/scenes'
import { currentPerson } from '@/lib/folgali/session'
import { dict, fmt, type Ready } from '@/lib/i18n'
import { legalDict } from '@/lib/legal-i18n'
import { load } from '@/lib/social/load'
import EventCardView from './EventCardView'
import '@/app/folgali-events.css'

/** What each filter asks the relay: "today" and "online" are taken from the upcoming list (the relay has no such filter). */
const RELAY_OF: Record<EventFilter, RelayWhen> = { proximos: 'proximos', semana: 'semana', hoje: 'semana', online: 'proximos', passados: 'passados' }

export function filterEvents(items: EventCard[], f: EventFilter, now: Date): EventCard[] {
  if (f === 'hoje') return items.filter((e) => isToday(e, now))
  if (f === 'online') return items.filter((e) => e.online)
  return items
}

type Props = { lang: Ready; filtro?: string; comunidade?: string; antes?: string }

/**
 * The Events screen on a real relay (protocol 0.11.0 part 4): upcoming, this week, today, online and past, optionally inside one
 * community; each card with its cover, when, where, who answered and the spots left. A signed-in person gets "Create event"; a
 * visitor, the invitation to sign in. A relay without events keeps the earlier empty state.
 */
export default async function RealEvents({ lang, filtro: filter, comunidade: community, antes: before }: Props) {
  const d = dict(lang)
  const t = eventTexts(lang)
  const f: EventFilter = isEventFilter(filter) ? filter : 'proximos'
  const using = community && isObjectId(community) ? community : undefined
  const { on } = await eventsOnRelay()
  if (!on) {
    const r = legalDict(lang).real
    return (
      <div className="wide-page events">
        <div className="page-title">
          <h1>{t.title}</h1>
        </div>
        <EmptyState titulo={r.eventosTitulo} texto={r.eventosTexto} ficha={faceByUid('rvr_eventos_vazios_000000')} estado="parado" scene={SCENES.emptyHammock} acoes={<a className="btn btn-secondary" href={`/${lang}/comunidades`}>{r.verComunidades}</a>} />
      </div>
    )
  }
  const writes = issuersReady() !== null && (await currentPerson().catch(() => null)) !== null
  const [page, adult] = await Promise.all([load(() => listEvents({ quando: RELAY_OF[f], comunidade: using, antes: before, limite: f === 'hoje' || f === 'online' ? 50 : 24 })), canSeeAdult()])
  const now = new Date()
  const items = page.ok ? filterEvents(page.valor.itens, f, now).filter((e) => adult || !e.adulto) : []
  const comName = using ? items.find((e) => e.comunidade?.id === using)?.comunidade?.nome ?? null : null
  const href = (x: { filtro?: EventFilter; antes?: string }) => {
    const p = new URLSearchParams()
    const ff = x.filtro ?? f
    if (ff !== 'proximos') p.set('filtro', ff)
    if (using) p.set('comunidade', using)
    if (x.antes) p.set('antes', x.antes)
    const s = p.toString()
    return `/${lang}/eventos${s ? `?${s}` : ''}`
  }
  const icons: Record<EventFilter, React.ReactNode> = { proximos: <IcCalendar />, semana: <IcCalendar />, hoje: <IcCalendar />, online: <IcOnline />, passados: <IcCalendar /> }
  const createHref = `/${lang}/eventos/novo${using ? `?comunidade=${using}` : ''}`
  return (
    <div className="wide-page events evr-lista">
      <nav className="box ev-filters" aria-labelledby="ev-filtros-t">
        <h2 id="ev-filtros-t" className="lat-title">
          {t.filtersLabel}
        </h2>
        <ul>
          {(['proximos', 'semana', 'hoje', 'online', 'passados'] as const).map((x) => (
            <li key={x}>
              <Link href={href({ filtro: x })} className="ev-filter" aria-current={f === x ? 'page' : undefined}>
                {icons[x]}
                <span>{t.filters[x]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="ev-main">
        <div className="page-title evr-title">
          <div>
            <h1>{using && comName ? fmt(t.ofCommunity, { nome: comName }) : t.title}</h1>
            <p>{t.intro}</p>
            {using && (
              <p>
                <Link href={`/${lang}/eventos`}>{t.allEvents}</Link>
              </p>
            )}
          </div>
          {writes ? (
            <Link href={createHref} className="btn btn-primary evr-create">
              <IcPlus />
              <span>{t.create}</span>
            </Link>
          ) : (
            <Link href={`/${lang}/entrar`} className="btn btn-secondary evr-create">
              {t.signInToCreate}
            </Link>
          )}
        </div>
        {!page.ok ? (
          <ErrorState codigo={page.codigo} d={d} lang={lang} noBack />
        ) : items.length === 0 ? (
          f === 'proximos' && !before ? (
            <EmptyState titulo={t.emptyTitle} texto={t.emptyText} ficha={faceByUid('rvr_eventos_vazios_000000')} estado="parado" scene={SCENES.emptyHammock} acoes={writes ? <Link className="btn btn-primary" href={createHref}>{t.create}</Link> : undefined} />
          ) : (
            <p className="empty">{f === 'passados' ? t.emptyPast : t.emptyFilter}</p>
          )
        ) : (
          <ul className="ev-grid" aria-label={t.filters[f]}>
            {items.map((e, i) => (
              <EventCardView key={e.id} e={e} lang={lang} t={t} priority={i < 3} now={now} />
            ))}
          </ul>
        )}
        {page.ok && page.valor.proximo && (
          <p className="km-pages">
            <Link href={href({ antes: page.valor.proximo })} className="btn btn-secondary">
              {t.more}
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
