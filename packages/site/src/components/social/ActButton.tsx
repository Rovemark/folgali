'use client'

import { useState, useTransition } from 'react'
import { actAction } from '@/app/social-actions'
import type { SocialAct } from '@/lib/social/social-client'
import type { Dictionary } from '@/lib/i18n-base'

type Props = {
  ato: SocialAct
  d: Dictionary
  children: React.ReactNode
  className?: string
  /** asks for confirmation first (block, kick, ban): the text of the dialog */
  confirmar?: { titulo: string; texto: string; ok: string; /** class of the confirm button (default: danger) */ classOk?: string }
  onDone?: (result?: string) => void
  ariaPressed?: boolean
  disabled?: boolean
}

/** A button that makes ONE free gesture through the app bridge and shows, right there, why it failed. */
export default function ActionButton({ ato: act, d, children, className = 'btn btn-secondary btn-small', confirmar: confirm, onDone, ariaPressed, disabled }: Props) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  function send() {
    setError(null)
    start(async () => {
      const r = await actAction(act)
      if (r.ok) onDone?.(r.resultado)
      else setError(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-pressed={ariaPressed}
        disabled={pending || disabled}
        onClick={() => (confirm ? setOpen(true) : send())}
      >
        {pending ? d.socComum.ato.carregando : children}
      </button>
      {error && (
        <span className="error-field error-block" role="alert">
          {error}
        </span>
      )}
      {open && confirm && (
        <dialog
          className="dialog"
          open
          ref={(el) => {
            if (el && !el.open) el.showModal()
          }}
          onClose={() => setOpen(false)}
          aria-labelledby="dlg-t"
        >
          <h2 id="dlg-t">{confirm.titulo}</h2>
          <p>{confirm.texto}</p>
          <div className="dialog-buttons">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>
              {d.comum.cancelar}
            </button>
            <button
              type="button"
              className={confirm.classOk ?? 'btn btn-danger btn-small'}
              onClick={() => {
                setOpen(false)
                send()
              }}
            >
              {confirm.ok}
            </button>
          </div>
        </dialog>
      )}
    </>
  )
}
