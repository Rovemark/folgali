'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import Emblem from '@/components/social/Emblem'
import Post from '@/components/Post'
import { useMore } from '@/components/social/useMais'
import type { Dictionary, Ready } from '@/lib/i18n-base'
import type { TimelineItem } from '@/lib/social/types'
import type { Page } from '@/lib/types'
import UpdateCard from './UpdateCard'

const key = (x: TimelineItem) => (x.tipo === 'postagem' ? x.postagem.id : x.atualizacao.id)

type Props = {
  initial: Page<TimelineItem>
  d: Dictionary
  lang: Ready
  agora: string
  myUid?: string | null
  /** enters after the fourth item of the first page (light suggestions) */
  sugestoes?: ReactNode
}

/** The home line: posts of the rovers and updates of the pages the person follows, in the same thread, by hour. */
export default function MixedTimeline({ initial, d, lang, agora: now, myUid, sugestoes: suggestions }: Props) {
  const { itens: items, proximo: next, failed, pendente: pending, mais: more } = useMore(initial, { lista: 'linhaMista' }, key)
  return (
    <>
      <div className="thread-list entrada" role="feed" aria-busy={pending}>
        {items.map((x, i) => (
          <div key={key(x)} className="row-item">
            {x.tipo === 'postagem' ? (
              <Post p={x.postagem} d={d} lang={lang} agora={now} myUid={myUid} i={i < 8 ? i : 0} />
            ) : (
              <div className="post sem-fio upd-row" style={{ ['--i' as string]: i < 8 ? i : 0 }}>
                <div className="post-trail">
                  <Link href={`/${lang}/paginas/${x.atualizacao.pagina}`} tabIndex={-1} aria-hidden>
                    <Emblem nome={x.atualizacao.pageName ?? '?'} forma="etiqueta" tamanho={48} />
                  </Link>
                </div>
                <div className="post-body">
                  <UpdateCard a={x.atualizacao} d={d} lang={lang} agora={now} myUid={myUid} withPage inThread />
                </div>
              </div>
            )}
            {i === 3 && suggestions}
          </div>
        ))}
      </div>
      {next && (
        <div className="more">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {failed && (
            <p className="error-field" role="alert">
              {d.erro.titulo}. {d.comum.tentarDeNovo}.
            </p>
          )}
        </div>
      )}
    </>
  )
}
