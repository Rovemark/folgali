'use client'

import { useState, useTransition } from 'react'
import { maisDoRoverAcao, maisLinhaAcao } from '@/app/acoes'
import type { Dicionario, Pronto } from '@/lib/i18n-base'
import type { Pagina, Postagem as TPostagem, TipoPostagem } from '@/lib/tipos'
import Postagem from './Postagem'

type Fonte = { tipo: 'linha' } | { tipo: 'rover'; uid: string; filtro: TipoPostagem }

type Props = {
  inicial: Pagina<TPostagem>
  fonte: Fonte
  d: Dicionario
  lang: Pronto
  agora: string
  meuUid?: string | null
  /** liga a costura que se desenha na entrada (só na primeira tela da linha) */
  entrada?: boolean
}

export default function ListaPostagens({ inicial, fonte, d, lang, agora, meuUid, entrada = false }: Props) {
  const [itens, setItens] = useState(inicial.itens)
  const [proximo, setProximo] = useState(inicial.proximo)
  const [falhou, setFalhou] = useState(false)
  const [pendente, iniciar] = useTransition()

  function carregar() {
    if (!proximo) return
    iniciar(async () => {
      const r = fonte.tipo === 'linha' ? await maisLinhaAcao(proximo) : await maisDoRoverAcao(fonte.uid, fonte.filtro, proximo)
      if (!r) return setFalhou(true)
      setFalhou(false)
      setItens((atual) => [...atual, ...r.itens.filter((n) => !atual.some((a) => a.id === n.id))])
      setProximo(r.proximo)
    })
  }

  return (
    <>
      <div className={`fio-lista${entrada ? ' entrada' : ''}`} role="feed" aria-busy={pendente}>
        {itens.map((p, i) => (
          <Postagem key={p.id} p={p} d={d} lang={lang} agora={agora} meuUid={meuUid} i={i < 8 ? i : 0} />
        ))}
      </div>
      {proximo && (
        <div style={{ display: 'grid', justifyItems: 'center', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-sec" onClick={carregar} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {falhou && <p className="erro-campo" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
