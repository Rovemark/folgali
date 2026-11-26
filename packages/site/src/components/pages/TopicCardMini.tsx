import Link from 'next/link'
import Portrait from '@/components/Portrait'
import { IcPin, IcResolved } from '@/components/social/SocialIcons'
import { plural, relativeTime, type Dictionary, type Ready } from '@/lib/i18n'
import { surroundingSnippet } from '@/lib/social/term'
import type { TopicCardData } from '@/lib/social/types'
import Highlight from './Highlight'

/** A forum topic as a result or as an item of "trending": title, where it lives, who opened it and how many replies it has. */
export default function TopicCardMini({ t, d, lang, agora: now, termo: term = '', posicao: position }: { t: TopicCardData; d: Dictionary; lang: Ready; agora: string; termo?: string; posicao?: number }) {
  return (
    <article className="topic-mini">
      {position !== undefined && (
        <span className="topic-mini-num" aria-hidden>
          {position}
        </span>
      )}
      <div className="topic-mini-body">
        <h3>
          <Link href={`/${lang}/t/${t.id}`}>
            <Highlight texto={t.titulo} termo={term} />
          </Link>
        </h3>
        {t.trecho && (
          <p className="topic-mini-excerpt">
            <Highlight texto={surroundingSnippet(t.trecho, term, 140)} termo={term} />
          </p>
        )}
        <p className="topic-mini-meta">
          {t.comunidadeNome && (
            <Link href={`/${lang}/comunidades/${t.comunidade}`} className="topic-mini-where">
              {t.comunidadeNome}
            </Link>
          )}
          <span className="topic-mini-author">
            <Portrait ficha={t.autor.rosto} nome={t.autor.nome} tamanho={20} decorative />
            {t.autor.nome}
          </span>
          <span>{plural(d.socPaginas.cartao.respostas, t.respostas)}</span>
          {/* 0.3.1 (`pessoas-em-alta`): only the number of DISTINCT people, never who */}
          {t.pessoas !== undefined && <span className="pill" data-tom="ok">{plural(d.socDescobrir.pessoasTopico, t.pessoas)}</span>}
          <span>{relativeTime(t.atividadeEm, d, new Date(now))}</span>
          {t.fixado && (
            <span className="pill">
              <IcPin /> {d.socPaginas.cartao.fixado}
            </span>
          )}
          {t.resolvido && (
            <span className="pill" data-tom="ok">
              <IcResolved /> {d.socPaginas.cartao.resolvido}
            </span>
          )}
        </p>
      </div>
    </article>
  )
}
