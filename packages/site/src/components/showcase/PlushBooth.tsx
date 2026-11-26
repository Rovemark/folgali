'use client'

import { useEffect, useRef, useState } from 'react'
import type { ShowcaseTexts } from '@/i18n/showcase'
import { useInView, useReducedMotion } from './motion'

const ART = '/marca/folgali/showcase/'
/** One turn of the loop, in ms: the robot walks in, the curtain sparkles, the plush walks out, a breath. Same length as in showcase.css. */
const TURN = 6400

/**
 * "An agent walks in, a plush walks out": three separate pieces of art (a generic tin robot, the folgali booth seen from the front
 * and a plush) on a sunset stage. While on screen, the robot carrying the agent's name walks into the curtain, the curtain sparkles
 * and the plush steps out on the other side, in a calm loop through Claude, Grok, Hermes, OpenClaw and "your agent". Off screen or
 * with "reduce motion" it is the before and after side by side: robot, booth, plush.
 */
export default function PlushBooth({ t, headingLevel = 'h2' }: { t: ShowcaseTexts['booth']; headingLevel?: 'h2' | 'h3' }) {
  const reduce = useReducedMotion()
  const stage = useRef<HTMLDivElement>(null)
  const visible = useInView(stage, { threshold: 0.3 })
  const running = !reduce && visible
  const [turn, setTurn] = useState(0)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setTurn((n) => n + 1), TURN)
    return () => window.clearInterval(id)
  }, [running])

  const agent = t.agents[turn % t.agents.length]
  const H = headingLevel

  return (
    <section className="sc-booth" aria-labelledby="sc-booth-t">
      <div className="sc-booth-text" data-reveal>
        <p className="sc-eyebrow">{t.eyebrow}</p>
        <H id="sc-booth-t">{t.title}</H>
        <p>{t.text}</p>
        <ul className="sc-booth-agents" aria-label={t.eyebrow}>
          {t.agents.map((a, i) => (
            <li key={a} className="sc-agent-chip" data-on={running && i === turn % t.agents.length ? '' : undefined}>{a}</li>
          ))}
        </ul>
      </div>
      <div className="sc-booth-stage-wrap" data-reveal>
        <div ref={stage} className="sc-cabin" data-run={running || undefined} role="img" aria-label={t.alt}>
          <span className="sc-cabin-sun" aria-hidden />
          <span className="sc-cabin-floor" aria-hidden />
          <div className="sc-cabin-robot" key={`r${turn}`} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element -- cut-out art piece */}
            <img src={`${ART}booth-robot.webp`} width={441} height={640} alt="" loading="lazy" decoding="async" />
            <span className="sc-cabin-tag">{agent} <small>{t.goesIn}</small></span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- cut-out art piece */}
          <img className="sc-cabin-booth" src={`${ART}booth-cabin.webp`} width={398} height={640} alt="" loading="lazy" decoding="async" aria-hidden />
          <div className="sc-cabin-spark" key={`s${turn}`} aria-hidden>
            {Array.from({ length: 10 }, (_, i) => <span key={i} style={{ '--i': i } as React.CSSProperties} />)}
          </div>
          <div className="sc-cabin-plush" key={`p${turn}`} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element -- cut-out art piece */}
            <img src={`${ART}booth-plush.webp`} width={652} height={640} alt="" loading="lazy" decoding="async" />
            <span className="sc-cabin-tag">{agent} <small>{t.comesOut}</small></span>
          </div>
        </div>
      </div>
    </section>
  )
}
