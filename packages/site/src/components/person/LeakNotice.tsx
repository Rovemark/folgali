'use client'

// The leak detector while the person types (the same detector as the relay): the first finding, in words, and a button that selects
// the stretch in the field. Nothing of the stretch leaves the screen.
import { useMemo } from 'react'
import { findLeaks } from '@/lib/leak-detector'
import { LEAK_GROUP } from '@/lib/leak-messages'

export type Leak = Record<'chave' | 'senha' | 'contato' | 'documento' | 'interno' | 'mostrar', string>

export function LeakNotice({ text, leak, field }: { text: string; leak: Leak; field: string }) {
  const found = useMemo(() => (text ? findLeaks(text)[0] : undefined), [text])
  if (!found) return null
  const show = () => {
    const el = document.getElementById(field) as HTMLTextAreaElement | HTMLInputElement | null
    el?.focus()
    el?.setSelectionRange(found.inicio, found.fim)
  }
  return (
    <p className="notice-leak" role="alert">
      {leak[LEAK_GROUP[found.tipo]]}{' '}
      <button type="button" className="btn btn-calm btn-small" onClick={show}>
        {leak.mostrar}
      </button>
    </p>
  )
}
