import Link from 'next/link'
import { plural, relativeTime, type Dictionary } from '@/lib/i18n'
import type { TopicCardData, Vocabulary } from '@/lib/social/types'
import Portrait from '@/components/Portrait'
import Marks from './Brands'
import { IcEdit, IcPoll, IcPin, IcResolved, IcPadlock } from '@/components/social/SocialIcons'

/** The badges of a topic: only the ones that apply, with icon and text (color is never the only signal). */
export function TopicBadges({ t, d }: { t: Pick<TopicCardData, 'fixado' | 'trancado' | 'resolvido' | 'enquete' | 'editado'>; d: Dictionary }) {
  const s = d.socForum.selos
  return (
    <>
      {t.fixado && (
        <span className="pill" data-tom="acao">
          <IcPin /> {s.fixado}
        </span>
      )}
      {t.resolvido && (
        <span className="pill" data-tom="ok">
          <IcResolved /> {s.resolvido}
        </span>
      )}
      {t.trancado && (
        <span className="pill" data-tom="aviso">
          <IcPadlock /> {s.trancado}
        </span>
      )}
      {t.enquete && (
        <span className="pill">
          <IcPoll /> {s.enquete}
        </span>
      )}
      {t.editado && (
        <span className="pill">
          <IcEdit /> {s.editado}
        </span>
      )}
    </>
  )
}

/** A forum row: the portrait of whoever opened it, the title, the excerpt and the numbers, held by the thread. */
/** `vocabulario` (0.3.2): that of the topic's community. Without it (search, trending, other places) the marks do not appear, instead of appearing as code. */
export default function TopicCard({ t, d, lang, agora: now, withCommunity = false, vocabulario: vocabulary }: { t: TopicCardData; d: Dictionary; lang: string; agora: string; withCommunity?: boolean; vocabulario?: Vocabulary }) {
  const c = d.socForum.cartao
  return (
    <article className={`topic-card${t.fixado ? ' pinned' : ''}`}>
      <div className="topic-trail">
        <Portrait ficha={t.autor.rosto} nome={t.autor.nome} tamanho={44} decorative />
      </div>
      <div className="topic-body">
        <div className="flex-row topic-badges">
          <TopicBadges t={t} d={d} />
          <Marks marcas={t.marcas} vocabulario={vocabulary} d={d} />
          {t.categoria && <span className="label-tag">{t.categoria}</span>}
          {withCommunity && t.comunidadeNome && <span className="fine">{t.comunidadeNome}</span>}
        </div>
        <h3>
          <Link href={`/${lang}/t/${t.id}`} aria-label={c.ir.replace('{titulo}', t.titulo)}>
            {t.titulo}
          </Link>
        </h3>
        <p className="topic-excerpt">{t.trecho}</p>
        <p className="fine topic-meta">
          <span>{c.por.replace('{nome}', t.autor.nome)}</span>
          <span>{plural(c.respostas, t.respostas)}</span>
          <span>{c.ativo.replace('{quando}', relativeTime(t.atividadeEm, d, new Date(now)))}</span>
        </p>
      </div>
    </article>
  )
}
