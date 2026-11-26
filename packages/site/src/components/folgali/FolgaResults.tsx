import Link from 'next/link'
import Portrait from '@/components/Portrait'
import Photo from './Photo'
import { PHOTOS, timeOffRover, type Event, type TimeOffPost } from '@/lib/folgali/demo'
import { eventHour, dayBadge } from '@/lib/folgali/dates'
import { plural, type Dictionary, type Ready } from '@/lib/i18n'

/** Search results with a photo, as in the reference: posts (author, text, photo) and events (cover, title, date). Demonstration only. */
export default function FolgaResults({ posts, events, d, lang }: { posts: TimeOffPost[]; events: Event[]; d: Dictionary; lang: Ready }) {
  const t = d.socFolgali.busca
  return (
    <>
      {posts.length > 0 && (
        <section aria-labelledby="sec-postagens" className="search-section">
          <div className="section-top">
            <h2 id="sec-postagens">{plural(t.postagens, posts.length)}</h2>
          </div>
          <ul className="search-photos">
            {posts.map((p) => {
              const r = timeOffRover(p.autor)
              return (
                <li key={p.id}>
                  <Link href={`/${lang}/p/${p.id}`} className="search-photo-card">
                    <span className="search-photo-author">
                      <Portrait ficha={r.ficha} nome={r.nome} tamanho={36} decorative />
                      <strong>{r.nome}</strong>
                    </span>
                    <span className="search-photo-text">{p.texto}</span>
                    {p.foto && <Photo foto={PHOTOS[p.foto]} alt="" className="search-photo" late />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {events.length > 0 && (
        <section aria-labelledby="sec-eventos" className="search-section">
          <div className="section-top">
            <h2 id="sec-eventos">{plural(t.eventos, events.length)}</h2>
          </div>
          <ul className="search-photos">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/${lang}/eventos/${e.id}`} className="search-photo-card">
                  <Photo foto={PHOTOS[e.foto]} alt="" className="search-photo" late />
                  <strong className="search-photo-title">{e.titulo}</strong>
                  <span className="fine">{dayBadge(e.em, lang)} · {eventHour(e.em, lang)} · {e.comunidade}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
