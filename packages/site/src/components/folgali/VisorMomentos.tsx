'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Retrato from '@/components/Retrato'
import Foto from './Foto'
import { IcCoracao, IcDireita, IcEsquerda, IcEstrela, IcFechar, IcFogo, IcSorriso } from './Icones'
import type { Foto as TFoto } from '@/lib/folgali/demo'
import type { Ficha } from '@/lib/tipos'

export type MomentoVisivel = { autor: string; nome: string; ficha: Ficha; quando: string; foto: TFoto; legenda: string; anel: string }
type Rotulos = { titulo: string; anterior: string; proximo: string; fechar: string; responder: string; respostaAjuda: string; reagir: string; reacoes: Record<'coracao' | 'estrela' | 'sorriso' | 'fogo', string>; de: string; progresso: string; lista: string }

const troca = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_m, k: string) => String(v[k] ?? `{${k}}`))
const REACOES = [['coracao', <IcCoracao key="c" />], ['estrela', <IcEstrela key="e" />], ['sorriso', <IcSorriso key="s" />], ['fogo', <IcFogo key="f" />]] as const

/** Os momentos em tela cheia: a lista à esquerda, o momento no meio, setas e teclado (← →, Esc fecha). */
export default function VisorMomentos({ itens, inicial, lang, t }: { itens: MomentoVisivel[]; inicial: number; lang: string; t: Rotulos }) {
  const [i, setI] = useState(Math.min(Math.max(0, inicial), itens.length - 1))
  const [reagiu, setReagiu] = useState<string | null>(null)
  const m = itens[i]
  const ir = (n: number) => { setReagiu(null); setI((x) => Math.min(Math.max(0, x + n), itens.length - 1)) }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') ir(1)
      if (e.key === 'ArrowLeft') ir(-1)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })
  return (
    <div className="momentos-tela">
      <nav className="momentos-lado" aria-label={t.lista}>
        <h1 className="momentos-titulo">{t.titulo}</h1>
        <ul>
          {itens.map((x, k) => (
            <li key={x.autor}>
              <button type="button" className="momentos-quem" aria-current={k === i ? 'true' : undefined} onClick={() => { setReagiu(null); setI(k) }}>
                <span className="momento-anel" data-anel={x.anel}>
                  <Retrato ficha={x.ficha} nome={x.nome} tamanho={52} decorativo />
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
      <section className="momento-palco" aria-roledescription="carrossel" aria-label={troca(t.de, { nome: m.nome })}>
        <button type="button" className="momento-seta" onClick={() => ir(-1)} disabled={i === 0} aria-label={t.anterior}>
          <IcEsquerda />
        </button>
        <figure className="momento-quadro" aria-live="polite">
          <div className="momento-barras" role="img" aria-label={troca(t.progresso, { i: i + 1, n: itens.length })}>
            {itens.map((x, k) => <span key={x.autor} data-feito={k <= i ? '1' : '0'} />)}
          </div>
          <Foto foto={m.foto} prioridade className="momento-foto" />
          <figcaption className="momento-cab">
            <Retrato ficha={m.ficha} nome={m.nome} tamanho={40} decorativo />
            <span><strong>{m.nome}</strong> · {m.quando}</span>
          </figcaption>
          <p className="momento-legenda" dir="auto">{m.legenda}</p>
          <div className="momento-baixo">
            <label htmlFor="momento-resp" className="so-leitor">{troca(t.responder, { nome: m.nome })}</label>
            <input id="momento-resp" type="text" placeholder={troca(t.responder, { nome: m.nome })} title={t.respostaAjuda} />
            {REACOES.map(([k, s]) => (
              <button key={k} type="button" className="momento-reacao" data-r={k} aria-pressed={reagiu === k} onClick={() => setReagiu(k)} aria-label={troca(t.reagir, { r: t.reacoes[k] })}>
                <span aria-hidden>{s}</span>
              </button>
            ))}
          </div>
        </figure>
        <button type="button" className="momento-seta" onClick={() => ir(1)} disabled={i === itens.length - 1} aria-label={t.proximo}>
          <IcDireita />
        </button>
      </section>
      <Link href={`/${lang}/linha`} className="momento-fechar" aria-label={t.fechar}>
        <IcFechar />
      </Link>
    </div>
  )
}
