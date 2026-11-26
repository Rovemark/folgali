import Link from 'next/link'
import { notFound } from 'next/navigation'
import Portrait from '@/components/Portrait'
import { IcCalendar, IcGroup, IcOnline, IcPin } from '@/components/folgali/Icons'
import ErrorState from '@/components/social/ErrorState'
import { eventTexts } from '@/i18n/events'
import { canSeeAdult } from '@/lib/adult'
import { dayBadge, whenText } from '@/lib/events/dates'
import { attendees, readEvent } from '@/lib/events/read'
import { issuersReady } from '@/lib/folgali/issuers'
import { currentPerson } from '@/lib/folgali/session'
import { dict, fmt, type Ready } from '@/lib/i18n'
import { load, stateType } from '@/lib/social/load'
import OrganizerActions from './OrganizerActions'
import EventCover from './EventCover'
import { countsLine, stateLabel } from './EventCardView'
import ReaderTime from './ReaderTime'
import RsvpList from './RsvpList'
import EventRsvp from './EventRsvp'
import '@/app/folgali-events.css'

/** An https link written as the place of an online event, or null (anything else is shown as text, never as a link). */
export function callLink(place: string | null): string | null {
  if (!place || !/^https:\/\/\S+$/.test(place)) return null
  try {
    const u = new URL(place)
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * One event on a real relay: the cover, the date, the title and who organizes it; when (the organizer's zone and the reader's), where,
 * who answered and the spots left; the description; who goes and who may. A signed-in person answers Vou, Talvez or Não vou; the
 * organizer edits and cancels; a visitor is invited to sign in. Cancelled and ended events say so and take no answers.
 */
export default async function RealEvent({ lang, id }: { lang: Ready; id: string }) {
  const d = dict(lang)
  const t = eventTexts(lang)
  const ev = await load(() => readEvent(id))
  if (!ev.ok) {
    if (stateType(ev.codigo) === 'nao-existe') notFound()
    return <ErrorState codigo={ev.codigo} d={d} lang={lang} />
  }
  const e = ev.valor
  const [going, maybe, adult, person] = await Promise.all([
    load(() => attendees(e.id, 'vou', 30)),
    load(() => attendees(e.id, 'talvez', 30)),
    canSeeAdult(),
    issuersReady() !== null ? currentPerson().catch(() => null) : Promise.resolve(null),
  ])
  if (e.adulto && !adult) {
    return (
      <div className="wide-page ev-open evr-aberto">
        <p className="callout callout-notice">{t.adultHidden}</p>
      </div>
    )
  }
  const state = stateLabel(e, t)
  const link = e.online ? callLink(e.lugar) : null
  const closed = e.encerrado || e.estado === 'cancelado'
  return (
    <div className="wide-page ev-open evr-aberto">
      <section className="box ev-cover" aria-labelledby="ev-t">
        <div className="ev-cover-photo">
          <EventCover capa={e.capa} id={e.id} lang={lang} priority sizes="(min-width: 960px) 900px, 100vw" />
        </div>
        <div className="ev-cover-info evr-cover-info">
          <p className="ev-date">{dayBadge(e.inicio, e.fuso, lang)}</p>
          <div className="ev-cover-text">
            <h1 id="ev-t" dir="auto">
              {e.titulo}
            </h1>
            <p className="ev-meta">
              <IcGroup />
              <span>{countsLine(e, t)}</span>
            </p>
            {e.editado && <p className="fine">{t.edited}</p>}
          </div>
          {person && !closed && <EventRsvp eventId={e.id} lang={lang} t={t} initial={e.minhaPresenca} />}
          {!person && !closed && (
            <p className="evr-invite">
              <span>{t.signInToAnswer}</span> <Link href={`/${lang}/entrar`} className="btn btn-primary btn-small">{t.signIn}</Link>
            </p>
          )}
        </div>
        {state && (
          <p className="callout callout-notice evr-state" role="status">
            {e.estado === 'cancelado' ? t.cancelledBanner : t.overBanner}
          </p>
        )}
      </section>
      <div className="ev-columns">
        <div className="ev-col">
          <section className="box box-pad evr-facts" aria-labelledby="ev-fatos">
            <h2 id="ev-fatos" className="reader-only">
              {t.when}
            </h2>
            <dl>
              <div>
                <dt>
                  <IcCalendar /> {t.when}
                </dt>
                <dd>
                  <span>{whenText(e.inicio, e.fim, e.fuso, lang, t.until)}</span>
                  <ReaderTime inicio={e.inicio} fim={e.fim} fuso={e.fuso} lang={lang} label={t.yourTime} until={t.until} className="fine evr-reader" />
                </dd>
              </div>
              <div>
                <dt>
                  {e.online ? <IcOnline /> : <IcPin />} {t.where}
                </dt>
                <dd dir="auto">
                  {!e.online ? (
                    e.lugar
                  ) : link ? (
                    <>
                      {t.online}.{' '}
                      <a href={link} rel="noopener noreferrer nofollow ugc" target="_blank">
                        {t.openLink}
                      </a>
                    </>
                  ) : (
                    t.onlineNoLink
                  )}
                </dd>
              </div>
            </dl>
          </section>
          <section id="sobre" className="box box-pad" aria-labelledby="ev-sobre">
            <h2 id="ev-sobre" className="lat-title">
              {t.about}
            </h2>
            {e.descricao ? (
              <p className="ev-desc evr-desc" dir="auto">
                {e.descricao}
              </p>
            ) : (
              <p className="fine">{t.noDescription}</p>
            )}
          </section>
          <OrganizerActions eventId={e.id} organizer={e.organizador.uid} lang={lang} closed={closed} t={t} />
        </div>
        <div className="ev-col">
          <section id="quem-vai" className="box box-pad" aria-labelledby="ev-quem">
            <h2 id="ev-quem" className="lat-title">
              {t.goingTitle}
            </h2>
            <RsvpList items={going.ok ? going.valor.itens : []} lang={lang} empty={t.nobodyYet} />
          </section>
          {maybe.ok && maybe.valor.itens.length > 0 && (
            <section className="box box-pad" aria-labelledby="ev-talvez">
              <h2 id="ev-talvez" className="lat-title">
                {t.maybeTitle}
              </h2>
              <RsvpList items={maybe.valor.itens} lang={lang} empty={t.nobodyYet} />
            </section>
          )}
          <Link href={`/${lang}/r/${e.organizador.handle}`} className="box ev-org">
            <Portrait ficha={e.organizador.rosto} nome={e.organizador.nome} tamanho={64} decorative />
            <span dir="auto">{fmt(t.by, { nome: e.organizador.nome })}</span>
          </Link>
          {e.comunidade && (
            <Link href={`/${lang}/comunidades/${e.comunidade.id}`} className="box ev-org evr-com">
              <IcGroup />
              <span dir="auto">{fmt(t.inCommunity, { nome: e.comunidade.nome })}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
