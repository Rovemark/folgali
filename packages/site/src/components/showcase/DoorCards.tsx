'use client'

import { useRef, useState } from 'react'
import type { ShowcaseTexts } from '@/i18n/showcase'

type Door = { image: { src: string; width: number; height: number }; href: string; external?: boolean; tone: 'manga' | 'rosa' | 'menta' }

/**
 * The three ways in (Hangar rover, people, outside agent) as cards that flip open. Both faces live in the same grid cell, so the card
 * never changes height. The hidden face is `inert` (out of the tab order and of the accessibility tree); focus follows the flip.
 */
export default function DoorCards({ t, doors, id = 'como' }: { t: ShowcaseTexts['doors']; doors: Door[]; id?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const backs = useRef<(HTMLDivElement | null)[]>([])
  const fronts = useRef<(HTMLButtonElement | null)[]>([])
  const flip = (i: number | null, from: number) => {
    setOpen(i)
    window.requestAnimationFrame(() => (i === null ? fronts.current[from] : backs.current[from])?.focus())
  }
  return (
    <section className="sc-doors" id={id} aria-labelledby={`${id}-t`}>
      <header className="sc-section-head" data-reveal>
        <h2 id={`${id}-t`}>{t.title}</h2>
        <p className="sc-section-lead">{t.lead}</p>
      </header>
      <ol className="sc-door-list">
        {t.items.map((d, i) => {
          const door = doors[i]
          const flipped = open === i
          return (
            <li key={d.tag} className="sc-door" data-flipped={flipped || undefined} data-tone={door.tone} data-reveal>
              <div className="sc-door-inner">
                <div className="sc-door-face sc-door-front" inert={flipped || undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- static art already compressed to webp */}
                  <img src={door.image.src} width={door.image.width} height={door.image.height} alt="" loading="lazy" decoding="async" />
                  <div className="sc-door-body">
                    <p className="sc-door-num" aria-hidden>{i + 1}</p>
                    <p className="sc-door-tag">{d.tag}</p>
                    <h3>{d.title}</h3>
                    <p>{d.short}</p>
                    <button
                      type="button"
                      className="btn btn-calm"
                      aria-expanded={flipped}
                      onClick={() => flip(i, i)}
                      ref={(el) => { fronts.current[i] = el }}
                    >
                      {t.open}
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                </div>
                <div className="sc-door-face sc-door-back" inert={!flipped || undefined} ref={(el) => { backs.current[i] = el }} tabIndex={-1}>
                  <p className="sc-door-tag">{d.tag}</p>
                  <h3>{d.title}</h3>
                  <p>{d.text}</p>
                  <p className="sc-door-actions">
                    <a href={door.href} className="btn btn-primary" {...(door.external ? { rel: 'noopener' } : {})}>{d.action}</a>
                    <button type="button" className="btn btn-calm" onClick={() => flip(null, i)}>{t.back}</button>
                  </p>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
