'use client'

// The wall form of a profile for a PERSON: a short note (`recado`), signed on the device and carried to the relay. The same
// invite as the header for a visitor without an account; nothing for the owner (her own wall) or a reader the wall does not take.
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { findLeaks } from '@/lib/leak-detector'
import { LEAK_GROUP } from '@/lib/leak-messages'
import { publish } from '@/lib/person/client'
import type { ProfileTexts } from '@/i18n/profile'
import { usePersonView } from './usePersonView'

type Props = {
  uid: string
  nome: string
  t: ProfileTexts
  signIn: string | null
  /** the wall takes notes only from friends */
  friendsOnly: boolean
  /** shown when the reader is not a friend of a friends-only wall */
  friendsOnlyText: string
  /** what to say when the text would leak a secret (the same detector as the relay), per kind */
  leak: Record<'chave' | 'senha' | 'contato' | 'documento' | 'interno', string>
  max: number
}

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '')

export default function PersonNote({ uid, nome: name, t, signIn, friendsOnly, friendsOnlyText, leak, max }: Props) {
  const id = useId()
  const router = useRouter()
  const view = usePersonView(uid)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle')
  if (view.s === 'loading' || view.s === 'off' || view.s === 'own') return null
  if (view.s !== 'ready') {
    return (
      <div className="pf-join pf-join-wall" id="recado">
        <p>{fill(t.invite, { nome: name })}</p>
        {view.s === 'out' && signIn && <a href={signIn} className="btn btn-primary btn-small">{t.signIn}</a>}
      </div>
    )
  }
  if (view.relation.euBloqueei) return null
  if (friendsOnly && !view.relation.amigo) return <p className="pf-note" role="note" id="recado">{friendsOnlyText}</p>
  const found = text ? findLeaks(text)[0] : undefined
  const ok = text.trim().length > 0 && text.length <= max && !found

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setState('idle')
    try {
      await publish('recado', { alvo: uid, texto: text.trim() })
      setText('')
      setState('sent')
      router.refresh()
    } catch {
      setState('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="pf-write form-proposal compact" id="recado" onSubmit={send}>
      <div className="field">
        <label htmlFor={`${id}-r`}>{fill(t.noteLabel, { nome: name })}</label>
        <textarea id={`${id}-r`} rows={3} value={text} maxLength={max} placeholder={t.notePlaceholder} onChange={(e) => { setText(e.target.value); setState('idle') }} />
        {found && <p className="notice-leak" role="alert">{leak[LEAK_GROUP[found.tipo]]}</p>}
      </div>
      <div className="pw-foot">
        <button type="submit" className="btn btn-primary btn-small" disabled={!ok || busy} aria-busy={busy}>{busy ? t.noteSending : t.noteSend}</button>
      </div>
      {state === 'sent' && <p className="callout callout-ok" role="status">{t.noteSent}</p>}
      {state === 'error' && <p className="callout callout-notice" role="alert">{t.failed}</p>}
    </form>
  )
}
