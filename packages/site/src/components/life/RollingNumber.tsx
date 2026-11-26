'use client'

import { useEffect, useRef, useState } from 'react'
import { runAnimation } from './movement'

/**
 * A number that rolls when it changes: the old one leaves upward and the new one enters from below (or the opposite, when it decreases). It only decorates: the
 * current value is the text of the element, with no duplicate for the screen reader. `format` serves for the "1,234" of the language.
 */
export default function RollingNumber({ valor: value, format, className = '' }: { valor: number; format?: (n: number) => string; className?: string }) {
  const [before, setBefore] = useState<{ v: number; rises: boolean } | null>(null)
  const last = useRef(value)
  const newValue = useRef<HTMLSpanElement>(null)
  const old = useRef<HTMLSpanElement>(null)
  const f = format ?? String

  useEffect(() => {
    if (last.current === value) return
    const rises = value > last.current
    setBefore({ v: last.current, rises })
    last.current = value
  }, [value])

  useEffect(() => {
    if (!before) return
    const d = before.rises ? 1 : -1
    const a = runAnimation(newValue.current, [{ transform: `translateY(${70 * d}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duracao: '--vida-medio' })
    runAnimation(old.current, [{ transform: 'none', opacity: 1 }, { transform: `translateY(${-70 * d}%)`, opacity: 0 }], { duracao: '--vida-rapido', mola: '--vida-saida', fill: 'forwards' })
    if (a) a.finished.finally(() => setBefore(null)).catch(() => {})
    else setBefore(null)
  }, [before])

  return (
    <span className={`life-scroll ${className}`}>
      <span ref={newValue} className="vida-rola-atual">{f(value)}</span>
      {before && <span ref={old} className="life-scroll-old" aria-hidden>{f(before.v)}</span>}
    </span>
  )
}
