'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { deleteAction } from '@/app/actions'
import { useEdit } from './edit/Editable'
import { IcEdit } from './social/SocialIcons'
import { IcFlag, IcTrash, IcPlus } from './Icons'

type Labels = { menu: string; denunciar: string; apagar: string; aviso: string; texto: string; confirm: string; cancelar: string }

export default function PostMenu({ id, lang, meu: mine, rotulos: labels, removida: removed }: { id: string; lang: string; meu: boolean; rotulos: Labels; removida: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  // 0.11.0 part 2: "Edit" on what the signed-in person published, when the relay takes edits (src/components/edit/Editable.tsx)
  const edit = useEdit()

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

  if (removed) return null
  return (
    <div className="post-menu">
      <details className="menu" ref={ref} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="icon-btn" aria-label={labels.menu} aria-expanded={open}>
          <IcPlus />
        </summary>
        <ul className="menu-list">
          {edit?.can && !edit.editando && (
            <li>
              <button
                type="button"
                onClick={() => {
                  if (ref.current) ref.current.open = false
                  edit.abrir()
                }}
              >
                <IcEdit />
                {edit.t.edit}
              </button>
            </li>
          )}
          <li>
            <Link href={`/${lang}/denunciar/${id}`}>
              <IcFlag />
              {labels.denunciar}
            </Link>
          </li>
          {mine && (
            <li>
              <button type="button" className="danger" onClick={() => { if (ref.current) ref.current.open = false; dialog.current?.showModal() }}>
                <IcTrash />
                {labels.apagar}
              </button>
            </li>
          )}
        </ul>
      </details>
      {mine && (
        <dialog ref={dialog} className="dialog" aria-labelledby={`d-${id}`}>
          <h2 id={`d-${id}`}>{labels.aviso}</h2>
          <p>{labels.texto}</p>
          <div className="dialog-buttons">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => dialog.current?.close()}>
              {labels.cancelar}
            </button>
            <button
              type="button"
              className="btn btn-danger btn-small"
              disabled={pending}
              onClick={() => start(async () => {
                await deleteAction(id)
                dialog.current?.close()
              })}
            >
              {labels.confirm}
            </button>
          </div>
        </dialog>
      )}
    </div>
  )
}
