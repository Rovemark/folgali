'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { actAction } from '@/app/social-actions'
import type { Dictionary } from '@/lib/i18n-base'
import type { SocialAct } from '@/lib/social/social-client'
import { MODERATION_REASON_LIST, type ModerationReason } from '@/lib/social/types'

type WithoutReason<T> = T extends { motivo: unknown } ? Omit<T, 'motivo'> : never

type Props = {
  /** the act WITHOUT the reason; the reason comes from what the person chooses */
  ato: WithoutReason<Extract<SocialAct, { tipo: 'comunidade-gestao' | 'remocao-por-responsavel' }>>
  d: Dictionary
  rotulo: string
  titulo: string
  texto: string
  confirmar: string
  className?: string
  /** the relay is who performs it; this text explains what cannot be undone */
  perigo?: boolean
}

/**
 * Button that opens a dialog asking for ONE reason from the enum (never free text) before kicking, banning or
 * removing. The choice is mandatory: without a reason the confirm button stays disabled.
 */
export default function ActionWithReason({ ato: act, d, rotulo: label, titulo: title, texto: text, confirmar: confirm, className = 'btn btn-danger btn-small' }: Props) {
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState<ModerationReason | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function openAction() {
    setReason('')
    setError(null)
    ref.current?.showModal()
  }
  function send() {
    if (!reason) return
    start(async () => {
      const r = await actAction({ ...act, motivo: reason })
      if (r.ok) ref.current?.close()
      else setError(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <>
      <button type="button" className={className} onClick={openAction}>
        {label}
      </button>
      <dialog ref={ref} className="dialog dialog-reason" aria-labelledby={`${id}-t`}>
        <h2 id={`${id}-t`}>{title}</h2>
        <p>{text}</p>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor={`${id}-m`}>{d.socModeracao.membros.motivo}</label>
          <select id={`${id}-m`} value={reason} onChange={(e) => setReason(e.target.value as ModerationReason)}>
            <option value="">{d.socForum.gestao.motivoRotulo}</option>
            {MODERATION_REASON_LIST.map((m) => (
              <option key={m} value={m}>
                {d.socComum.motivosModeracao[m]}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p className="error-field" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-buttons">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => ref.current?.close()}>
            {d.comum.cancelar}
          </button>
          <button type="button" className="btn btn-danger btn-small" disabled={!reason || pending} onClick={send}>
            {pending ? d.socComum.ato.carregando : confirm}
          </button>
        </div>
      </dialog>
    </>
  )
}
