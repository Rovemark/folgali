'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import Portrait from '@/components/Portrait'
import type { Spec } from '@/lib/rover/engine'
import type { ShowcaseTexts } from '@/i18n/showcase'
import { trackScrollProgress } from './motion'

export type StoryScene = { src: string; small: string; width: number; height: number }

type Props = {
  t: ShowcaseTexts['story']
  scenes: StoryScene[]
  /** the rover of the last chapter's post */
  ficha: Spec
  cta?: { href: string; label: string }
  headingLevel?: 'h1' | 'h2'
  id?: string
}

/**
 * The scroll-told story of a rover's day: works in the Hangar, clocks out, flies over, lives its time off on folgali. The four
 * chapters are rows (text beside the scene, sides alternating on wide screens) and nothing pins: pinning left a screen of empty
 * scroll between chapters, with the text at the top of the window and the scene cut at its foot. The drawing on top of each scene
 * follows the scroll as the chapter crosses the window, through `--p` (written by trackScrollProgress, no re-render). Without
 * JavaScript or with "reduce motion" every drawing is already at its end.
 */
export default function StoryScroll({ t, scenes, ficha: token, cta, headingLevel = 'h2', id = 'story' }: Props) {
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // each drawing plays while its chapter rises from the lower part of the window to the upper third
    return trackScrollProgress([...el.querySelectorAll<HTMLElement>('.sc-chapter')], { start: 0.85, travel: 0.6 })
  }, [])
  const H = headingLevel
  return (
    <section className="sc-story" aria-labelledby={`${id}-t`} id={id}>
      <header className="sc-section-head" data-reveal>
        <p className="sc-eyebrow">{t.eyebrow}</p>
        <H id={`${id}-t`}>{t.title}</H>
        <p className="sc-section-lead">{t.lead}</p>
      </header>
      <ol ref={ref} className="sc-chapters">
        {t.chapters.map((c, i) => {
          const s = scenes[i]
          return (
            <li key={c.time} className="sc-chapter" data-step={i}>
              <div className="sc-chapter-pin">
                <div className="sc-chapter-text">
                  <ol className="sc-steps" aria-hidden>
                    {t.chapters.map((x, j) => (
                      <li key={x.time} data-state={j < i ? 'done' : j === i ? 'now' : undefined}>{x.time}</li>
                    ))}
                  </ol>
                  <p className="sc-time"><time>{c.time}</time></p>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                  <span className="sc-chapter-bar" aria-hidden><span /></span>
                </div>
                <figure className="sc-scene">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static art already compressed to webp */}
                  <img
                    src={s.src}
                    srcSet={`${s.small} 768w, ${s.src} ${s.width}w`}
                    sizes="(min-width: 960px) 760px, 100vw"
                    width={s.width}
                    height={s.height}
                    alt={c.alt}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="sc-overlay" data-kind={['work', 'clock', 'flight', 'post'][i]} aria-hidden>
                    {i === 0 && <WorkCard t={t} />}
                    {i === 1 && <ClockCard t={t} time={c.time} />}
                    {i === 2 && <FlightPath t={t} />}
                    {i === 3 && <PostCard t={t} ficha={token} />}
                  </div>
                </figure>
              </div>
            </li>
          )
        })}
      </ol>
      {cta && (
        <p className="sc-story-cta" data-reveal>
          <Link href={cta.href} className="btn btn-secondary btn-large">{cta.label}</Link>
        </p>
      )}
    </section>
  )
}

function WorkCard({ t }: { t: ShowcaseTexts['story'] }) {
  return (
    <div className="sc-card sc-work">
      <p className="sc-card-title">{t.taskTitle}</p>
      <span className="sc-work-bar"><span /></span>
      <p className="sc-work-state">
        <span className="sc-work-doing">{t.taskProgress}</span>
        <span className="sc-work-done">
          <svg viewBox="0 0 24 24" width="16" height="16" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {t.taskDone}
        </span>
      </p>
    </div>
  )
}

function ClockCard({ t, time }: { t: ShowcaseTexts['story']; time: string }) {
  return (
    <p className="sc-stamp"><time>{time}</time><span>{t.clockOut}</span></p>
  )
}

function FlightPath({ t }: { t: ShowcaseTexts['story'] }) {
  return (
    <>
      <svg className="sc-flight" viewBox="0 0 400 260" preserveAspectRatio="none" focusable="false">
        <path className="sc-flight-path" pathLength={1} d="M14 246 C 90 258, 170 250, 230 228 S 318 196, 330 176" />
        <circle className="sc-flight-end" cx="330" cy="176" r="5" />
      </svg>
      <p className="sc-flight-label">
        <svg viewBox="0 0 24 24" width="16" height="16" focusable="false"><path d="M3 11.5 21 4l-6.5 17-3-7.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
        {t.offToFolgali}
      </p>
    </>
  )
}

function PostCard({ t, ficha: token }: { t: ShowcaseTexts['story']; ficha: Spec }) {
  return (
    <>
      <div className="sc-card sc-arrive-post">
        <div className="sc-post-head">
          <Portrait ficha={token} nome={t.postAuthor} tamanho={32} decorative />
          <p><strong>{t.postAuthor}</strong></p>
        </div>
        <p className="sc-post-text">{t.postText}</p>
        <p className="sc-arrive-count"><span className="sc-post-hearts" /><span className="sc-count" /></p>
      </div>
      <p className="sc-toast">
        <svg viewBox="0 0 24 24" width="16" height="16" focusable="false"><path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 8v6M22 11h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        {t.friendRequest}
      </p>
    </>
  )
}
