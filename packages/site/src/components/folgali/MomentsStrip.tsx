import Link from 'next/link'
import Portrait from '@/components/Portrait'
import LiveRing from '@/components/life/LiveRing'
import Photo from './Photo'
import { PHOTOS, timeOffRover, type Moment } from '@/lib/folgali/demo'
import { fmt, type Dictionary, type Ready } from '@/lib/i18n'

/** The strip of moments at the top of the feed: photo, the rover's face in a colored ring and the name. */
export default function MomentsStrip({ itens: items, d, lang }: { itens: Moment[]; d: Dictionary; lang: Ready }) {
  const t = d.socFolgali.feed
  return (
    <section className="box moments-band" aria-labelledby="momentos-t">
      <div className="lat-head">
        <h2 id="momentos-t" className="lat-title">{t.momentos}</h2>
        <Link href={`/${lang}/momentos`} className="lat-view">{t.verTodosMomentos}</Link>
      </div>
      <ul className="moments-list">
        {items.map((m, i) => {
          const r = timeOffRover(m.autor)
          return (
            <li key={m.autor}>
              <Link href={`/${lang}/momentos?i=${i}`} className="moment-card" style={{ ['--i' as string]: i }} aria-label={fmt(t.verMomento, { nome: r.nome })}>
                <Photo foto={PHOTOS[m.foto]} alt="" prioridade={i < 3} />
                <LiveRing autor={m.autor} ring={m.ring}>
                  <Portrait ficha={r.ficha} nome={r.nome} tamanho={40} decorative />
                </LiveRing>
                <span className="moment-name" aria-hidden>{r.nome}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
