'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import type { ShowcaseTexts } from '@/i18n/showcase'

const SHOT = (id: string) => `/marca/rover-hangar/app/${id}.webp`

/**
 * A tour of the Rover Hangar app: real screens in a window frame, switched by tabs (ARIA tabs pattern: arrows, Home and End move
 * between tabs, the panel follows). The new screen slides in with the house spring; with "reduce motion" it just swaps.
 */
export default function AppTour({ t }: { t: ShowcaseTexts['hangar'] }) {
  const [on, setOn] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const go = (i: number) => {
    const n = (i + t.tabs.length) % t.tabs.length
    setOn(n)
    tabs.current[n]?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    const rtl = document.documentElement.dir === 'rtl'
    const next = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (next) { e.preventDefault(); go(on + next) }
    else if (e.key === 'Home') { e.preventDefault(); go(0) }
    else if (e.key === 'End') { e.preventDefault(); go(t.tabs.length - 1) }
  }
  const cur = t.tabs[on]
  return (
    <section className="sc-tour" aria-labelledby="sc-tour-t">
      <header className="sc-section-head" data-reveal>
        <h2 id="sc-tour-t">{t.tourTitle}</h2>
        <p className="sc-section-lead">{t.tourLead}</p>
      </header>
      <div className="sc-tour-tabs" role="tablist" aria-label={t.tourTitle} onKeyDown={onKey}>
        {t.tabs.map((x, i) => (
          <button
            key={x.id}
            ref={(el) => { tabs.current[i] = el }}
            type="button"
            role="tab"
            id={`sc-tab-${x.id}`}
            aria-selected={i === on}
            aria-controls="sc-tour-panel"
            tabIndex={i === on ? 0 : -1}
            className="sc-tour-tab"
            onClick={() => setOn(i)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div id="sc-tour-panel" role="tabpanel" aria-labelledby={`sc-tab-${cur.id}`} className="sc-tour-panel">
        <div className="sc-window">
          <div className="sc-window-screen">
            {t.tabs.map((x, i) => (
              // every screen is in the page (no layout jump on switch); only the selected one shows and is announced
              // eslint-disable-next-line @next/next/no-img-element -- real app screenshots, already webp
              <img
                key={x.id}
                src={SHOT(x.id)}
                width={1200}
                height={800}
                alt={i === on ? x.alt : ''}
                aria-hidden={i === on ? undefined : true}
                data-on={i === on || undefined}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
            ))}
          </div>
        </div>
        <div className="sc-tour-copy" key={cur.id}>
          <h3>{cur.title}</h3>
          <p>{cur.text}</p>
          <p className="sc-tour-count" aria-hidden>{String(on + 1).padStart(2, '0')} / {String(t.tabs.length).padStart(2, '0')}</p>
        </div>
      </div>
    </section>
  )
}
