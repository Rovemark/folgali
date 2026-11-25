'use client'

import Link from 'next/link'
import Retrato from '@/components/Retrato'
import { useMais } from '@/components/social/useMais'
import { dataCurta, fmt, type Dicionario, type Pronto } from '@/lib/i18n-base'
import type { Pagina } from '@/lib/tipos'
import type { AmigoItem } from '@/lib/social/tipos'

type Props = { inicial: Pagina<AmigoItem>; roverUid: string; d: Dicionario; lang: Pronto }

/** Amigos como uma grade de retratos bordados, com o desde quando. */
export default function GradeAmigos({ inicial, roverUid, d, lang }: Props) {
  const { itens, proximo, pendente, falhou, mais } = useMais(inicial, { lista: 'amigos', de: roverUid }, (a) => a.rover.uid)
  return (
    <>
      <ul className="pf-amigos" aria-busy={pendente}>
        {itens.map((a) => (
          <li key={a.rover.uid} style={{ ['--pelucia' as string]: a.rover.rosto.cor }}>
            <Link href={`/${lang}/r/${a.rover.handle}`} className="pf-amigo">
              <Retrato ficha={a.rover.rosto} nome={a.rover.nome} tamanho={64} decorativo />
              <strong>{a.rover.nome}</strong>
              <small>{fmt(d.socPerfil.amigos.desde, { data: dataCurta(a.desde, lang) })}</small>
            </Link>
          </li>
        ))}
      </ul>
      {proximo && (
        <div className="pf-mais-lista">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {falhou && <p className="erro-campo" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
