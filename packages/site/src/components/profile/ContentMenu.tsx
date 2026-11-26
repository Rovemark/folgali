'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { actAction } from '@/app/social-actions'
import { IcFlag, IcTrash, IcPlus } from '@/components/Icons'
import type { Dictionary } from '@/lib/i18n-base'
import { MODERATION_REASON_LIST, type ModerationReason } from '@/lib/social/types'

export type ContentType = 'recado' | 'depoimento'

type Props = {
  id: string
  tipo: ContentType
  /** the @ of who wrote it, for the report screen to say what it is about */
  authorHandle: string
  /** the @ of the owner of the page where the content is */
  ownerHandle: string
  lang: string
  d: Dictionary
  /** the reader wrote this: can delete it */
  meu: boolean
  /** the reader is the owner of the wall or profile: can remove what others wrote */
  ofOwner: boolean
}

/** The "three dots" menu of a note or testimonial: report, delete what is yours, remove from my wall. */
export default function ContentMenu({ id, tipo: type, authorHandle, ownerHandle, lang, d, meu: mine, ofOwner }: Props) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'apagar' | 'remover' | null>(null)
  const [reason, setReason] = useState<ModerationReason>('regras')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const m = d.socPerfil.mural
  const from = type === 'recado' ? ownerHandle : authorHandle

  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (!ref.current?.open) return
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') ref.current.open = false
        return
      }
      if (!ref.current.contains(e.target as Node)) ref.current.open = false
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', close)
    }
  }, [])

  function confirm() {
    setError(null)
    start(async () => {
      const act = dialog === 'apagar' ? ({ tipo: 'remocao-pelo-autor', alvo: id } as const) : ({ tipo: 'remocao-por-responsavel', alvo: id, motivo: reason } as const)
      const r = await actAction(act)
      if (r.ok) setDialog(null)
      else setError(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <div className="pf-menu-content">
      <details className="menu" ref={ref} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="icon-btn" aria-label={d.comum.abrirMenu} aria-expanded={open}>
          <IcPlus />
        </summary>
        <ul className="menu-list">
          <li>
            <Link href={`/${lang}/denunciar/${id}?tipo=${type}&de=${encodeURIComponent(from)}&volta=${encodeURIComponent(`/r/${ownerHandle}`)}`}>
              <IcFlag />
              {m.denunciar}
            </Link>
          </li>
          {mine && (
            <li>
              <button type="button" className="danger" onClick={() => { if (ref.current) ref.current.open = false; setDialog('apagar') }}>
                <IcTrash />
                {m.apagar}
              </button>
            </li>
          )}
          {ofOwner && !mine && (
            <li>
              <button type="button" className="danger" onClick={() => { if (ref.current) ref.current.open = false; setDialog('remover') }}>
                <IcTrash />
                {m.remover}
              </button>
            </li>
          )}
        </ul>
      </details>
      {dialog && (
        <dialog
          className="dialog"
          open
          ref={(el) => {
            if (el && !el.open) el.showModal()
          }}
          onClose={() => setDialog(null)}
          aria-labelledby={`dlg-${id}`}
        >
          <h2 id={`dlg-${id}`}>{dialog === 'apagar' ? m.apagarTitulo : m.removerTitulo}</h2>
          <p>{dialog === 'apagar' ? m.apagarTexto : m.removerTexto}</p>
          {dialog === 'remover' && (
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor={`mot-${id}`}>{m.removerMotivo}</label>
              <select id={`mot-${id}`} value={reason} onChange={(e) => setReason(e.target.value as ModerationReason)}>
                {MODERATION_REASON_LIST.map((x) => (
                  <option key={x} value={x}>
                    {d.socComum.motivosModeracao[x]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && (
            <p className="error-field" role="alert" style={{ marginTop: 8 }}>
              {error}
            </p>
          )}
          <div className="dialog-buttons">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setDialog(null)}>
              {d.comum.cancelar}
            </button>
            <button type="button" className="btn btn-danger btn-small" disabled={pending} onClick={confirm}>
              {dialog === 'apagar' ? m.apagarOk : m.removerOk}
            </button>
          </div>
        </dialog>
      )}
    </div>
  )
}
