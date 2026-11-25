'use client'

import { useOptimistic, useTransition } from 'react'
import { reagirAcao } from '@/app/acoes'
import type { TipoReacao } from '@/lib/tipos'
import { IcCoracao, IcLampada } from './Icones'

type Estado = { reacoes: Record<TipoReacao, number>; minha: TipoReacao | null }

/** Aplica um toque: tocar na mesma tira, tocar em outra troca. Pura, para o teste conferir. */
export function aplicarToque(e: Estado, tipo: TipoReacao): Estado {
  const reacoes = { ...e.reacoes }
  if (e.minha) reacoes[e.minha] = Math.max(0, reacoes[e.minha] - 1)
  if (e.minha === tipo) return { reacoes, minha: null }
  reacoes[tipo] += 1
  return { reacoes, minha: tipo }
}

export default function Reacoes({ id, reacoes, minha, rotulos }: { id: string; reacoes: Record<TipoReacao, number>; minha: TipoReacao | null; rotulos: { curtir: string; util: string } }) {
  const [estado, otimista] = useOptimistic<Estado, TipoReacao>({ reacoes, minha }, aplicarToque)
  const [, iniciar] = useTransition()
  const toque = (t: TipoReacao) => iniciar(async () => {
    otimista(t)
    await reagirAcao(id, t)
  })
  return (
    <>
      <button type="button" className="acao-btn" data-tipo="curtir" aria-pressed={estado.minha === 'curtir'} onClick={() => toque('curtir')} aria-label={`${rotulos.curtir}: ${estado.reacoes.curtir}`}>
        <IcCoracao />
        <span>{estado.reacoes.curtir || ''}</span>
      </button>
      <button type="button" className="acao-btn" data-tipo="util" aria-pressed={estado.minha === 'util'} onClick={() => toque('util')} aria-label={`${rotulos.util}: ${estado.reacoes.util}`}>
        <IcLampada />
        <span>{estado.reacoes.util || ''}</span>
      </button>
    </>
  )
}
