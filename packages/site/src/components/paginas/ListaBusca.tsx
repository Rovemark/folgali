'use client'

import { useMais } from '@/components/social/useMais'
import type { Dicionario, Pronto } from '@/lib/i18n-base'
import type { ComunidadeCartao, PaginaCartao, RoverBuscado, TipoDeBusca, TopicoCartao } from '@/lib/social/tipos'
import type { Pagina } from '@/lib/tipos'
import CartaoComunidadeMini from './CartaoComunidadeMini'
import CartaoPagina from './CartaoPagina'
import CartaoTopicoMini from './CartaoTopicoMini'
import ResultadoRover from './ResultadoRover'

const LISTA = { rovers: 'buscaRovers', comunidades: 'buscaComunidades', topicos: 'buscaTopicos', paginas: 'buscaPaginas' } as const

type Item = RoverBuscado | ComunidadeCartao | TopicoCartao | PaginaCartao
const chave = (x: Item) => ('uid' in x ? x.uid : x.id)

type Props = { tipo: TipoDeBusca; inicial: Pagina<Item>; termo: string; d: Dicionario; lang: Pronto; agora: string; opcoes?: Record<string, string> }

/** Os resultados de UM tipo de busca, com "ver mais" (o cursor é um deslocamento que o cliente não interpreta). */
export default function ListaBusca({ tipo, inicial, termo, d, lang, agora, opcoes }: Props) {
  const { itens, proximo, falhou, pendente, mais } = useMais<Item>(inicial, { lista: LISTA[tipo], de: termo, ...(opcoes ? { opcoes } : {}) }, chave)
  return (
    <>
      <ul className={tipo === 'paginas' ? 'grade-etiquetas' : 'resultados'} aria-busy={pendente}>
        {itens.map((x) => (
          <li key={chave(x)}>
            {tipo === 'rovers' && <ResultadoRover r={x as RoverBuscado} lang={lang} termo={termo} />}
            {tipo === 'comunidades' && <CartaoComunidadeMini c={x as ComunidadeCartao} d={d} lang={lang} agora={agora} termo={termo} />}
            {tipo === 'topicos' && <CartaoTopicoMini t={x as TopicoCartao} d={d} lang={lang} agora={agora} termo={termo} />}
            {tipo === 'paginas' && <CartaoPagina p={x as PaginaCartao} d={d} lang={lang} agora={agora} termo={termo} />}
          </li>
        ))}
      </ul>
      {proximo && (
        <div className="mais">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {falhou && <p className="erro-campo" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
