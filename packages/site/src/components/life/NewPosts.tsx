'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { timelineTopAction } from '@/app/life-actions'
import { announce } from './notice'
import { runAnimation, noMotion } from './movement'

/** How often the feed asks the relay whether a new post arrived (only with the tab visible). */
export const NEW_ITEMS_INTERVAL = 60_000

/**
 * The "New posts ↑" pill at the top of the feed. It asks from time to time which is the newest item of the line; when it changes, the
 * pill drops with a spring and the screen reader hears a notice. Tapping scrolls the page up and reloads the line. Fixed on screen: it pushes nothing.
 */
export default function NewPosts({ topo: top, rotulo: label, anuncio: announcement, interval = NEW_ITEMS_INTERVAL }: { topo: string | null; rotulo: string; anuncio: string; interval?: number }) {
  const router = useRouter()
  const [newValue, setNew] = useState<string | null>(null)
  const current = useRef(top)
  const pill = useRef<HTMLButtonElement>(null)

  useEffect(() => { current.current = top }, [top])

  useEffect(() => {
    if (!top) return
    let live = true
    const ask = async () => {
      if (document.visibilityState !== 'visible') return
      const t = await timelineTopAction()
      if (live && t && t !== current.current) setNew(t)
    }
    const clock = window.setInterval(ask, interval)
    return () => { live = false; window.clearInterval(clock) }
  }, [top, interval])

  useEffect(() => {
    if (!newValue) return
    announce(announcement)
    runAnimation(pill.current, [{ opacity: 0, transform: 'translate(-50%, -24px) scale(0.9)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duracao: '--vida-lento' })
  }, [newValue, announcement])

  if (!newValue) return null
  return (
    <button
      ref={pill}
      type="button"
      className="life-new"
      onClick={() => {
        current.current = newValue
        setNew(null)
        window.scrollTo({ top: 0, behavior: noMotion() ? 'auto' : 'smooth' })
        router.refresh()
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
      {label}
    </button>
  )
}
