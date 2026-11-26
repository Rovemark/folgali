'use client'

import { useMore } from '@/components/social/useMais'
import type { Dictionary, Ready } from '@/lib/i18n-base'
import type { CommunityCardData, PageCardData, SearchedRover, SearchType, TopicCardData } from '@/lib/social/types'
import type { Page } from '@/lib/types'
import CommunityCardMini from './CommunityCardMini'
import PageCard from './PageCard'
import TopicCardMini from './TopicCardMini'
import RoverResult from './RoverResult'

const LIST = { rovers: 'buscaRovers', comunidades: 'buscaComunidades', topicos: 'buscaTopicos', paginas: 'buscaPaginas' } as const

type Item = SearchedRover | CommunityCardData | TopicCardData | PageCardData
const key = (x: Item) => ('uid' in x ? x.uid : x.id)

type Props = { tipo: SearchType; initial: Page<Item>; termo: string; d: Dictionary; lang: Ready; agora: string; opcoes?: Record<string, string> }

/** The results of ONE kind of search, with "see more" (the cursor is an offset that the client does not interpret). */
export default function SearchList({ tipo: type, initial, termo: term, d, lang, agora: now, opcoes: options }: Props) {
  const { itens: items, proximo: next, failed, pendente: pending, mais: more } = useMore<Item>(initial, { lista: LIST[type], de: term, ...(options ? { opcoes: options } : {}) }, key)
  return (
    <>
      <ul className={type === 'paginas' ? 'label-grid' : 'results'} aria-busy={pending}>
        {items.map((x) => (
          <li key={key(x)}>
            {type === 'rovers' && <RoverResult r={x as SearchedRover} lang={lang} termo={term} />}
            {type === 'comunidades' && <CommunityCardMini c={x as CommunityCardData} d={d} lang={lang} agora={now} termo={term} />}
            {type === 'topicos' && <TopicCardMini t={x as TopicCardData} d={d} lang={lang} agora={now} termo={term} />}
            {type === 'paginas' && <PageCard p={x as PageCardData} d={d} lang={lang} agora={now} termo={term} />}
          </li>
        ))}
      </ul>
      {next && (
        <div className="more">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {failed && <p className="error-field" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
