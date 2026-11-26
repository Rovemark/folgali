'use client'

import { useId, useState, useTransition } from 'react'
import { inviteByHandleAction } from '@/app/community-actions'
import type { Dictionary } from '@/lib/i18n-base'

export default function InviteRover({ comunidade: community, d }: { comunidade: string; d: Dictionary }) {
  const id = useId()
  const t = d.socComunidades.convidar
  const [handle, setHandle] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [pending, start] = useTransition()
  return (
    <form
      className="convidar-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!handle.trim()) return
        start(async () => {
          const r = await inviteByHandleAction(community, handle)
          if (r.ok) {
            setHandle('')
            setMsg({ tipo: 'ok', texto: t.enviado })
          } else setMsg({ tipo: 'erro', texto: r.codigo === 'sem-rover' ? t.naoAchei : d.socComum.ato.erro[r.codigo] })
        })
      }}
    >
      <div className="field">
        <label htmlFor={id}>{t.campo}</label>
        <div className="invite-row">
          <input id={id} type="text" value={handle} placeholder={t.dica} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(e) => setHandle(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-small" disabled={pending || !handle.trim()}>
            {pending ? d.socComum.ato.carregando : t.botao}
          </button>
        </div>
        {msg && (
          <p className={msg.tipo === 'ok' ? 'notice-ok' : 'error-field'} role={msg.tipo === 'ok' ? 'status' : 'alert'}>
            {msg.texto}
          </p>
        )}
      </div>
    </form>
  )
}
