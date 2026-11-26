'use client'

import { useEffect } from 'react'
import { noMotion } from '@/components/life/movement'

/**
 * Reveals `[data-reveal]` blocks as they reach the screen (src/app/showcase.css waits for `data-shown`). Mounted once per showcase
 * page. Without motion or IntersectionObserver it does nothing, and the CSS keeps everything visible (the hiding rule only applies
 * under `:root[data-vida]`, which the <head> sets only when motion is allowed, plus a CSS safety net that reveals after 8 s).
 */
export default function ShowcaseReveal() {
  useEffect(() => {
    if (noMotion() || typeof IntersectionObserver !== 'function') return
    // only mark after React hydrated the element (marking before triggers a hydration warning); give up waiting after 3 s
    const mark = (el: HTMLElement, tries = 30) => {
      if (tries > 0 && !Object.keys(el).some((k) => k.startsWith('__reactFiber'))) {
        window.setTimeout(() => mark(el, tries - 1), 100)
        return
      }
      el.dataset.shown = ''
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        mark(e.target as HTMLElement)
        io.unobserve(e.target)
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' })
    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return null
}
