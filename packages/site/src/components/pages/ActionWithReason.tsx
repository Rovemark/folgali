'use client'

import { useId, useState, useTransition } from 'react'
import { actAction } from '@/app/social-actions'
import type { Dictionary } from '@/lib/i18n-base'
import type { SocialAct } from '@/lib/social/social-client'

type Props = {
  d: Dictionary
  /** builds the act with the chosen reason */
  montar: (reason: string) => SocialAct
  motivos: { valor: string; rotulo: string }[]
  buttonLabel: string
  titulo: string
  texto: string
  confirmar: string
  /** the button that opens the dialog looks like a menu item or a button */
  style?: 'menu' | 'botao'
  perigo?: boolean
  onDone?: () => void
}

/** An action that asks for a reason from the enum (report, remove as the person in charge): native dialog with the list. */
export default function ActionWithReason({ d, montar: build, motivos: reasons, buttonLabel, titulo: title, texto: text, confirmar: confirm, style = 'menu', perigo: danger = false, onDone }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(reasons[0]?.valor ?? '')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  function send() {
    setError(null)
    start(async () => {
      const r = await actAction(build(reason))
      if (r.ok) {
        setDone(true)
        onDone?.()
      } else setError(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <>
      <button type="button" className={style === 'menu' ? (danger ? 'danger' : undefined) : 'btn btn-secondary btn-small'} onClick={() => { setDone(false); setError(null); setOpen(true) }}>
        {buttonLabel}
      </button>
      {open && (
        <dialog
          className="dialog"
          open
          ref={(el) => {
            if (el && !el.open) el.showModal()
          }}
          onClose={() => setOpen(false)}
          aria-labelledby={`${id}-t`}
        >
          <h2 id={`${id}-t`}>{title}</h2>
          {done ? (
            <>
              <p role="status">{d.socComum.ato.feito}</p>
              <div className="dialog-buttons">
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>
                  {d.comum.fechar}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>{text}</p>
              <fieldset className="reasons">
                <legend className="reader-only">{title}</legend>
                {reasons.map((m) => (
                  <label key={m.valor} className="option">
                    <input type="radio" name={`${id}-m`} value={m.valor} checked={reason === m.valor} onChange={() => setReason(m.valor)} />
                    <strong>{m.rotulo}</strong>
                  </label>
                ))}
              </fieldset>
              {error && (
                <p className="error-field" role="alert">
                  {error}
                </p>
              )}
              <div className="dialog-buttons">
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>
                  {d.comum.cancelar}
                </button>
                <button type="button" className="btn btn-danger btn-small" disabled={pending} onClick={send}>
                  {pending ? d.socComum.ato.carregando : confirm}
                </button>
              </div>
            </>
          )}
        </dialog>
      )}
    </>
  )
}
