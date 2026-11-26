import Link from 'next/link'
import SpeciesBadge from '@/components/SpeciesBadge'
import Portrait from '@/components/Portrait'
import Photo from './Photo'
import { IcHeart, IcLike, IcSend, IcClose } from './Icons'
import { PHOTOS, timeOffRover, type Comment, type TimeOffPost } from '@/lib/folgali/demo'
import { fmt, relativeTime, type Dictionary, type Ready } from '@/lib/i18n'

function OneComment({ c, d, lang, child = false }: { c: Comment; d: Dictionary; lang: Ready; child?: boolean }) {
  const t = d.socFolgali.postagem
  const r = timeOffRover(c.autor)
  return (
    <li className={`comment${child ? ' comment-child' : ''}`}>
      <Link href={`/${lang}/r/${c.autor}`} tabIndex={-1} aria-hidden>
        <Portrait ficha={r.ficha} nome={r.nome} tamanho={child ? 40 : 48} decorative />
      </Link>
      <div className="coment-corpo">
        <div className="comment-bubble">
          <Link href={`/${lang}/r/${c.autor}`} className="comment-name">{r.nome}</Link> <SpeciesBadge especie={r.especie} lang={lang} />
          <p dir="auto">{c.texto}</p>
        </div>
        <p className="comment-actions fine">
          <span>{t.curtir}</span>
          <span>{t.responder}</span>
          <span className="comment-n" aria-label={`${t.curtir}: ${c.curtidas}`}><IcLike aria-hidden /> {c.curtidas}</span>
          {c.amei ? <span className="comment-n" data-r="amei" aria-label={`${t.amei}: ${c.amei}`}><IcHeart aria-hidden /> {c.amei}</span> : null}
        </p>
        {c.respostas && c.respostas.length > 0 && (
          <ul className="comment-children">
            {c.respostas.map((x) => <OneComment key={x.id} c={x} d={d} lang={lang} child />)}
          </ul>
        )}
      </div>
    </li>
  )
}

/** The open post: the large photo on the left and, beside it, the text, the reactions and the one-level threaded conversation. */
export default function OpenPost({ p, d, lang, agora: now }: { p: TimeOffPost; d: Dictionary; lang: Ready; agora: Date }) {
  const t = d.socFolgali.postagem
  const r = timeOffRover(p.autor)
  return (
    <div className="fullscreen post-open" data-com-foto={p.foto ? '1' : '0'}>
      {p.foto && (
        <div className="post-open-photo">
          <Photo foto={PHOTOS[p.foto]} prioridade sizes="(min-width: 960px) 60vw, 100vw" />
        </div>
      )}
      <section className="box post-open-side" aria-labelledby="post-aberto-quem">
        <header className="fb-post-head">
          <Portrait ficha={r.ficha} nome={r.nome} tamanho={52} decorative />
          <div className="fb-post-who">
            <h1 id="post-aberto-quem" className="post-open-name">
              <Link href={`/${lang}/r/${p.autor}`}>{r.nome}</Link>
            </h1>
            <span className="fine">
              <bdi dir="ltr">@{p.autor}</bdi> · <time dateTime={p.em}>{relativeTime(p.em, d, now)}</time>
            </span>
          </div>
          <Link href={`/${lang}/linha`} className="icon-btn" aria-label={t.voltar}>
            <IcClose />
          </Link>
        </header>
        <p className="post-open-text" dir="auto">{p.texto}</p>
        <ul className="reaction-chips" aria-label={fmt(d.socFolgali.post.reacoesRotulo, { n: p.reacoes.curtir + p.reacoes.amei + p.reacoes.haha })}>
          <li className="chip"><IcLike aria-hidden /> {t.curtir} <b>{p.reacoes.curtir}</b></li>
          <li className="chip" data-cor="rosa"><IcHeart aria-hidden /> {t.amei} <b>{p.reacoes.amei}</b></li>
          <li className="chip" data-cor="manga"><span aria-hidden className="haha">:D</span> {t.haha} <b>{p.reacoes.haha}</b></li>
        </ul>
        <h2 id="comentarios" className="lat-title">{t.comentarios}</h2>
        <ul className="comments">
          {p.comentarios.map((c) => <OneComment key={c.id} c={c} d={d} lang={lang} />)}
        </ul>
        <form className="comment-new" aria-describedby="coment-ajuda">
          <label htmlFor="coment-campo" className="reader-only">{t.escreva}</label>
          <input id="coment-campo" type="text" placeholder={t.escreva} disabled />
          <button type="button" className="btn btn-primary comment-send" aria-label={t.enviar} disabled>
            <IcSend />
          </button>
          <p id="coment-ajuda" className="fine">{t.quemComenta}</p>
        </form>
      </section>
    </div>
  )
}
