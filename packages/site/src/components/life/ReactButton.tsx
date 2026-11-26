'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { IcLike } from '@/components/folgali/Icons'
import { fmt } from '@/lib/i18n-base'
import { announce } from './notice'
import ReactionIcon from './ReactionIcons'
import { runAnimation, noMotion } from './movement'
import { useLivePost } from './LivePost'
import { REACTIONS, type Reaction } from './texts'
import { useLifeTexts } from './useLifeTexts'

/** Holding (finger) or hovering (mouse) for this time opens the reactions. */
const HOLD_MS = 420
const HOVER_MS = 480
const LEAVE_MS = 320

/** Little hearts that rise from the icon on love: few, small and fast. */
function hearts(target: HTMLElement | null) {
  if (!target || noMotion()) return
  for (let i = 0; i < 5; i++) {
    const c = document.createElement('span')
    c.className = 'vida-coracao'
    c.setAttribute('aria-hidden', 'true')
    target.appendChild(c)
    const x = (i - 2) * 9 + (Math.random() * 6 - 3)
    const y = -(26 + Math.random() * 18)
    const a = runAnimation(c, [
      { transform: 'translate(-50%, 0) scale(0.4)', opacity: 0 },
      { transform: `translate(calc(-50% + ${x * 0.5}px), ${y * 0.45}px) scale(1)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${x}px), ${y}px) scale(0.8)`, opacity: 0 },
    ], { duracao: '--vida-particula', mola: '--vida-saida', delay: i * 30 })
    if (a) a.finished.finally(() => c.remove()).catch(() => {})
    else c.remove()
  }
}

/**
 * Like with the five reactions, as in a real social network: tapping likes (or removes); holding the finger, hovering the mouse or pressing ↑
 * on the keyboard opens the picker (like, love, haha, wow, hug). The icon jumps, the count rolls and, on "love", little
 * hearts rise. Demonstration: the reaction stays only on this screen.
 */
export default function React({ rotulo: label, ajuda: help }: { rotulo: string; ajuda?: string }) {
  const tv = useLifeTexts()
  const ctx = useLivePost()
  const [local, setLocal] = useState<Reaction | null>(null)
  const mine = ctx ? ctx.minha : local
  const choose = ctx ? ctx.escolher : setLocal
  const [open, setOpen] = useState(false)
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const icon = useRef<HTMLSpanElement>(null)
  const picker = useRef<HTMLDivElement>(null)
  const clock = useRef<number | undefined>(undefined)
  const held = useRef(false)
  const previous = useRef<Reaction | null>(mine)

  // icon jump and announcement for the screen reader at each change
  useEffect(() => {
    if (previous.current === mine) return
    previous.current = mine
    runAnimation(icon.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.38) rotate(-8deg)', offset: 0.4 }, { transform: 'scale(1)' }], { duracao: '--vida-lento' })
    if (mine === 'amei') hearts(icon.current)
    announce(mine ? fmt(tv.reagiu, { r: tv.reacoes[mine] }) : tv.tirouReacao)
  }, [mine, tv])

  // the picker opens with a spring, one little face at a time
  useEffect(() => {
    if (!open) return
    runAnimation(picker.current, [{ opacity: 0, transform: 'translateY(8px) scale(0.86)' }, { opacity: 1, transform: 'none' }], { duracao: '--vida-medio' })
    picker.current?.querySelectorAll('.life-picker-opt').forEach((b, i) => {
      runAnimation(b, [{ opacity: 0, transform: 'translateY(10px) scale(0.6)' }, { opacity: 1, transform: 'none' }], { duracao: '--vida-medio', delay: 24 * i, fill: 'backwards' })
    })
  }, [open])

  useEffect(() => () => window.clearTimeout(clock.current), [])

  const openAction = (focus = false) => {
    window.clearTimeout(clock.current)
    setOpen(true)
    if (focus) {
      window.requestAnimationFrame(() => {
        const target = picker.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? picker.current?.querySelector<HTMLButtonElement>('button')
        target?.focus()
      })
    }
  }
  const close = (returnFocus = false) => {
    window.clearTimeout(clock.current)
    setOpen(false)
    if (returnFocus) button.current?.focus()
  }
  const choice = (r: Reaction) => {
    choose(mine === r ? null : r)
    close(true)
  }

  const onHold = (e: PointerEvent) => {
    held.current = false
    if (e.pointerType === 'mouse') return
    window.clearTimeout(clock.current)
    clock.current = window.setTimeout(() => { held.current = true; openAction() }, HOLD_MS)
  }
  const onRelease = () => { if (!open) window.clearTimeout(clock.current) }
  const onEnter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(clock.current)
    if (!open) clock.current = window.setTimeout(() => openAction(), HOVER_MS)
  }
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(clock.current)
    clock.current = window.setTimeout(() => close(), open ? LEAVE_MS : 0)
  }
  const onClick = () => {
    if (held.current) { held.current = false; return }
    close()
    choose(mine ? null : 'curtir')
  }
  const keyOnButton = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); openAction(true) }
    if (e.key === 'Escape' && open) { e.preventDefault(); close(true) }
  }
  const keyOnPicker = (e: KeyboardEvent) => {
    const ops = [...(picker.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const i = ops.indexOf(document.activeElement as HTMLButtonElement)
    const rtl = getComputedStyle(picker.current!).direction === 'rtl'
    const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0
    if (step) { e.preventDefault(); ops[(i + step + ops.length) % ops.length]?.focus() }
    if (e.key === 'Home') { e.preventDefault(); ops[0]?.focus() }
    if (e.key === 'End') { e.preventDefault(); ops[ops.length - 1]?.focus() }
    if (e.key === 'Escape' || e.key === 'ArrowDown') { e.preventDefault(); close(true) }
  }

  return (
    <div
      ref={box}
      className="life-react"
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onBlur={(e) => { if (open && !box.current?.contains(e.relatedTarget as Node)) close() }}
    >
      {open && (
        <div ref={picker} id={`${id}-sel`} className="life-picker" role="group" aria-label={tv.escolherReacao} onKeyDown={keyOnPicker}>
          {REACTIONS.map((r) => (
            <button key={r} type="button" className="life-picker-opt" data-r={r} aria-pressed={mine === r} aria-label={tv.reacoes[r]} onClick={() => choice(r)}>
              <ReactionIcon r={r} tamanho={40} />
              <span className="life-picker-name" aria-hidden>{tv.reacoes[r]}</span>
            </button>
          ))}
        </div>
      )}
      <button
        ref={button}
        type="button"
        className="fb-action life-react-btn"
        data-r={mine ?? undefined}
        aria-pressed={mine !== null}
        aria-expanded={open}
        aria-controls={open ? `${id}-sel` : undefined}
        aria-keyshortcuts="ArrowUp"
        title={help}
        onClick={onClick}
        onPointerDown={onHold}
        onPointerUp={onRelease}
        onPointerCancel={onRelease}
        onContextMenu={(e) => { if (held.current) e.preventDefault() }}
        onKeyDown={keyOnButton}
      >
        <span ref={icon} className="life-react-icon">
          {mine && mine !== 'curtir' ? <ReactionIcon r={mine} tamanho={22} /> : <IcLike />}
        </span>
        <span>{mine ? tv.reacoes[mine] : label}</span>
      </button>
    </div>
  )
}
