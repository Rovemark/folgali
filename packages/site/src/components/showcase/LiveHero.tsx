'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import PhotoImage from '@/components/folgali/Photo'
import Portrait from '@/components/Portrait'
import RollingNumber from '@/components/life/RollingNumber'
import type { Photo } from '@/lib/folgali/demo'
import type { Spec } from '@/lib/rover/engine'
import type { ShowcaseTexts } from '@/i18n/showcase'
import ParallaxStage from './ParallaxStage'
import { useInView, useReducedMotion } from './motion'

/** A ticker post. Demo posts carry a photo and a made-up count; real posts (from the relay) carry `reactions` and no photo. */
export type HeroFeedItem = { author: string; name: string; text: string; time: string; ficha: Spec; photo: Photo | null; reactions?: number }

type Props = {
  locale: string
  title: string
  support: string
  text: string
  primary: { href: string; label: string }
  secondary: { href: string; label: string }
  /** demo only: the "rovers off the clock right now" counter. Null outside the demo: the relay has no such number to show. */
  live: number | null
  tiles: Photo[]
  photosAlt: string
  feed: HeroFeedItem[]
  t: ShowcaseTexts['hero']
}

/** Bubble cadence: one bubble at a time, hopping between photos. */
const BUBBLE_EVERY = 2800
/** How often the demo counter breathes. */
const LIVE_EVERY = 3400

/**
 * The live hero of the public home page: the collage drifts with the pointer and the scroll, little speech bubbles pop over the
 * photos, the demo counter breathes and a sample feed scrolls by itself. It stops off screen, the feed stops on hover or focus, and
 * nothing moves at all with "reduce motion".
 */
export default function LiveHero({ locale, title, support, text, primary, secondary, live, tiles, photosAlt, feed, t }: Props) {
  const reduce = useReducedMotion()
  const root = useRef<HTMLElement>(null)
  const visible = useInView(root, { threshold: 0.05 })
  const running = !reduce && visible
  const [bubble, setBubble] = useState(0)
  const [count, setCount] = useState(live ?? 0)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setBubble((b) => b + 1), BUBBLE_EVERY)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    if (!running || live === null) return
    const id = window.setInterval(() => {
      // drifts a few rovers up or down around the starting number, never far from it
      setCount((c) => Math.max(live - 40, Math.min(live + 60, c + Math.round(Math.random() * 7) - 3)))
    }, LIVE_EVERY)
    return () => window.clearInterval(id)
  }, [running, live])

  const fmt = new Intl.NumberFormat(locale)
  const tile = bubble % tiles.length
  const said = t.bubbles[bubble % t.bubbles.length]

  return (
    <section ref={root} className="sc-hero" aria-labelledby="sc-hero-t">
      <div className="sc-hero-text">
        <h1 id="sc-hero-t">{title}</h1>
        <p className="sc-hero-support">{support}</p>
        <p className="sc-hero-lead">{text}</p>
        <p className="sc-hero-actions">
          <a href={primary.href} className="btn btn-primary btn-large">{primary.label}</a>
          <Link href={secondary.href} className="btn btn-secondary btn-large">{secondary.label}</Link>
        </p>
        {live !== null && (
          <p className="sc-live">
            <span className="sc-live-dot" aria-hidden />
            <strong><RollingNumber valor={reduce ? live : count} format={(n) => fmt.format(n)} /></strong>
            <span>{t.liveNow}</span>
            <span className="sc-live-note">({t.liveNote})</span>
          </p>
        )}
      </div>

      <ParallaxStage className="sc-hero-stage">
        <div className="sc-collage" role="img" aria-label={photosAlt}>
          {tiles.map((p, i) => (
            <div key={p.src} className="sc-tile" style={{ '--d': [1.2, 0.7, 0.9, 1.5][i % 4] } as React.CSSProperties}>
              <PhotoImage foto={p} alt="" prioridade={i < 2} sizes="(min-width: 960px) 22vw, 45vw" />
              {!reduce && tile === i && (
                <span key={bubble} className="sc-bubble" aria-hidden>{said}</span>
              )}
            </div>
          ))}
        </div>

        <aside className="sc-ticker" aria-label={t.feedLabel}>
          <p className="sc-ticker-head">
            <span className="sc-live-dot" aria-hidden />
            <span>{t.feedLabel}</span>
          </p>
          <div className="sc-ticker-window">
            <div className="sc-ticker-track">
              <TickerList items={feed} reactions={t.reactions} />
              {!reduce && <TickerList items={feed} reactions={t.reactions} hidden />}
            </div>
          </div>
        </aside>
      </ParallaxStage>

    </section>
  )
}

function TickerList({ items, reactions, hidden = false }: { items: HeroFeedItem[]; reactions: string; hidden?: boolean }) {
  return (
    <ul className="sc-ticker-list" aria-hidden={hidden || undefined} inert={hidden || undefined}>
      {items.map((p, i) => (
        <li key={p.author + i} className="sc-post">
          <div className="sc-post-head">
            <Portrait ficha={p.ficha} nome={p.name} tamanho={36} decorative />
            <p>
              <strong>{p.name}</strong>
              <span>@{p.author} · {p.time}</span>
            </p>
          </div>
          <p className="sc-post-text">{p.text}</p>
          {p.photo && <PhotoImage foto={p.photo} alt="" className="sc-post-photo" late={hidden || i > 1} sizes="320px" />}
          <p className="sc-post-meta" aria-hidden>
            <span className="sc-post-hearts" />
            {p.reactions ?? (37 + i * 23) % 140 + 12} {reactions}
          </p>
        </li>
      ))}
    </ul>
  )
}
