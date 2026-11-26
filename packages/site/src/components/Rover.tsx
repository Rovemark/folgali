/* eslint-disable @next/next/no-img-element -- the accessory images are layers of a drawing on canvas */
// Adapted from the Rover component of the Rover Hangar site (Rovemark code). Animates the whole plush rover.
// The art in /marca/pecas is not licensed under the AGPL: see public/marca/LEIA-ME.md.
'use client'

import { useEffect, useId, useRef } from 'react'
import { ACCESSORIES, H, signBytes, image, getBody, getParts, neck, pose, faceSVG, type State, type Spec, type Measure } from '@/lib/rover/engine'

import { withoutHelmet } from '@/lib/folgali/plush'

const BASE = '/marca/pecas/'

type Props = {
  ficha: Spec
  estado?: State
  /** height of the rover on screen, in px */
  altura?: number
  /** phase delay, so identical rovers do not move together */
  phase?: number
  /** freezes the animation at one instant (checking photos) */
  t?: number
  sombra?: boolean
  className?: string
  rotulo?: string
  /** maximum width of the rover; wide bodies shrink to fit */
  maxWidth?: number
}

export default function Rover({ ficha: original, estado: state = 'parado', altura: height = 220, phase = 0, t, sombra: shadow = true, className, rotulo: label, maxWidth }: Props) {
  const token = withoutHelmet(original)
  const root = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const torso = useRef<HTMLCanvasElement>(null)
  const armL = useRef<HTMLDivElement>(null)
  const armR = useRef<HTMLDivElement>(null)
  const face = useRef<SVGGElement>(null)
  const shadowEl = useRef<HTMLDivElement>(null)
  const stateRef = useRef<State>(state)
  const specRef = useRef<Spec>(token)
  const measure = useRef<Measure | null>(null)
  const uid = useId().replace(/:/g, '')
  const ids = { eye: `o${uid}`, boch: `b${uid}` }
  const E0 = height / H

  stateRef.current = state
  specRef.current = token
  const key = `${token.corpo}|${token.cor}|${(token.acessorios || []).join(',')}|${token.olhos}|${token.boca}`

  // builds (body, color, accessories) when the sheet changes
  useEffect(() => {
    let live = true
    ;(async () => {
      const { m } = await getBody(BASE, token.corpo)
      const parts = await getParts(BASE, token.corpo, token.cor)
      if (!live || !root.current) return
      measure.current = m
      const E = maxWidth ? Math.min(E0, maxWidth / m.W) : E0
      const px = (v: number) => `${v * E}px`
      Object.assign(body.current!.style, { width: px(m.W), height: px(H) })
      root.current.style.setProperty('--pele', token.cor)
      // trunk
      const ct = torso.current!
      ct.width = m.W; ct.height = H; ct.getContext('2d')!.drawImage(parts.torso, 0, 0)
      // arms: canvas inside a holder that turns at the shoulder
      for (const [support, cv, shoulder] of [[armL.current!, parts.armL, m.shoulderL], [armR.current!, parts.armR, m.shoulderR]] as const) {
        const c = support.querySelector('canvas')!
        c.width = m.W; c.height = H; const x = c.getContext('2d')!; x.clearRect(0, 0, m.W, H); x.drawImage(cv, 0, 0)
        Object.assign(support.style, { width: px(m.W), height: px(H), transformOrigin: `${px(shoulder.x)} ${px(shoulder.y)}` })
      }
      const svg = root.current.querySelector('svg')!
      svg.setAttribute('viewBox', `0 0 ${m.W} ${H}`)
      // accessories
      const slots = root.current.querySelectorAll<HTMLElement>('[data-slot]')
      slots.forEach((s) => (s.style.display = 'none'))
      const slot = (n: string) => root.current!.querySelector<HTMLElement>(`[data-slot="${n}"]`)!
      for (const id of token.acessorios || []) {
        const a = ACCESSORIES[id]; if (!a) continue
        const img = await image(`${BASE}acc-${id}.webp`); if (!live) return
        const asp = img.height / img.width
        if (a.fit === 'pescoco' && a.crop) {
          const cv = await neck(BASE, token.corpo, id, m, img); if (!live) return
          const el = slot('pescoco') as HTMLCanvasElement
          el.width = m.W; el.height = H; const x = el.getContext('2d')!; x.clearRect(0, 0, m.W, H); x.drawImage(cv, 0, 0)
          Object.assign(el.style, { display: 'block', width: px(m.W), height: px(H) })
          continue
        }
        let el: HTMLImageElement, w = 0, left = 0, top = 0
        if (a.fit === 'cabeca' && a.anchor === 'rosto') { el = slot('cabeca') as HTMLImageElement; w = m.largura(m.faceY - (m.faceY - m.topo) * 0.2) * a.width; left = m.cx - w / 2; top = m.faceY - w * asp * 0.78 }
        else if (a.fit === 'cabeca') {
          el = slot('cabeca') as HTMLImageElement; w = m.largura(m.headY) * a.width; left = m.cx - w / 2 + (a.dx || 0) * m.largura(m.headY); top = m.topo + (a.topo || 0) * w * asp
          // lock: the brim never goes down over the eyes
          const limit = m.faceY - Math.max(14, m.largura(m.faceY) * 0.055) * 1.7
          if (top + w * asp * 0.94 > limit) top = limit - w * asp * 0.94
        }
        else if (a.fit === 'olhos') { el = slot('olhos') as HTMLImageElement; w = m.largura(m.faceY) * 0.62 * a.width; left = m.cx - w / 2; top = m.faceY - (w * asp) / 2 }
        else if (a.fit === 'costas') { el = slot('costas') as HTMLImageElement; w = m.largura(m.axila) * a.width; left = m.cx - w / 2; top = m.axila - w * asp * 0.55 }
        else if (a.fit === 'mao') { el = slot('mao') as HTMLImageElement; w = m.largura(m.axila) * a.width; left = m.mao.x - w * 0.45; top = m.mao.y - w * asp * 0.5 }
        else { el = slot('gravata') as HTMLImageElement; w = m.largura(m.neckY) * a.width; left = m.cx - w / 2; top = m.neckY - w * asp * 0.1 }
        el.src = img.src
        Object.assign(el.style, { display: 'block', width: px(w), left: px(left), top: px(top) })
      }
      root.current.dataset.pronto = '1'
      draw(t != null ? t : performance.now() / 1000 + phase)
    })().catch((err) => {
      const w = window as unknown as { __errors?: string[] }
      ;(w.__errors ||= []).push(`rover ${token.corpo}: ${err?.message || err}`)
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, height, maxWidth])

  const nextBlink = useRef(1.5 + ((phase * 7.31) % 2))
  function draw(tt: number) {
    const m = measure.current
    if (!m || !body.current) return
    const e = stateRef.current, p = pose(e, tt)
    let blink = 0
    if (e !== 'dormir' && e !== 'feliz' && tt > nextBlink.current) {
      const q = (tt - nextBlink.current) / 0.18
      blink = q < 1 ? Math.sin(q * Math.PI) : 0
      if (q >= 1 && t == null) nextBlink.current = tt + 2.2 + ((tt * 13.7) % 2.8)
    }
    const k = height / 260 // jumps proportional to the size
    body.current.style.transform = `translateY(${p.ty * k}px) rotate(${p.rot}deg) scale(${p.sx}, ${p.sy})`
    armL.current!.style.transform = `rotate(${p.aE}deg)`
    armR.current!.style.transform = `rotate(${p.aD}deg)`
    if (shadowEl.current) { const al = Math.min(1, -p.ty / 46); shadowEl.current.style.transform = `translateX(-50%) scale(${1 - al * 0.35})`; shadowEl.current.style.opacity = String(1 - al * 0.5) }
    if (face.current) face.current.innerHTML = faceSVG(m, specRef.current, e, { blink, falar: p.falar, look: p.look }, ids)
  }

  // animates only when it appears on screen
  useEffect(() => {
    if (t != null) { draw(t); return }
    const el = root.current!
    let stop: (() => void) | null = null
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !stop) stop = signBytes((now) => draw(now / 1000 + phase))
      else if (!en.isIntersecting && stop) { stop(); stop = null }
    }, { rootMargin: '120px' })
    io.observe(el)
    return () => { io.disconnect(); stop?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, phase, height])

  useEffect(() => { if (t != null) draw(t) })

  return (
    <div ref={root} className={`rover ${className || ''}`} style={{ height: height }} role="img" aria-label={label || 'rover de pelúcia'}>
      <div ref={body} className="rv-body">
        <img data-slot="costas" className="rv-back" alt="" />
        <canvas ref={torso} className="rv-layer" />
        <canvas data-slot="pescoco" className="rv-layer rv-neck" />
        <svg className="rv-face">
          <defs>
            <radialGradient id={ids.eye} cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#4a4a52" /><stop offset=".45" stopColor="#151519" /><stop offset="1" stopColor="#050507" /></radialGradient>
            <radialGradient id={ids.boch} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ff8c9f" stopOpacity=".55" /><stop offset="1" stopColor="#ff8c9f" stopOpacity="0" /></radialGradient>
          </defs>
          <g ref={face} />
        </svg>
        <img data-slot="gravata" className="rv-acc" alt="" />
        <img data-slot="olhos" className="rv-acc" alt="" />
        <img data-slot="cabeca" className="rv-acc" alt="" />
        <div ref={armL} className="rv-arm"><canvas /></div>
        <div ref={armR} className="rv-arm"><canvas /><img data-slot="mao" className="rv-acc" alt="" /></div>
      </div>
      {shadow && <div ref={shadowEl} className="rv-shadow" />}
    </div>
  )
}
