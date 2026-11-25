'use client'

import { useMais } from '@/components/social/useMais'
import type { Dicionario, Pronto } from '@/lib/i18n-base'
import type { Atualizacao } from '@/lib/social/tipos'
import type { Pagina } from '@/lib/tipos'
import CartaoAtualizacao from './CartaoAtualizacao'

type Props = { inicial: Pagina<Atualizacao>; pagina: string; d: Dicionario; lang: Pronto; agora: string; meuUid?: string | null; souDonoDaPagina: boolean; nomeDaPagina: string }

export default function ListaAtualizacoes({ inicial, pagina, d, lang, agora, meuUid, souDonoDaPagina, nomeDaPagina }: Props) {
  const { itens, proximo, falhou, pendente, mais } = useMais(inicial, { lista: 'atualizacoes', de: pagina }, (a) => a.id)
  return (
    <>
      <div className="pilha" aria-busy={pendente}>
        {itens.map((a, i) => (
          <CartaoAtualizacao key={a.id} a={{ ...a, paginaNome: a.paginaNome ?? nomeDaPagina }} d={d} lang={lang} agora={agora} meuUid={meuUid} souDonoDaPagina={souDonoDaPagina} i={i < 6 ? i : 0} />
        ))}
      </div>
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
