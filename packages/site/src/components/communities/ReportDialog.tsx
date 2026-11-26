'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { actAction } from '@/app/social-actions'
import { IcFlag } from '@/components/Icons'
import type { Dictionary } from '@/lib/i18n-base'
import { SOCIAL_REPORT_REASONS, type SocialReportReason } from '@/lib/social/types'

/**
 * Report a topic or a reply: anonymous (the network does not keep who reported, and the community
 * queue shows reasons and totals). The answer is the same whether the target exists or not.
 */
export default function ReportDialog({ alvo: target, d, rotulo: label, className = 'action-btn' }: { alvo: string; d: Dictionary; rotulo: string; className?: string }) {
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState<SocialReportReason | ''>('')
  const [state, setState] = useState<'novo' | 'ok' | 'erro'>('novo')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function send() {
    if (!reason) return
    start(async () => {
      const r = await actAction({ tipo: 'denuncia', alvo: target, motivo: reason })
      if (r.ok) setState('ok')
      else {
        setState('erro')
        setError(d.socComum.ato.erro[r.codigo])
      }
    })
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setState('novo')
          setReason('')
          ref.current?.showModal()
        }}
      >
        <IcFlag />
        <span>{label}</span>
      </button>
      <dialog ref={ref} className="dialog" aria-labelledby={`${id}-t`}>
        <h2 id={`${id}-t`}>{d.socForum.denuncia.titulo}</h2>
        {state === 'ok' ? (
          <p role="status">{d.socForum.denuncia.enviada}</p>
        ) : (
          <>
            <p>{d.socForum.denuncia.texto}</p>
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor={`${id}-m`}>{d.socForum.denuncia.motivo}</label>
              <select id={`${id}-m`} value={reason} onChange={(e) => setReason(e.target.value as SocialReportReason)}>
                <option value="">{d.socForum.gestao.motivoRotulo}</option>
                {SOCIAL_REPORT_REASONS.map((m) => (
                  <option key={m} value={m}>
                    {d.socComum.motivosDenuncia[m]}
                  </option>
                ))}
              </select>
            </div>
            {state === 'erro' && error && (
              <p className="error-field" role="alert">
                {error}
              </p>
            )}
          </>
        )}
        <div className="dialog-buttons">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => ref.current?.close()}>
            {d.comum.fechar}
          </button>
          {state !== 'ok' && (
            <button type="button" className="btn btn-primary btn-small" disabled={!reason || pending} onClick={send}>
              {pending ? d.socComum.ato.carregando : d.socForum.denuncia.enviar}
            </button>
          )}
        </div>
      </dialog>
    </>
  )
}
