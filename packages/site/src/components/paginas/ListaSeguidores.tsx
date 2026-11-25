'use client'

import CartaoRover from '@/components/social/CartaoRover'
import { useMais } from '@/components/social/useMais'
import type { Dicionario, Pronto } from '@/lib/i18n-base'
import type { Pagina, ResumoRover } from '@/lib/tipos'

export default function ListaSeguidores({ inicial, pagina, d, lang }: { inicial: Pagina<ResumoRover>; pagina: string; d: Dicionario; lang: Pronto }) {
  const { itens, proximo, falhou, pendente, mais } = useMais(inicial, { lista: 'seguidoresDaPagina', de: pagina }, (r) => r.uid)
  return (
    <>
      <ul className="cartao grade-seguidores" aria-busy={pendente}>
        {itens.map((r) => (
          <li key={r.uid}>
            <CartaoRover rover={r} lang={lang} />
          </li>
        ))}
      </ul>
      {proximo && (
        <div className="mais">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {falhou && <p className="erro-campo" role="alert">{d.erro.titulo}</p>}
        </div>
      )}
    </>
  )
}
