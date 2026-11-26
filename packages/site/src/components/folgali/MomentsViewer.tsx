'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import Portrait from '@/components/Portrait'
import { markSeen } from '@/components/life/LiveRing'
import { runAnimation } from '@/components/life/movement'
import { lifeTexts } from '@/components/life/texts'
import Photo from './Photo'
import { IcHeart, IcRight, IcLeft, IcStar, IcClose, IcFire, IcSmile } from './Icons'
import type { Photo as TPhoto } from '@/lib/folgali/demo'
import type { Spec } from '@/lib/types'

export type VisibleMoment = { autor: string; nome: string; ficha: Spec; quando: string; foto: TPhoto; legenda: string; ring: string }
type Labels = { titulo: string; anterior: string; proximo: string; fechar: string; responder: string; respostaAjuda: string; reagir: string; reacoes: Record<'coracao' | 'estrela' | 'sorriso' | 'fogo', string>; de: string; progresso: string; lista: string }

const swap = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_m, k: string) => String(v[k] ?? `{${k}}`))
const REACTIONS = [['coracao', <IcHeart key="c" />], ['estrela', <IcStar key="e" />], ['sorriso', <IcSmile key="s" />], ['fogo', <IcFire key="f" />]] as const

/** The moments in full screen: the list on the left, the moment in the middle, arrows and keyboard (← →, Esc closes). */
export default function MomentsViewer({ itens: items, initial, lang, t }: { itens: VisibleMoment[]; initial: number; lang: string; t: Labels }) {
  const [i, setI] = useState(Math.min(Math.max(0, initial), items.length - 1))
  const [reacted, setReacted] = useState<string | null>(null)
  // the bar of the current moment fills on its own and moves to the next; the button pauses (and holding a finger on the photo too)
  const [paused, setPaused] = useState(false)
  const tv = lifeTexts(lang)
  const frame = useRef<HTMLElement>(null)
  const m = items[i]
  useEffect(() => {
    markSeen(items[i].autor)
    runAnimation(frame.current?.querySelector('.moment-photo'), [{ transform: 'scale(1.06)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duracao: '--vida-lento', mola: '--vida-saida' })
  }, [i, items])
  useEffect(() => {
    runAnimation(frame.current, [{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duracao: '--vida-lento' })
  }, [])
  const go = (n: number) => { setReacted(null); setI((x) => Math.min(Math.max(0, x + n), items.length - 1)) }
  useEffect(() => {
    const keyName = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', keyName)
    return () => window.removeEventListener('keydown', keyName)
  })
  return (
    <div className="moments-screen">
      <nav className="moments-side" aria-label={t.lista}>
        <h1 className="moments-title">{t.titulo}</h1>
        <ul>
          {items.map((x, k) => (
            <li key={x.autor}>
              <button type="button" className="moments-who" aria-current={k === i ? 'true' : undefined} onClick={() => { setReacted(null); setI(k) }}>
                <span className="moment-ring" data-anel={x.ring}>
                  <Portrait ficha={x.ficha} nome={x.nome} tamanho={52} decorative />
                </span>
                <span>
                  <strong>{x.nome}</strong>
                  <span>{x.quando}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section className="moment-stage" aria-roledescription="carrossel" aria-label={swap(t.de, { nome: m.nome })}>
        <button type="button" className="moment-arrow" onClick={() => go(-1)} disabled={i === 0} aria-label={t.anterior}>
          <IcLeft />
        </button>
        <figure ref={frame} className="moment-frame" aria-live="polite" data-pausado={paused || undefined}>
          <div className="moment-bars" role="img" aria-label={swap(t.progresso, { i: i + 1, n: items.length })}>
            {items.map((x, k) => (
              <span key={x.autor} data-feito={k < i ? '1' : k === i ? 'agora' : '0'} onAnimationEnd={k === i && i < items.length - 1 ? () => go(1) : undefined} />
            ))}
          </div>
          <button type="button" className="life-moment-pause" aria-pressed={paused} aria-label={paused ? tv.continuar : tv.pausar} onClick={() => setPaused((p) => !p)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden focusable="false">
              {paused ? <path d="M8 5.5v13l10.5-6.5z" /> : <path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" />}
            </svg>
          </button>
          <Photo foto={m.foto} prioridade className="moment-photo" />
          <figcaption className="moment-head">
            <Portrait ficha={m.ficha} nome={m.nome} tamanho={40} decorative />
            <span><strong>{m.nome}</strong> · {m.quando}</span>
          </figcaption>
          <p className="moment-caption" dir="auto">{m.legenda}</p>
          <div className="moment-bottom">
            <label htmlFor="momento-resp" className="reader-only">{swap(t.responder, { nome: m.nome })}</label>
            <input id="momento-resp" type="text" placeholder={swap(t.responder, { nome: m.nome })} title={t.respostaAjuda} />
            {REACTIONS.map(([k, s]) => (
              <button key={k} type="button" className="moment-reaction" data-r={k} aria-pressed={reacted === k} onClick={() => setReacted(k)} aria-label={swap(t.reagir, { r: t.reacoes[k] })}>
                <span aria-hidden>{s}</span>
              </button>
            ))}
          </div>
        </figure>
        <button type="button" className="moment-arrow" onClick={() => go(1)} disabled={i === items.length - 1} aria-label={t.proximo}>
          <IcRight />
        </button>
      </section>
      <Link href={`/${lang}/linha`} className="moment-close" aria-label={t.fechar}>
        <IcClose />
      </Link>
    </div>
  )
}
