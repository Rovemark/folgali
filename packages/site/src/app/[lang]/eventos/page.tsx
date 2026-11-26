import type { Metadata } from 'next'
import RealEvents from '@/components/events/RealEvents'
import { isDemo } from '@/lib/site'
import { getNetwork } from '@/lib/get-network'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EventButtons from '@/components/folgali/EventButtons'
import Photo from '@/components/folgali/Photo'
import { IcCalendar, IcGroup, IcOnline, IcPin } from '@/components/folgali/Icons'
import { isToday, eventHour, dayBadge } from '@/lib/folgali/dates'
import { PHOTOS, events } from '@/lib/folgali/demo'
import { dict, isReady, plural } from '@/lib/i18n'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ filtro?: string; comunidade?: string; antes?: string }> }
const FILTERS = ['semana', 'hoje', 'perto', 'online'] as const
type Filter = (typeof FILTERS)[number]

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/eventos', dict(isReady(lang) ? lang : 'pt').socFolgali.eventos.titulo)
}

/**
 * Time-off events: game night, fair, poetry evening. In real mode (0.11.0 part 4) the list comes from the relay (src/components/events/RealEvents.tsx);
 * in the demonstration, the usual invented events.
 */
export default async function Events({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.eventos
  const sp = await searchParams
  // real mode: the relay's events, with the filters the contract allows (packages/site/docs/PRODUCTION.md)
  if (!isDemo(getNetwork().cliente.modo)) return RealEvents({ lang, filtro: sp.filtro, comunidade: sp.comunidade, antes: sp.antes })
  const request = sp.filtro
  const filter: Filter = (FILTERS as readonly string[]).includes(request ?? '') ? (request as Filter) : 'semana'
  const now = new Date()
  const all = events(now)
  const list = all.filter((e) => (filter === 'hoje' ? isToday(e.em, now) : filter === 'perto' ? e.perto : filter === 'online' ? e.online : true))
  const icones = { hoje: <IcCalendar />, semana: <IcCalendar />, perto: <IcPin />, online: <IcOnline /> }
  return (
    <div className="wide-page events">
      <nav className="box ev-filters" aria-labelledby="ev-filtros-t">
        <h2 id="ev-filtros-t" className="lat-title">{t.filtros}</h2>
        <ul>
          {(['hoje', 'semana', 'perto', 'online'] as const).map((f) => (
            <li key={f}>
              <Link href={`/${lang}/eventos${f === 'semana' ? '' : `?filtro=${f}`}`} className="ev-filter" aria-current={filter === f ? 'page' : undefined}>
                {icones[f]}
                <span>{t[f]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="ev-main">
        <div className="page-title">
          <h1>{t.titulo}</h1>
          <p className="fine">{t.demo}</p>
        </div>
        {list.length === 0 ? (
          <p className="empty">{t.vazio}</p>
        ) : (
          <ul className="ev-grid">
            {list.map((e, i) => (
              <li key={e.id} className="box ev-card" data-largo={i >= 3 ? '1' : '0'}>
                <div className="ev-photo">
                  <Photo foto={PHOTOS[e.foto]} alt="" prioridade={i < 3} />
                  <span className="ev-day">{dayBadge(e.em, lang)}</span>
                </div>
                <div className="ev-body">
                  <h2>
                    <Link href={`/${lang}/eventos/${e.id}`} className="ev-link">{e.titulo}</Link>
                  </h2>
                  <p className="ev-meta"><IcGroup /> {e.comunidade} · {eventHour(e.em, lang)}</p>
                  <p className="ev-meta"><IcGroup /> {plural(t.vao, e.vao)}</p>
                  <EventButtons vou={t.vou} talvez={t.talvez} marcou={t.marcou} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
