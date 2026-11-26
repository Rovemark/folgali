import Link from 'next/link'
import Portrait from '@/components/Portrait'
import Photo from './Photo'
import { PHOTOS, ROVERS_ONLINE, themeCover, events, timeOffRover } from '@/lib/folgali/demo'
import { eventHour, dayBadge } from '@/lib/folgali/dates'
import { fmt, plural, type Dictionary, type Ready } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import BestForYou from '@/components/karma/BestForYou'

/**
 * The right column, like Facebook's: who is online, the events of the week and the trending communities. Online rovers
 * and events are demonstration (the protocol has no presence or events yet); the communities come from the relay.
 */
export default async function Lateral({ lang, d, demonstracao: isDemo }: { lang: Ready; d: Dictionary; demonstracao: boolean }) {
  const t = d.socFolgali.lateral
  const { cliente: client } = getNetwork()
  const trending = await load(() => client.emAlta('comunidades', '24h'))
  const now = new Date()
  const evs = isDemo ? events(now).slice(0, 2) : []
  return (
    <>
      {isDemo && (
        <section className="box lat-block" aria-labelledby="lat-online">
          <h2 id="lat-online" className="lat-title">{t.online}</h2>
          <ul className="lat-online">
            {ROVERS_ONLINE.slice(0, 4).map((h) => {
              const r = timeOffRover(h)
              return (
                <li key={h}>
                  <Link href={`/${lang}/r/${h}`} className="lat-row">
                    <span className="com-dot">
                      <Portrait ficha={r.ficha} nome={r.nome} tamanho={44} decorative />
                      <span className="online-dot" aria-hidden />
                    </span>
                    <span className="lat-nome">{r.nome}</span>
                    <span className="reader-only">{fmt(t.estaOnline, { nome: r.nome })}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {/* 0.10.0: Top of all time, Hot this month and Rising (src/components/karma/BestForYou.tsx) */}
      <BestForYou lang={lang} d={d} agora={now} />
      {evs.length > 0 && (
        <section className="box lat-block" aria-labelledby="lat-eventos">
          <div className="lat-head">
            <h2 id="lat-eventos" className="lat-title">{t.eventos}</h2>
            <Link href={`/${lang}/eventos`} className="lat-view">{t.verTodos}</Link>
          </div>
          <ul className="lat-media">
            {evs.map((e) => (
              <li key={e.id}>
                <Link href={`/${lang}/eventos/${e.id}`} className="lat-media-item">
                  <Photo foto={PHOTOS[e.foto]} alt="" className="lat-photo" />
                  <span>
                    <strong>{e.titulo}</strong>
                    <span className="fine">{dayBadge(e.em, lang)} · {eventHour(e.em, lang)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {trending.ok && trending.valor.length > 0 && (
        <section className="box lat-block" aria-labelledby="lat-com">
          <div className="lat-head">
            <h2 id="lat-com" className="lat-title">{t.comunidades}</h2>
            <Link href={`/${lang}/comunidades`} className="lat-view">{t.verTodos}</Link>
          </div>
          <ul className="lat-media">
            {trending.valor.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link href={`/${lang}/comunidades/${c.id}`} className="lat-media-item">
                  <Photo foto={themeCover(c.tema, c.id)} alt="" className="lat-photo" />
                  <span>
                    <strong>{c.nome}</strong>
                    <span className="fine">{plural(t.membros, c.membros)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
