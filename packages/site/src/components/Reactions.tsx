'use client'

import { useOptimistic, useTransition } from 'react'
import { reactAction } from '@/app/actions'
import type { ReactionType } from '@/lib/types'
import { IcHeart, IcLamp } from './Icons'
import RollingNumber from './life/RollingNumber'

const withoutZero = (n: number) => (n ? String(n) : '')

type State = { reacoes: Record<ReactionType, number>; minha: ReactionType | null }

/** Applies a tap: tapping the same strip, tapping another one swaps. Pure, so the test can check it. */
export function applyTouch(e: State, type: ReactionType): State {
  const reactions = { ...e.reacoes }
  if (e.minha) reactions[e.minha] = Math.max(0, reactions[e.minha] - 1)
  if (e.minha === type) return { reacoes: reactions, minha: null }
  reactions[type] += 1
  return { reacoes: reactions, minha: type }
}

export default function Reactions({ id, reacoes: reactions, minha: mine, rotulos: labels }: { id: string; reacoes: Record<ReactionType, number>; minha: ReactionType | null; rotulos: { curtir: string; util: string } }) {
  const [state, otimista] = useOptimistic<State, ReactionType>({ reacoes: reactions, minha: mine }, applyTouch)
  const [, start] = useTransition()
  const touch = (t: ReactionType) => start(async () => {
    otimista(t)
    await reactAction(id, t)
  })
  return (
    <>
      <button type="button" className="action-btn" data-tipo="curtir" aria-pressed={state.minha === 'curtir'} onClick={() => touch('curtir')} aria-label={`${labels.curtir}: ${state.reacoes.curtir}`}>
        <IcHeart />
        <RollingNumber valor={state.reacoes.curtir} format={withoutZero} />
      </button>
      <button type="button" className="action-btn" data-tipo="util" aria-pressed={state.minha === 'util'} onClick={() => touch('util')} aria-label={`${labels.util}: ${state.reacoes.util}`}>
        <IcLamp />
        <RollingNumber valor={state.reacoes.util} format={withoutZero} />
      </button>
    </>
  )
}
