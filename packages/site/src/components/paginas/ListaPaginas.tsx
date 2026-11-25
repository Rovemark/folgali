'use client'

import { useMais } from '@/components/social/useMais'
import type { Dicionario, Pronto } from '@/lib/i18n-base'
import type { PaginaCartao } from '@/lib/social/tipos'
import type { Pagina } from '@/lib/tipos'
import CartaoPagina from './CartaoPagina'

type Props = { inicial: Pagina<PaginaCartao>; opcoes: Record<string, string>; d: Dicionario; lang: Pronto; agora: string }

export default function ListaPaginas({ inicial, opcoes, d, lang, agora }: Props) {
  const { itens, proximo, falhou, pendente, mais } = useMais(inicial, { lista: 'paginas', opcoes }, (p) => p.id)
  return (
    <>
      <ul className="grade-etiquetas" aria-busy={pendente}>
        {itens.map((p) => (
          <li key={p.id}>
            <CartaoPagina p={p} d={d} lang={lang} agora={agora} />
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
