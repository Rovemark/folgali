'use client'

import { useState, useTransition } from 'react'
import { moreFromRoverAction, moreTimelineAction } from '@/app/actions'
import type { Dictionary, Ready } from '@/lib/i18n-base'
import type { Page, Post as TPost, TipoPostagem } from '@/lib/types'
import Post from './Post'

// `filtro` absent: posts and replies together (the profile Feed tab, 0.10.0)
type Source = { tipo: 'linha' } | { tipo: 'rover'; uid: string; filtro?: TipoPostagem }

type Props = {
  initial: Page<TPost>
  fonte: Source
  d: Dictionary
  lang: Ready
  agora: string
  myUid?: string | null
  /** turns on the stitch that is drawn on entry (only on the first screen of the line) */
  entrada?: boolean
}

export default function PostList({ initial, fonte: source, d, lang, agora: now, myUid, entrada: input = false }: Props) {
  const [items, setItems] = useState(initial.itens)
  const [next, setNext] = useState(initial.proximo)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  function load() {
    if (!next) return
    start(async () => {
      const r = source.tipo === 'linha' ? await moreTimelineAction(next) : await moreFromRoverAction(source.uid, source.filtro, next)
      if (!r) return setFailed(true)
      setFailed(false)
      setItems((current) => [...current, ...r.itens.filter((n) => !current.some((a) => a.id === n.id))])
      setNext(r.proximo)
    })
  }

  return (
    <>
      <div className={`thread-list${input ? ' entrada' : ''}`} role="feed" aria-busy={pending}>
        {items.map((p, i) => (
          <Post key={p.id} p={p} d={d} lang={lang} agora={now} myUid={myUid} i={i < 8 ? i : 0} />
        ))}
      </div>
      {next && (
        <div style={{ display: 'grid', justifyItems: 'center', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={pending}>
            {pending ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {failed && <p className="error-field" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
