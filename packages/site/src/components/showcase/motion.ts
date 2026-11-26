'use client'
// Motion helpers for the showcase. Durations and springs come from the --vida-* tokens (src/app/folgali-life.css) through
// src/components/life/movement.ts. With "reduce motion" on, nothing here moves: every hook returns the final state.
import { useEffect, useState, type RefObject } from 'react'
import { noMotion } from '@/components/life/movement'

/** Live value of `prefers-reduced-motion: reduce`. Starts as `true` on the server so the first paint is the still version. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(true)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduce(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduce
}

/** True while the element is on screen (or has been, with `once`). Without IntersectionObserver, always true. */
export function useInView(ref: RefObject<Element | null>, { threshold = 0.2, once = false }: { threshold?: number; once?: boolean } = {}): boolean {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver !== 'function') {
      const id = window.requestAnimationFrame(() => setSeen(true))
      return () => window.cancelAnimationFrame(id)
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setSeen(true)
        if (once) io.disconnect()
      } else if (!once) setSeen(false)
    }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, threshold, once])
  return seen
}

/**
 * Writes the scroll progress of each element into a CSS variable (`--p`, from 0 when its top reaches `start` of the viewport to 1
 * when its bottom reaches `end`), and marks the one in progress with `data-active`. One rAF per frame, no React re-render.
 */
export function trackScrollProgress(elements: HTMLElement[], { start = 0, end = 1, travel }: { start?: number; end?: number; travel?: number } = {}): () => void {
  if (noMotion()) {
    elements.forEach((el) => el.style.setProperty('--p', '1'))
    return () => {}
  }
  let frame = 0
  const measure = () => {
    frame = 0
    const vh = window.innerHeight
    for (const el of elements) {
      const r = el.getBoundingClientRect()
      // `travel`: progress runs over that fraction of the viewport (elements that do not pin); otherwise over the element's own height
      const span = travel ? vh * travel : Math.max(1, r.height - vh * (end - start))
      const p = Math.min(1, Math.max(0, (vh * start - r.top) / span))
      el.style.setProperty('--p', p.toFixed(4))
      if (r.top < vh * 0.6 && r.bottom > vh * 0.4) el.dataset.active = ''
      else delete el.dataset.active
    }
  }
  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
  measure()
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  return () => {
    window.cancelAnimationFrame(frame)
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  }
}
