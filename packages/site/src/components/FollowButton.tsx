'use client'

import { useEffect, useOptimistic, useRef, useTransition } from 'react'
import { followAction } from '@/app/actions'
import { notify } from './life/notice'
import { runAnimation } from './life/movement'
import { useLifeTexts } from './life/useLifeTexts'

export default function FollowButton({ uid, seguindo: following, rotulos: labels }: { uid: string; seguindo: boolean; rotulos: { seguir: string; seguindo: string } }) {
  const [value, otimista] = useOptimistic(following, (_current: boolean, newValue: boolean) => newValue)
  const [, start] = useTransition()
  const tv = useLifeTexts()
  const btn = useRef<HTMLButtonElement>(null)
  const before = useRef(value)
  // the state change enters with a spring: the button sinks and comes back, and the icon turns from + to ✓
  useEffect(() => {
    if (before.current === value) return
    before.current = value
    runAnimation(btn.current, [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { duracao: '--vida-lento' })
    runAnimation(btn.current?.querySelector('.life-follow-icon'), [{ transform: 'scale(0.2) rotate(-90deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duracao: '--vida-lento' })
  }, [value])
  return (
    <button
      ref={btn}
      type="button"
      className="btn btn-primary btn-follow life-follow"
      aria-pressed={value}
      onClick={() => start(async () => {
        const newValue = !value
        otimista(newValue)
        notify(newValue ? tv.seguiu : tv.deixouDeSeguir)
        await followAction(uid, newValue)
      })}
    >
      <svg className="life-follow-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
        {value ? <path d="m5 12.5 4.2 4.2L19 7" /> : <path d="M12 5v14M5 12h14" />}
      </svg>
      {/* the three labels take the same cell: the button has the width of the largest one and does not jump when swapping or hovering */}
      <span className="life-follow-labels">
        <span className="life-follow-r" data-ativo={!value || undefined} aria-hidden={value || undefined}>{labels.seguir}</span>
        <span className="life-follow-r" data-ativo={value || undefined} aria-hidden={!value || undefined}>{labels.seguindo}</span>
        <span className="life-follow-r life-follow-leave" aria-hidden>{tv.deixarDeSeguir}</span>
      </span>
    </button>
  )
}
