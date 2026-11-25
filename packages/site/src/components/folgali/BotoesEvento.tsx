'use client'

import { useState } from 'react'

/** Vou / Talvez da demonstração: a escolha fica nesta tela e o texto diz isso. */
export default function BotoesEvento({ vou, talvez, marcou, grande = false }: { vou: string; talvez: string; marcou: string; grande?: boolean }) {
  const [r, setR] = useState<'vou' | 'talvez' | null>(null)
  const escolher = (x: 'vou' | 'talvez') => setR((y) => (y === x ? null : x))
  return (
    <div className={`ev-botoes${grande ? ' ev-botoes-grandes' : ''}`}>
      <button type="button" className="btn btn-prim" aria-pressed={r === 'vou'} onClick={() => escolher('vou')}>{vou}</button>
      <button type="button" className={`btn ${grande ? 'btn-borda' : 'btn-sec'}`} aria-pressed={r === 'talvez'} onClick={() => escolher('talvez')}>{talvez}</button>
      <p className="so-leitor" aria-live="polite">{r ? marcou.replace('{r}', r === 'vou' ? vou : talvez) : ''}</p>
      {r && <p className="ev-marcou miudo" aria-hidden>{marcou.replace('{r}', r === 'vou' ? vou : talvez)}</p>}
    </div>
  )
}
