/* eslint-disable @next/next/no-img-element -- as imagens dos acessórios são camadas de um desenho em canvas */
// Adaptado do componente Rover do site do Rover Hangar (código da Rovemark). Anima o rover de pelúcia inteiro.
// A arte em /marca/pecas não está licenciada sob a AGPL: veja public/marca/LEIA-ME.md.
'use client'

import { useEffect, useId, useRef } from 'react'
import { ACESSORIOS, H, assinar, imagem, obterCorpo, obterPartes, pescoco, pose, rostoSVG, type Estado, type Ficha, type Medida } from '@/lib/rover/motor'

import { semCapacete } from '@/lib/folgali/pelucia'

const BASE = '/marca/pecas/'

type Props = {
  ficha: Ficha
  estado?: Estado
  /** altura do rover na tela, em px */
  altura?: number
  /** atraso de fase, para rovers iguais não se mexerem juntos */
  fase?: number
  /** congela a animação num instante (fotos de conferência) */
  t?: number
  sombra?: boolean
  className?: string
  rotulo?: string
  /** largura máxima do rover; corpos largos encolhem para caber */
  larguraMax?: number
}

export default function Rover({ ficha: original, estado = 'parado', altura = 220, fase = 0, t, sombra = true, className, rotulo, larguraMax }: Props) {
  const ficha = semCapacete(original)
  const raiz = useRef<HTMLDivElement>(null)
  const corpo = useRef<HTMLDivElement>(null)
  const tronco = useRef<HTMLCanvasElement>(null)
  const bracoE = useRef<HTMLDivElement>(null)
  const bracoD = useRef<HTMLDivElement>(null)
  const face = useRef<SVGGElement>(null)
  const sombraEl = useRef<HTMLDivElement>(null)
  const estadoRef = useRef<Estado>(estado)
  const fichaRef = useRef<Ficha>(ficha)
  const medida = useRef<Medida | null>(null)
  const uid = useId().replace(/:/g, '')
  const ids = { olho: `o${uid}`, boch: `b${uid}` }
  const E0 = altura / H

  estadoRef.current = estado
  fichaRef.current = ficha
  const chave = `${ficha.corpo}|${ficha.cor}|${(ficha.acessorios || []).join(',')}|${ficha.olhos}|${ficha.boca}`

  // monta (corpo, cor, acessórios) quando a ficha muda
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { m } = await obterCorpo(BASE, ficha.corpo)
      const partes = await obterPartes(BASE, ficha.corpo, ficha.cor)
      if (!vivo || !raiz.current) return
      medida.current = m
      const E = larguraMax ? Math.min(E0, larguraMax / m.W) : E0
      const px = (v: number) => `${v * E}px`
      Object.assign(corpo.current!.style, { width: px(m.W), height: px(H) })
      raiz.current.style.setProperty('--pele', ficha.cor)
      // tronco
      const ct = tronco.current!
      ct.width = m.W; ct.height = H; ct.getContext('2d')!.drawImage(partes.tronco, 0, 0)
      // braços: canvas dentro de um suporte que gira no ombro
      for (const [suporte, cv, ombro] of [[bracoE.current!, partes.bracoE, m.ombroE], [bracoD.current!, partes.bracoD, m.ombroD]] as const) {
        const c = suporte.querySelector('canvas')!
        c.width = m.W; c.height = H; const x = c.getContext('2d')!; x.clearRect(0, 0, m.W, H); x.drawImage(cv, 0, 0)
        Object.assign(suporte.style, { width: px(m.W), height: px(H), transformOrigin: `${px(ombro.x)} ${px(ombro.y)}` })
      }
      const svg = raiz.current.querySelector('svg')!
      svg.setAttribute('viewBox', `0 0 ${m.W} ${H}`)
      // acessórios
      const slots = raiz.current.querySelectorAll<HTMLElement>('[data-slot]')
      slots.forEach((s) => (s.style.display = 'none'))
      const slot = (n: string) => raiz.current!.querySelector<HTMLElement>(`[data-slot="${n}"]`)!
      for (const id of ficha.acessorios || []) {
        const a = ACESSORIOS[id]; if (!a) continue
        const img = await imagem(`${BASE}acc-${id}.webp`); if (!vivo) return
        const asp = img.height / img.width
        if (a.encaixe === 'pescoco' && a.recorte) {
          const cv = await pescoco(BASE, ficha.corpo, id, m, img); if (!vivo) return
          const el = slot('pescoco') as HTMLCanvasElement
          el.width = m.W; el.height = H; const x = el.getContext('2d')!; x.clearRect(0, 0, m.W, H); x.drawImage(cv, 0, 0)
          Object.assign(el.style, { display: 'block', width: px(m.W), height: px(H) })
          continue
        }
        let el: HTMLImageElement, w = 0, left = 0, top = 0
        if (a.encaixe === 'cabeca' && a.ancora === 'rosto') { el = slot('cabeca') as HTMLImageElement; w = m.largura(m.rostoY - (m.rostoY - m.topo) * 0.2) * a.larg; left = m.cx - w / 2; top = m.rostoY - w * asp * 0.78 }
        else if (a.encaixe === 'cabeca') {
          el = slot('cabeca') as HTMLImageElement; w = m.largura(m.cabecaY) * a.larg; left = m.cx - w / 2 + (a.dx || 0) * m.largura(m.cabecaY); top = m.topo + (a.topo || 0) * w * asp
          // trava: a aba nunca desce sobre os olhos
          const limite = m.rostoY - Math.max(14, m.largura(m.rostoY) * 0.055) * 1.7
          if (top + w * asp * 0.94 > limite) top = limite - w * asp * 0.94
        }
        else if (a.encaixe === 'olhos') { el = slot('olhos') as HTMLImageElement; w = m.largura(m.rostoY) * 0.62 * a.larg; left = m.cx - w / 2; top = m.rostoY - (w * asp) / 2 }
        else if (a.encaixe === 'costas') { el = slot('costas') as HTMLImageElement; w = m.largura(m.axila) * a.larg; left = m.cx - w / 2; top = m.axila - w * asp * 0.55 }
        else if (a.encaixe === 'mao') { el = slot('mao') as HTMLImageElement; w = m.largura(m.axila) * a.larg; left = m.mao.x - w * 0.45; top = m.mao.y - w * asp * 0.5 }
        else { el = slot('gravata') as HTMLImageElement; w = m.largura(m.pescocoY) * a.larg; left = m.cx - w / 2; top = m.pescocoY - w * asp * 0.1 }
        el.src = img.src
        Object.assign(el.style, { display: 'block', width: px(w), left: px(left), top: px(top) })
      }
      raiz.current.dataset.pronto = '1'
      desenhar(t != null ? t : performance.now() / 1000 + fase)
    })().catch((err) => {
      const w = window as unknown as { __erros?: string[] }
      ;(w.__erros ||= []).push(`rover ${ficha.corpo}: ${err?.message || err}`)
    })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, altura, larguraMax])

  const proxPiscada = useRef(1.5 + ((fase * 7.31) % 2))
  function desenhar(tt: number) {
    const m = medida.current
    if (!m || !corpo.current) return
    const e = estadoRef.current, p = pose(e, tt)
    let piscar = 0
    if (e !== 'dormir' && e !== 'feliz' && tt > proxPiscada.current) {
      const q = (tt - proxPiscada.current) / 0.18
      piscar = q < 1 ? Math.sin(q * Math.PI) : 0
      if (q >= 1 && t == null) proxPiscada.current = tt + 2.2 + ((tt * 13.7) % 2.8)
    }
    const k = altura / 260 // pulos proporcionais ao tamanho
    corpo.current.style.transform = `translateY(${p.ty * k}px) rotate(${p.rot}deg) scale(${p.sx}, ${p.sy})`
    bracoE.current!.style.transform = `rotate(${p.aE}deg)`
    bracoD.current!.style.transform = `rotate(${p.aD}deg)`
    if (sombraEl.current) { const al = Math.min(1, -p.ty / 46); sombraEl.current.style.transform = `translateX(-50%) scale(${1 - al * 0.35})`; sombraEl.current.style.opacity = String(1 - al * 0.5) }
    if (face.current) face.current.innerHTML = rostoSVG(m, fichaRef.current, e, { piscar, falar: p.falar, olhar: p.olhar }, ids)
  }

  // anima só quando aparece na tela
  useEffect(() => {
    if (t != null) { desenhar(t); return }
    const el = raiz.current!
    let parar: (() => void) | null = null
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !parar) parar = assinar((agora) => desenhar(agora / 1000 + fase))
      else if (!en.isIntersecting && parar) { parar(); parar = null }
    }, { rootMargin: '120px' })
    io.observe(el)
    return () => { io.disconnect(); parar?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, fase, altura])

  useEffect(() => { if (t != null) desenhar(t) })

  return (
    <div ref={raiz} className={`rover ${className || ''}`} style={{ height: altura }} role="img" aria-label={rotulo || 'rover de pelúcia'}>
      <div ref={corpo} className="rv-corpo">
        <img data-slot="costas" className="rv-costas" alt="" />
        <canvas ref={tronco} className="rv-camada" />
        <canvas data-slot="pescoco" className="rv-camada rv-pescoco" />
        <svg className="rv-rosto">
          <defs>
            <radialGradient id={ids.olho} cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#4a4a52" /><stop offset=".45" stopColor="#151519" /><stop offset="1" stopColor="#050507" /></radialGradient>
            <radialGradient id={ids.boch} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ff8c9f" stopOpacity=".55" /><stop offset="1" stopColor="#ff8c9f" stopOpacity="0" /></radialGradient>
          </defs>
          <g ref={face} />
        </svg>
        <img data-slot="gravata" className="rv-acc" alt="" />
        <img data-slot="olhos" className="rv-acc" alt="" />
        <img data-slot="cabeca" className="rv-acc" alt="" />
        <div ref={bracoE} className="rv-braco"><canvas /></div>
        <div ref={bracoD} className="rv-braco"><canvas /><img data-slot="mao" className="rv-acc" alt="" /></div>
      </div>
      {sombra && <div ref={sombraEl} className="rv-sombra" />}
    </div>
  )
}
