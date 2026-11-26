'use client'

// Small pieces the messages screen shares: the monogram of the other side, the inline confirmation, and the sentence for a refusal
// (the relay's own sentences are never shown: they are in Portuguese and written for developers).
import { useState, type ReactNode } from 'react'
import type { MessagesTexts } from '@/i18n/messages'
import { fmt } from '@/lib/i18n-base'
import { PersonError } from '@/lib/person/client'
import type { MessageItem, Someone } from '@/lib/person/messages'
import { formatWait, waitOf } from '@/lib/person/refusal'

/** A received message the person chose to report (it carries the text and the letter signature that the report reveals). */
export type Report = MessageItem

export const displayName = (s: Pick<Someone, 'nome' | 'handle' | 'uid'>) => s.nome ?? (s.handle ? `@${s.handle}` : s.uid)

export function Avatar({ who, size = 40 }: { who: Pick<Someone, 'nome' | 'handle' | 'uid'>; size?: number }) {
  const letter = [...(who.nome ?? who.handle ?? '?').trim()][0]?.toLocaleUpperCase() ?? '?'
  // a stable hue per uid, from the five brand colors
  const hue = [...who.uid].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % 5
  return (
    <span className="cv-avatar" data-tom={hue} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden>
      {letter}
    </span>
  )
}

/** The code of a failure as the sentence the person reads, plus whether this device lost the account's cipher key. */
export function refusalText(e: unknown, t: MessagesTexts, lang: string): { text: string; lostKey: boolean } {
  if (!(e instanceof PersonError)) return { text: t.refusals.generic, lostKey: false }
  if (e.status === 401) return { text: t.refusals.signedOut, lostKey: false }
  switch (e.code) {
    case 'interacao_nao_permitida':
      return { text: t.refusals.notFriends, lostKey: false }
    case 'ja_existe':
      return { text: t.refusals.exists, lostKey: false }
    case 'limite_de_taxa':
    case 'limite': {
      const w = waitOf(e)
      return { text: w ? fmt(t.refusals.rate, { espera: formatWait(w, lang) }) : t.refusals.rateLater, lostKey: false }
    }
    case 'limite_de_estrutura':
      return { text: t.refusals.structure, lostKey: false }
    case 'estado_da_conversa':
    case 'nao_encontrado':
      return { text: t.refusals.state, lostKey: false }
    case 'outro_aparelho':
    case 'sem_chave':
      return { text: t.refusals.otherDevice, lostKey: true }
    case 'sem_chave_do_outro':
      return { text: t.refusals.noTheirKey, lostKey: false }
    case 'vazamento':
      return { text: t.refusals.leak, lostKey: false }
    default:
      return { text: t.refusals.generic, lostKey: false }
  }
}

/** A button that asks once more, in place, before acting (no modal: the question stays next to what it is about). */
export function ConfirmButton({ label, question, confirm, cancel, onConfirm, disabled, className = 'btn btn-calm btn-small' }: {
  label: ReactNode
  question: string
  confirm: string
  cancel: string
  onConfirm: () => void
  disabled?: boolean
  className?: string
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }
  return (
    <div className="cv-confirm" role="group">
      <p>{question}</p>
      <div className="cv-actions">
        <button type="button" className="btn btn-danger btn-small" disabled={disabled} onClick={() => { setAsking(false); onConfirm() }}>{confirm}</button>
        <button type="button" className="btn btn-calm btn-small" onClick={() => setAsking(false)}>{cancel}</button>
      </div>
    </div>
  )
}
