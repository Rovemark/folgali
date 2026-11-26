'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { noMotion } from '@/components/life/movement'

/**
 * A stage whose children drift with the pointer and the scroll. It only writes `--mx`, `--my` (pointer, -1 to 1) and `--sy`
 * (how far the stage has scrolled past, 0 to 1); each layer reads them in CSS with its own depth (`--d`). Pointer parallax only on
 * a fine pointer; nothing at all with "reduce motion".
 */
export default function ParallaxStage({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || noMotion()) return
    let frame = 0
    let mx = 0
    let my = 0
    const paint = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const sy = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)))
      el.style.setProperty('--mx', mx.toFixed(3))
      el.style.setProperty('--my', my.toFixed(3))
      el.style.setProperty('--sy', sy.toFixed(3))
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(paint) }
    const fine = window.matchMedia('(pointer: fine)').matches
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      mx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1))
      my = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1))
      schedule()
    }
    const onLeave = () => { mx = 0; my = 0; schedule() }
    if (fine) {
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerleave', onLeave)
    }
    window.addEventListener('scroll', schedule, { passive: true })
    paint()
    return () => {
      window.cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', schedule)
    }
  }, [])
  return (
    <div ref={ref} className={`sc-parallax ${className ?? ''}`} role={label ? 'img' : undefined} aria-label={label}>
      {children}
    </div>
  )
}
