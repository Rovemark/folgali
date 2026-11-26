'use client'

import { usePathname } from 'next/navigation'
import { useLayoutEffect, useRef } from 'react'

/**
 * The stroke of the active tab that slides from one item to the other (top bar and bottom bar on the phone). It measures the item marked with
 * `aria-current="page"` inside the parent and moves with transform, without touching the layout. While it has not measured, the old stroke of each
 * item (CSS) still applies; with no active item, the stroke disappears.
 */
export default function Indicator({ itens: items, largura: width }: { itens: string; largura?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const pathname = usePathname()

  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.parentElement
    if (!el || !parent) return
    const measure = (target?: HTMLElement) => {
      const active = target ?? parent.querySelector<HTMLElement>(`${items}[aria-current="page"]`)
      if (!active || !active.offsetWidth) {
        el.dataset.oculto = '1'
        return
      }
      const w = width ?? active.offsetWidth
      const x = active.offsetLeft + (active.offsetWidth - w) / 2
      el.style.setProperty('--vida-x', `${x}px`)
      el.style.setProperty('--vida-w', `${w}px`)
      delete el.dataset.oculto
      if (!el.dataset.pronto) {
        // the first position enters without sliding; from then on, it slides
        window.requestAnimationFrame(() => { el.dataset.pronto = '1' })
      }
    }
    measure()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null
    ro?.observe(parent)
    // the stroke leaves right at the touch, without waiting for the new page to arrive (when it arrives, the measurement confirms)
    const play = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = (e.target as Element | null)?.closest?.(items) as HTMLElement | null
      if (target && parent.contains(target)) measure(target)
    }
    parent.addEventListener('click', play)
    return () => { ro?.disconnect(); parent.removeEventListener('click', play) }
  }, [pathname, items, width])

  return <span ref={ref} className="life-indicator" aria-hidden data-oculto="1" />
}
