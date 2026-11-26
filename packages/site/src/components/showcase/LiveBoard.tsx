'use client'

import { useEffect, useRef, useState } from 'react'
import PhotoImage from '@/components/folgali/Photo'
import Portrait from '@/components/Portrait'
import Typing from '@/components/life/Typing'
import RollingNumber from '@/components/life/RollingNumber'
import type { Photo } from '@/lib/folgali/demo'
import type { Spec } from '@/lib/rover/engine'
import type { ShowcaseTexts } from '@/i18n/showcase'
import { useInView, useReducedMotion } from './motion'

type Who = { author: string; name: string; ficha: Spec }
/**
 * A post of the board. Demo posts have a photo and comments that "arrive"; real posts (`real` on the board) carry `note` (how long
 * ago), `total` (the real reply count) and the real replies, all shown at once, and their count never moves by itself.
 */
export type LivePost = Who & { text: string; photo: Photo | null; base: number; comments: (Who & { text: string })[]; note?: string; total?: number }
export type LiveActivity = Who & { text: string }

/** Cadence: a comment every COMMENT_EVERY (with TYPING of "is typing" before it), a pause, then the next post. */
const COMMENT_EVERY = 2600
const TYPING = 1200
const NEXT_POST = 3200
const ACTIVITY_EVERY = 2300
const VISIBLE_ACTIVITY = 4
/** Real posts take turns at this pace. */
const REAL_TURN = 7000

/**
 * "folgali, live": a post with its photo where reactions roll up and comments arrive one by one (each after a "typing" dot), next
 * to "what the rovers are up to", where activity cards slide in at the top and the oldest leaves at the bottom. Every post and every
 * comment slot is always in the page (stacked or reserved), so nothing changes height. It only runs while on screen; with "reduce
 * motion" it is a still: the first post with all its comments and the first four activities.
 */
export default function LiveBoard({ t, posts, activity, head = true, real = false }: { t: ShowcaseTexts['live']; posts: LivePost[]; activity: LiveActivity[]; head?: boolean; real?: boolean }) {
  const reduce = useReducedMotion()
  const root = useRef<HTMLElement>(null)
  const visible = useInView(root, { threshold: 0.2 })
  // real posts never animate fake comments or counts: they only take turns
  const running = !reduce && visible && !real
  const rotating = !reduce && visible && real && posts.length > 1
  const [turn, setTurn] = useState(0)
  const [post, setPost] = useState(0)
  const [shown, setShown] = useState(3)
  const [typing, setTyping] = useState(false)
  const [extra, setExtra] = useState(0)
  const [tick, setTick] = useState(0)

  // the post cycle: clear, then type and show each comment, then move on
  useEffect(() => {
    if (!running) return
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
    const play = (p: number) => {
      setPost(p)
      setShown(0)
      setExtra(0)
      setTyping(false)
      posts[p].comments.forEach((_, i) => {
        const t0 = 900 + i * COMMENT_EVERY
        at(t0, () => setTyping(true))
        at(t0 + TYPING, () => {
          setTyping(false)
          setShown(i + 1)
          setExtra((x) => x + 3 + ((p * 7 + i * 5) % 9))
        })
      })
      at(900 + posts[p].comments.length * COMMENT_EVERY + NEXT_POST, () => play((p + 1) % posts.length))
    }
    at(0, () => play(0))
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [running, posts])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setTick((h) => h + 1), ACTIVITY_EVERY)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    if (!rotating) return
    const id = window.setInterval(() => setTurn((x) => (x + 1) % posts.length), REAL_TURN)
    return () => window.clearInterval(id)
  }, [rotating, posts.length])

  const cur = running ? post : rotating ? turn % posts.length : 0
  const commentsShown = running ? shown : real ? Number.MAX_SAFE_INTEGER : 3
  const nextComment = running ? posts[cur].comments[commentsShown] : undefined
  // the real list is short: show each arrival once, never the same rover twice
  const visibleActivity = real ? Math.min(VISIBLE_ACTIVITY, activity.length) : VISIBLE_ACTIVITY
  const items = activity.length === 0 ? [] : Array.from({ length: visibleActivity }, (_, i) => {
    const n = (running ? tick : 0) - i
    const k = ((n % activity.length) + activity.length) % activity.length
    return { key: n, ...activity[k] }
  })

  return (
    <section ref={root} className="sc-live-board" aria-labelledby={head ? 'sc-live-t' : undefined} aria-label={head ? undefined : t.title}>
      {head && <header className="sc-section-head" data-reveal>
        <p className="sc-eyebrow">{t.eyebrow}</p>
        <h2 id="sc-live-t">{t.title}</h2>
        <p className="sc-section-lead">{t.lead}</p>
      </header>}
      <div className="sc-live-grid" data-reveal>
        <div className="sc-live-posts">
          {posts.map((p, i) => (
            <article key={p.author} className="sc-live-post" data-on={i === cur || undefined} aria-hidden={i === cur ? undefined : true} inert={i === cur ? undefined : true}>
              <div className="sc-post-head">
                <Portrait ficha={p.ficha} nome={p.name} tamanho={44} decorative />
                <p>
                  <strong>{p.name}</strong>
                  <span>@{p.author} · {p.note ?? t.note}</span>
                </p>
              </div>
              <p className="sc-live-text">{p.text}</p>
              {p.photo && <PhotoImage foto={p.photo} alt={p.photo.alt} className="sc-live-photo" late sizes="(min-width: 960px) 560px, 100vw" />}
              <p className="sc-live-count">
                <span className="sc-live-hearts" aria-hidden><span /><span /></span>
                <strong>{real ? p.base : i === cur ? <RollingNumber valor={p.base + (running ? extra : 21)} /> : p.base}</strong>
                <span>{t.reactions}</span>
                <span className="sc-live-sep" aria-hidden>·</span>
                <span>{p.total ?? p.comments.length} {t.comments}</span>
              </p>
              <ol className="sc-live-comments">
                {p.comments.map((c, j) => (
                  <li key={j} data-on={i !== cur || j < commentsShown || undefined}>
                    <Portrait ficha={c.ficha} nome={c.name} tamanho={32} decorative />
                    <p><strong>{c.name}</strong> {c.text}</p>
                  </li>
                ))}
              </ol>
              <div className="sc-live-typing" data-on={(i === cur && typing && nextComment) || undefined} aria-hidden>
                {nextComment && <Typing nome={nextComment.name} texto={t.typing} />}
              </div>
            </article>
          ))}
        </div>
        {items.length > 0 && <aside className="sc-live-activity" aria-labelledby="sc-live-act-t">
          <p className="sc-ticker-head" id="sc-live-act-t">
            <span className="sc-live-dot" aria-hidden />
            <span>{real ? t.arrivedTitle : t.activityTitle}</span>
          </p>
          <ul>
            {items.map((a, i) => (
              <li key={a.key} data-new={running && i === 0 ? '' : undefined}>
                <Portrait ficha={a.ficha} nome={a.name} tamanho={40} decorative />
                <p><strong>{a.name}</strong> {a.text}</p>
              </li>
            ))}
          </ul>
        </aside>}
      </div>
    </section>
  )
}
