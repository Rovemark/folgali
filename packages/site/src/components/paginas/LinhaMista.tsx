'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import Emblema from '@/components/social/Emblema'
import Postagem from '@/components/Postagem'
import { useMais } from '@/components/social/useMais'
import type { Dicionario, Pronto } from '@/lib/i18n-base'
import type { ItemDaLinha } from '@/lib/social/tipos'
import type { Pagina } from '@/lib/tipos'
import CartaoAtualizacao from './CartaoAtualizacao'

const chave = (x: ItemDaLinha) => (x.tipo === 'postagem' ? x.postagem.id : x.atualizacao.id)

type Props = {
  inicial: Pagina<ItemDaLinha>
  d: Dicionario
  lang: Pronto
  agora: string
  meuUid?: string | null
  /** entra depois do quarto item da primeira página (sugestões leves) */
  sugestoes?: ReactNode
}

/** A linha de início: postagens dos rovers e atualizações das páginas que a pessoa segue, no mesmo fio, por hora. */
export default function LinhaMista({ inicial, d, lang, agora, meuUid, sugestoes }: Props) {
  const { itens, proximo, falhou, pendente, mais } = useMais(inicial, { lista: 'linhaMista' }, chave)
  return (
    <>
      <div className="fio-lista entrada" role="feed" aria-busy={pendente}>
        {itens.map((x, i) => (
          <div key={chave(x)} className="linha-item">
            {x.tipo === 'postagem' ? (
              <Postagem p={x.postagem} d={d} lang={lang} agora={agora} meuUid={meuUid} i={i < 8 ? i : 0} />
            ) : (
              <div className="post sem-fio linha-atu" style={{ ['--i' as string]: i < 8 ? i : 0 }}>
                <div className="post-trilha">
                  <Link href={`/${lang}/paginas/${x.atualizacao.pagina}`} tabIndex={-1} aria-hidden>
                    <Emblema nome={x.atualizacao.paginaNome ?? '?'} forma="etiqueta" tamanho={48} />
                  </Link>
                </div>
                <div className="post-corpo">
                  <CartaoAtualizacao a={x.atualizacao} d={d} lang={lang} agora={agora} meuUid={meuUid} comPagina noFio />
                </div>
              </div>
            )}
            {i === 3 && sugestoes}
          </div>
        ))}
      </div>
      {proximo && (
        <div className="mais">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {falhou && (
            <p className="erro-campo" role="alert">
              {d.erro.titulo}. {d.comum.tentarDeNovo}.
            </p>
          )}
        </div>
      )}
    </>
  )
}
