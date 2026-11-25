'use client'

import { useOptimistic, useTransition } from 'react'
import { seguirAcao } from '@/app/acoes'

export default function BotaoSeguir({ uid, seguindo, rotulos }: { uid: string; seguindo: boolean; rotulos: { seguir: string; seguindo: string } }) {
  const [valor, otimista] = useOptimistic(seguindo, (_atual: boolean, novo: boolean) => novo)
  const [, iniciar] = useTransition()
  return (
    <button
      type="button"
      className="btn btn-prim btn-seguir"
      aria-pressed={valor}
      onClick={() => iniciar(async () => {
        otimista(!valor)
        await seguirAcao(uid, !valor)
      })}
    >
      {valor ? rotulos.seguindo : rotulos.seguir}
    </button>
  )
}
