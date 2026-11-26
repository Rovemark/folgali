import Link from 'next/link'
import { eventTexts } from '@/i18n/events'
import { canSeeAdult } from '@/lib/adult'
import { dayBadge } from '@/lib/events/dates'
import { communityEvents, eventsOnRelay, roverEvents } from '@/lib/events/read'
import type { EventCard } from '@/lib/events/types'
import { plural, type Ready } from '@/lib/i18n'
import EventCover from './EventCover'
import '@/app/folgali-events.css'

/** A short list of events: a small cover, the title and the date badge with who goes. */
function List({ items, lang }: { items: EventCard[]; lang: Ready }) {
  const t = eventTexts(lang)
  return (
    <ul className="evr-side-list">
      {items.map((e) => (
        <li key={e.id}>
          <Link href={`/${lang}/eventos/${e.id}`} className="evr-mini">
            <EventCover capa={e.capa} id={e.id} lang={lang} />
            <span>
              <strong dir="auto">{e.titulo}</strong>
              <span className="fine">
                {dayBadge(e.inicio, e.fuso, lang)} · {e.online ? t.online : plural(t.going, e.contagens.vou)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The next events of a community, for the right column of its page. Nothing when the relay has no events or none are coming. */
export async function UpcomingInCommunity({ community, lang, title }: { community: string; lang: Ready; title: string }) {
  const { on } = await eventsOnRelay()
  if (!on) return null
  const [page, adult] = await Promise.all([communityEvents(community, 'proximos', 3).catch(() => null), canSeeAdult()])
  const items = (page?.itens ?? []).filter((e) => adult || !e.adulto)
  if (items.length === 0) return null
  const t = eventTexts(lang)
  return (
    <section className="box lat-block" aria-labelledby="com-lado-evento">
      <h2 id="com-lado-evento" className="lat-title">
        {title}
      </h2>
      <List items={items} lang={lang} />
      <p>
        <Link href={`/${lang}/eventos?comunidade=${community}`}>{t.seeAll}</Link>
      </p>
    </section>
  )
}

/** On a profile: the coming events the rover organizes and the ones they said they go to. Nothing when there are none. */
export async function ProfileEvents({ uid, lang }: { uid: string; lang: Ready }) {
  const { on } = await eventsOnRelay()
  if (!on) return null
  const [own, going, adult] = await Promise.all([roverEvents(uid, 'organiza', 3).catch(() => null), roverEvents(uid, 'vai', 3).catch(() => null), canSeeAdult()])
  const keep = (x: EventCard[] | undefined) => (x ?? []).filter((e) => adult || !e.adulto)
  const mine = keep(own?.itens)
  const ids = new Set(mine.map((e) => e.id))
  const goes = keep(going?.itens).filter((e) => !ids.has(e.id))
  if (mine.length + goes.length === 0) return null
  const t = eventTexts(lang)
  return (
    <section className="box box-pad evr-profile" aria-labelledby="pf-eventos-t">
      <h2 id="pf-eventos-t" className="lat-title">
        {t.profileTitle}
      </h2>
      {mine.length > 0 && (
        <>
          <h3>{t.profileOrganizes}</h3>
          <List items={mine} lang={lang} />
        </>
      )}
      {goes.length > 0 && (
        <>
          <h3>{t.profileGoes}</h3>
          <List items={goes} lang={lang} />
        </>
      )}
    </section>
  )
}
