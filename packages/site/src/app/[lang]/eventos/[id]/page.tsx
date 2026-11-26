import type { Metadata } from 'next'
import RealEvent from '@/components/events/RealEvent'
import { readEvent } from '@/lib/events/read'
import { isDemo } from '@/lib/site'
import { getNetwork } from '@/lib/get-network'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Portrait from '@/components/Portrait'
import EventButtons from '@/components/folgali/EventButtons'
import Photo from '@/components/folgali/Photo'
import { IcGroup } from '@/components/folgali/Icons'
import { eventHour, dayBadge } from '@/lib/folgali/dates'
import { PHOTOS, event, timeOffRover } from '@/lib/folgali/demo'
import { dict, isReady, fmt, plural } from '@/lib/i18n'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  const demo = isDemo(getNetwork().cliente.modo)
  const e = demo ? event(id, new Date()) : null
  // real mode: the event's own title (an 18+ event never puts its title in the page head)
  const real = demo ? null : await readEvent(id).catch(() => null)
  return screenMeta(lang, `/eventos/${id}`, e?.titulo ?? (real && !real.adulto ? real.titulo : null) ?? dict(isReady(lang) ? lang : 'pt').socFolgali.eventos.titulo)
}

/** The open event: cover, date, who organizes, who goes and the event's conversation. In real mode, the relay's event (src/components/events/RealEvent.tsx). */
export default async function OpenEvent({ params }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  // real mode (0.11.0 part 4): the event comes from the relay
  // (called as a function: the page resolves to the finished tree, so it renders the same in tests)
  if (!isDemo(getNetwork().cliente.modo)) return RealEvent({ lang, id })
  const now = new Date()
  const e = event(id, now)
  if (!e) notFound()
  const d = dict(lang)
  const t = d.socFolgali.eventos
  const org = timeOffRover(e.organizador)
  return (
    <div className="wide-page ev-open">
      <section className="box ev-cover" aria-labelledby="ev-t">
        <div className="ev-cover-photo">
          <Photo foto={PHOTOS[e.foto]} prioridade sizes="(min-width: 960px) 900px, 100vw" />
        </div>
        <div className="ev-cover-info">
          <p className="ev-date">{dayBadge(e.em, lang)} · {eventHour(e.em, lang)}</p>
          <div className="ev-cover-text">
            <h1 id="ev-t">{e.titulo}</h1>
            <p className="ev-meta"><IcGroup /> {e.comunidade} · {plural(t.vao, e.vao)} · {plural(t.talvezN, e.talvez)}</p>
          </div>
          <EventButtons vou={t.vou} talvez={t.talvez} marcou={t.marcou} grande />
        </div>
        <nav className="page-tabs ev-tabs" aria-label={e.titulo}>
          <a href="#sobre" aria-current="page">{t.sobre}</a>
          <a href="#conversa">{t.conversa}</a>
          <a href="#quem-vai">{t.quemVai}</a>
        </nav>
      </section>
      <div className="ev-columns">
        <div className="ev-col">
          <section id="sobre" className="box box-pad" aria-labelledby="ev-sobre">
            <h2 id="ev-sobre" className="lat-title">{t.sobreEvento}</h2>
            <p className="ev-desc">{e.descricao}</p>
            <p className="fine">{t.demo}</p>
          </section>
          <section id="conversa" className="box box-pad" aria-labelledby="ev-conversa">
            <h2 id="ev-conversa" className="lat-title">{t.conversaEvento}</h2>
            {e.conversa.length === 0 ? (
              <p className="fine">{t.semConversa}</p>
            ) : (
              <ul className="ev-conversation">
                {e.conversa.map((c, i) => {
                  const r = timeOffRover(c.autor)
                  return (
                    <li key={i}>
                      <Portrait ficha={r.ficha} nome={r.nome} tamanho={48} decorative />
                      <div>
                        <Link href={`/${lang}/r/${c.autor}`} className="comment-name">{r.nome}</Link>
                        <p dir="auto">{c.texto}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
        <div className="ev-col">
          <section id="quem-vai" className="box box-pad" aria-labelledby="ev-quem">
            <h2 id="ev-quem" className="lat-title">{t.quemVai}</h2>
            <ul className="ev-who">
              {e.quemVai.map((h) => {
                const r = timeOffRover(h)
                return (
                  <li key={h}>
                    <Link href={`/${lang}/r/${h}`} className="ev-who-item">
                      <Portrait ficha={r.ficha} nome={r.nome} tamanho={72} decorative />
                      <span>{r.nome}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
          <Link href={`/${lang}/r/${e.organizador}`} className="box ev-org">
            <Portrait ficha={org.ficha} nome={org.nome} tamanho={64} decorative />
            <span>{fmt(t.organizado, { nome: org.nome })}</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
