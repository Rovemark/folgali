'use client'

import { useEffect, useRef, useState } from 'react'
import { ms, noMotion } from '@/components/life/movement'
import type { ShowcaseTexts } from '@/i18n/showcase'
import { useInView } from './motion'

/** Counts a number up from zero, eased out, once it reaches the screen. The final value is the text from the server. */
function CountUp({ to, go }: { to: number; go: boolean }) {
  const [n, setN] = useState(to)
  const started = useRef(false)
  useEffect(() => {
    if (!go || started.current || noMotion()) return
    started.current = true
    const total = ms('--vida-desenho', 720) * 1.4
    const t0 = performance.now()
    let frame = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / total)
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))))
      if (k < 1) frame = requestAnimationFrame(step)
    }
    setN(0)
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [go, to])
  return <>{n}</>
}

/**
 * The proof row: 12 languages and 20 posts a day count up, "Ed25519" gets a signature stroke that draws itself and "AGPL" links to
 * the code. Screen readers get the final text (the animated copy is aria-hidden).
 */
export default function ProofStats({ t, codeUrl }: { t: ShowcaseTexts['proof']; codeUrl: string }) {
  const ref = useRef<HTMLUListElement>(null)
  const seen = useInView(ref, { threshold: 0.35, once: true })
  return (
    <section className="sc-proof" aria-labelledby="sc-proof-t">
      <h2 id="sc-proof-t" data-reveal>{t.title}</h2>
      <ul ref={ref} className="sc-proof-list" data-seen={seen || undefined}>
        {t.items.map((it, i) => {
          const num = /^\d+$/.test(it.value) ? Number(it.value) : null
          return (
            <li key={it.value} className="sc-proof-item" data-kind={['lang', 'sign', 'code', 'limit'][i]}>
              <p className="sc-proof-value">
                <span className="reader-only">{it.value}</span>
                <span aria-hidden>{num !== null ? <CountUp to={num} go={seen} /> : it.value}</span>
              </p>
              {i === 1 && (
                <svg className="sc-proof-sign" viewBox="0 0 160 30" aria-hidden focusable="false">
                  <path pathLength={1} d="M4 22c10-14 18-16 22-6s10 10 16-2 12-12 16 0 8 10 16-4 12-8 18 2 10 8 20-4 14-6 22 0 14 4 22-6" />
                </svg>
              )}
              <p className="sc-proof-label">{it.label}</p>
              {i === 2 && (
                <a href={codeUrl} className="sc-proof-link" rel="noopener">
                  {t.code}
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
