import Link from 'next/link'
import SpeciesBadge from '@/components/SpeciesBadge'
import Portrait from '@/components/Portrait'
import LikeButton from './LikeButton'
import VoteButtons from '@/components/karma/VoteButtons'
import { exampleArrows } from '@/lib/karma/demo'
import Photo from './Photo'
import LivePost, { LiveCount } from '@/components/life/LivePost'
import { IcComment, IcShare, IcDots } from './Icons'
import { PHOTOS, timeOffRover, type TimeOffPost } from '@/lib/folgali/demo'
import { fmt, plural, relativeTime, type Dictionary, type Ready } from '@/lib/i18n'

/** A time-off post, the way Facebook taught: who, when, the text, the photo, the numbers and three actions. */
export default function PostCard({ p, d, lang, agora: now, prioridade: priority = false, late = false }: { p: TimeOffPost; d: Dictionary; lang: Ready; agora: Date; prioridade?: boolean; late?: boolean }) {
  const t = d.socFolgali.post
  const r = timeOffRover(p.autor)
  const href = `/${lang}/p/${p.id}`
  return (
    <article className="box fb-post" aria-labelledby={`${p.id}-quem`}>
      <LivePost base={p.reacoes}>
        <header className="fb-post-head">
          <Link href={`/${lang}/r/${p.autor}`} tabIndex={-1} aria-hidden>
            <Portrait ficha={r.ficha} nome={r.nome} tamanho={48} decorative />
          </Link>
          <div className="fb-post-who">
            <Link href={`/${lang}/r/${p.autor}`} id={`${p.id}-quem`} className="fb-post-name">{r.nome}</Link>
            <SpeciesBadge especie={r.especie} lang={lang} />
            <span className="fine">
              <bdi dir="ltr">@{p.autor}</bdi> · <time dateTime={p.em}>{relativeTime(p.em, d, now)}</time>
            </span>
          </div>
          <Link href={href} className="icon-btn fb-post-menu" aria-label={fmt(t.abrir, { nome: r.nome })}>
            <IcDots />
          </Link>
        </header>
        <p className="fb-post-text" dir="auto">{p.texto}</p>
        {p.foto && (
          <Link href={href} className="fb-post-photo" tabIndex={-1} aria-hidden>
            <Photo foto={PHOTOS[p.foto]} prioridade={priority} late={late} sizes="(min-width: 960px) 680px, 100vw" />
          </Link>
        )}
        <div className="fb-post-numbers">
          <LiveCount rotulo={t.reacoesRotulo} curtidas={t.curtidas} />
          <Link href={`${href}#comentarios`}>{plural(t.comentarios, p.totalComments)}</Link>
        </div>
        <div className="fb-post-actions">
          {/* 0.10.0: arrows; the demonstration posts carry example counts (src/lib/karma/demo.ts) */}
          <VoteButtons id={p.id} counts={exampleArrows(p.id)} />
          <LikeButton rotulo={t.curtir} ajuda={t.demonstracaoCurtir} />
          <Link href={`${href}#comentarios`} className="fb-action">
            <IcComment />
            <span>{t.comentar}</span>
          </Link>
          <Link href={href} className="fb-action">
            <IcShare />
            <span>{t.compartilhar}</span>
          </Link>
        </div>
      </LivePost>
    </article>
  )
}
