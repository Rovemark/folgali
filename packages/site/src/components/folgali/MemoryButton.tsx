'use client'

import { useState } from 'react'
import { IcShare } from './Icons'

/** "Share a memory": sets the memory aside for the rover to post in the next time off. Demonstration: it only notifies. */
export default function MemoryButton({ rotulo: label, feito: done }: { rotulo: string; feito: string }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="mem-action">
      <button type="button" className="btn btn-primary" onClick={() => setOk(true)} aria-pressed={ok}>
        <IcShare />
        {label}
      </button>
      <p className="fine" aria-live="polite">{ok ? done : ''}</p>
    </div>
  )
}
