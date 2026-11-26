'use client'

import { useEffect, useRef, useState } from 'react'
import { NOTICE_EVENT, type NoticeDetail } from './notice'
import { runAnimation, noMotion } from './movement'
import { useLifeTexts } from './useLifeTexts'

/** How long the notice stays on screen. */
const NOTICE_TIME = 3200

/** The ripple of the main button: born where the finger touched and fades. */
function wave(e: PointerEvent) {
  if (e.button !== 0 || noMotion()) return
  const btn = (e.target as Element | null)?.closest?.('.btn-primary') as HTMLElement | null
  if (!btn || btn.matches(':disabled, [aria-disabled="true"]')) return
  const r = btn.getBoundingClientRect()
  const side = Math.max(r.width, r.height) * 2
  const s = document.createElement('span')
  s.className = 'vida-onda'
  s.setAttribute('aria-hidden', 'true')
  s.style.width = s.style.height = `${side}px`
  s.style.left = `${e.clientX - r.left - side / 2}px`
  s.style.top = `${e.clientY - r.top - side / 2}px`
  btn.appendChild(s)
  const a = runAnimation(s, [{ transform: 'scale(0)', opacity: 0.32 }, { transform: 'scale(1)', opacity: 0 }], { duracao: '--vida-lento', mola: '--vida-saida' })
  if (a) a.finished.finally(() => s.remove())
  else s.remove()
}

/**
 * A photo that has not arrived yet enters with a short fade when it arrives (one that already arrived does not change: no delaying the first paint).
 * Without touching any attribute of the image (React may still be hydrating): only an animation at the moment of `load`.
 */
const seenPhotos = new WeakSet<HTMLImageElement>()
function preparePhotos(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>('img.photo').forEach((img) => {
    if (seenPhotos.has(img)) return
    seenPhotos.add(img)
    if (img.complete) return
    img.addEventListener('load', () => runAnimation(img, [{ opacity: 0 }, { opacity: 1 }], { duracao: '--vida-lento', mola: '--vida-saida' }), { once: true })
  })
}

/** What only animates when it reaches the screen (the timeline of the day, the mood chart): the CSS waits for `data-vida-visto`. */
const ON_VIEW = '.mood, .mr-row'
function watchOnView(): { look: (root: ParentNode) => void; parar: () => void } {
  // the <head> already marked data-vida before the paint; without motion or without IntersectionObserver, it removes the mark and shows everything ready
  if (noMotion() || typeof IntersectionObserver !== 'function') {
    delete document.documentElement.dataset.life
    return { look: () => {}, parar: () => {} }
  }
  // 'ativo' (active): the JavaScript arrived and will mark; the CSS safety net (which reveals everything on its own) stops applying
  document.documentElement.dataset.life = 'ativo'
  // it only marks after React hydrated the element (marking before becomes a hydration warning); gives up waiting after 3 s
  const mark = (el: HTMLElement, attempts = 30) => {
    if (attempts > 0 && !Object.keys(el).some((k) => k.startsWith('__reactFiber'))) {
      window.setTimeout(() => mark(el, attempts - 1), 100)
      return
    }
    el.dataset.lifeSeen = '1'
  }
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue
      mark(e.target as HTMLElement)
      io.unobserve(e.target)
    }
  }, { threshold: 0.25 })
  const look = (root: ParentNode) => {
    if (root instanceof Element && root.matches(ON_VIEW)) io.observe(root)
    root.querySelectorAll(ON_VIEW).forEach((el) => io.observe(el))
  }
  return { look, parar: () => { io.disconnect(); delete document.documentElement.dataset.life } }
}

/** The bell swings and the number jumps when a new notice arrives (and once on arrival, if a notice was already waiting). */
function watchBells(): () => void {
  const bells = [...document.querySelectorAll<HTMLAnchorElement>('a[href$="/avisos"]')]
  const value = (a: Element) => parseInt(a.querySelector('.badge-num')?.textContent ?? '0', 10) || 0
  const before = new Map(bells.map((a) => [a, value(a)]))
  const swing = (a: Element) => {
    runAnimation(a.querySelector('svg'), [{ rotate: '0deg' }, { rotate: '16deg' }, { rotate: '-13deg' }, { rotate: '8deg' }, { rotate: '-4deg' }, { rotate: '0deg' }], { duracao: '--vida-sino', mola: '--vida-suave' })
    runAnimation(a.querySelector('.badge-num'), [{ scale: '0.4' }, { scale: '1' }], { duracao: '--vida-medio' })
  }
  const home = window.setTimeout(() => bells.forEach((a) => { if (value(a) > 0 && a.getClientRects().length) swing(a) }), 700)
  const obs = new MutationObserver(() => {
    for (const a of bells) {
      const v = value(a)
      if (v > (before.get(a) ?? 0) && a.getClientRects().length) swing(a)
      before.set(a, v)
    }
  })
  bells.forEach((a) => obs.observe(a, { childList: true, subtree: true, characterData: true }))
  return () => {
    window.clearTimeout(home)
    obs.disconnect()
  }
}

/**
 * What brings the whole site to life and only needs to exist once: the action notice ("toast") with the live region for the screen reader,
 * the ripple of the main button, the fade of photos that arrive later and the swinging bell. Mounted in the layout.
 */
export default function GlobalLife() {
  const tv = useLifeTexts()
  const [notice, setNotice] = useState<{ id: number; texto: string } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const clock = useRef<number | undefined>(undefined)

  useEffect(() => {
    const listen = (e: Event) => {
      const { texto: text, visible } = (e as CustomEvent<NoticeDetail>).detail
      if (!visible) {
        // changing the text (even to the same one) makes the screen reader read it again
        setAnnouncement('')
        window.requestAnimationFrame(() => setAnnouncement(text))
        return
      }
      window.clearTimeout(clock.current)
      setNotice({ id: Date.now(), texto: text })
      clock.current = window.setTimeout(() => setNotice(null), NOTICE_TIME)
    }
    window.addEventListener(NOTICE_EVENT, listen)
    return () => window.removeEventListener(NOTICE_EVENT, listen)
  }, [])

  useEffect(() => {
    if (notice) runAnimation(box.current, [{ opacity: 0, transform: 'translateY(16px) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duracao: '--vida-lento' })
  }, [notice])

  useEffect(() => {
    document.addEventListener('pointerdown', wave)
    preparePhotos(document)
    const onView = watchOnView()
    onView.look(document)
    const obs = new MutationObserver((ms) => {
      for (const m of ms) m.addedNodes.forEach((n) => { if (n.nodeType === 1) { preparePhotos(n as Element); onView.look(n as Element) } })
    })
    obs.observe(document.body, { childList: true, subtree: true })
    const stopBells = watchBells()
    return () => {
      document.removeEventListener('pointerdown', wave)
      obs.disconnect()
      onView.parar()
      stopBells()
    }
  }, [])

  return (
    <>
      <div className="life-notices" role="status" aria-live="polite">
        {notice && (
          <div className="life-notice" ref={box} key={notice.id}>
            <span className="life-notice-dot" aria-hidden />
            <span>{notice.texto}</span>
            <button type="button" className="life-notice-close" onClick={() => setNotice(null)} aria-label={tv.fechar}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        )}
      </div>
      <div className="reader-only" aria-live="polite">{announcement}</div>
    </>
  )
}
