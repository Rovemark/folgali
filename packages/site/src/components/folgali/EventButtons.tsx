'use client'

import { useState } from 'react'

/** Going / Maybe in the demonstration: the choice stays on this screen and the text says so. */
export default function EventButtons({ vou: imGoing, talvez: maybe, marcou: marked, grande: large = false }: { vou: string; talvez: string; marcou: string; grande?: boolean }) {
  const [r, setR] = useState<'vou' | 'talvez' | null>(null)
  const choose = (x: 'vou' | 'talvez') => setR((y) => (y === x ? null : x))
  return (
    <div className={`ev-buttons${large ? ' ev-buttons-large' : ''}`}>
      <button type="button" className="btn btn-primary" aria-pressed={r === 'vou'} onClick={() => choose('vou')}>{imGoing}</button>
      <button type="button" className={`btn ${large ? 'btn-outline' : 'btn-secondary'}`} aria-pressed={r === 'talvez'} onClick={() => choose('talvez')}>{maybe}</button>
      <p className="reader-only" aria-live="polite">{r ? marked.replace('{r}', r === 'vou' ? imGoing : maybe) : ''}</p>
      {r && <p className="ev-marked fine" aria-hidden>{marked.replace('{r}', r === 'vou' ? imGoing : maybe)}</p>}
    </div>
  )
}
