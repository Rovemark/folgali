'use client'

import { useState, useTransition } from 'react'
import { actAction } from '@/app/social-actions'
import ActionButton from '@/components/social/ActButton'
import { fmt, type Dictionary } from '@/lib/i18n-base'
import { SOCIAL_REPORT_REASONS, type SocialReportReason } from '@/lib/social/types'

type Props = {
  conversa: string
  mensagem: string
  /** the @ of who wrote it (for the report notice) */
  handle: string
  /** the message is from the other side and has readable text: only then can it be reported (revealing the text) */
  canReport: boolean
  canAct: boolean
  d: Dictionary
}

/**
 * What the person does with ONE message: delete their own copy (free) and, on a received message, report. The report says beforehand, in
 * full letters, that the app will reveal to the operator the text and the signature of this message, and only of this one.
 */
export default function MessageActions({ conversa: conversation, mensagem: message, handle, canReport, canAct, d }: Props) {
  const t = d.socMensagens
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<SocialReportReason | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function report(e: React.FormEvent) {
    e.preventDefault()
    if (!reason) return setError(t.denuncia.escolha)
    setError(null)
    start(async () => {
      const r = await actAction({ tipo: 'mensagem-denuncia', mensagem: message, motivo: reason })
      if (r.ok) setDone(true)
      else setError(d.socComum.ato.erro[r.codigo])
    })
  }

  if (!canAct) return null
  return (
    <div className="msg-actions">
      <div className="msg-actions-buttons">
        <ActionButton
          ato={{ tipo: 'conversa-apagar', conversa: conversation, mensagem: message }}
          d={d}
          className="btn btn-calm btn-small"
          confirmar={{ titulo: t.apagarTitulo, texto: t.apagarTexto, ok: t.apagarOk }}
        >
          {t.apagar}
        </ActionButton>
        {canReport && !done && (
          <button type="button" className="btn btn-calm btn-small" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
            {t.denunciar}
          </button>
        )}
      </div>
      {done && (
        <p className="pf-note" role="status">
          {t.denuncia.feita}
        </p>
      )}
      {open && !done && (
        <form className="msg-report" onSubmit={report} noValidate>
          <h3>{t.denuncia.titulo}</h3>
          <p className="msg-notice" role="note">
            {fmt(t.denuncia.aviso, { handle })}
          </p>
          <fieldset>
            <legend>{t.denuncia.motivo}</legend>
            {SOCIAL_REPORT_REASONS.map((m) => (
              <label key={m} className="option">
                <input type="radio" name={`motivo-${message}`} value={m} checked={reason === m} onChange={() => setReason(m)} />
                <span>
                  <strong>{d.socPerfil.denunciar.motivos[m][0]}</strong>
                  <span>{d.socPerfil.denunciar.motivos[m][1]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="error-field" role="alert">
              {error}
            </p>
          )}
          <div className="form-buttons">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>
              {t.denuncia.fechar}
            </button>
            <button type="submit" className="btn btn-danger btn-small" disabled={pending}>
              {pending ? d.socComum.ato.carregando : t.denuncia.enviar}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
