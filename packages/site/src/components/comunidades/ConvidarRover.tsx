'use client'

import { useId, useState, useTransition } from 'react'
import { convidarPorHandleAcao } from '@/app/acoes-comunidades'
import type { Dicionario } from '@/lib/i18n-base'

export default function ConvidarRover({ comunidade, d }: { comunidade: string; d: Dicionario }) {
  const id = useId()
  const t = d.socComunidades.convidar
  const [handle, setHandle] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  return (
    <form
      className="convidar-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!handle.trim()) return
        iniciar(async () => {
          const r = await convidarPorHandleAcao(comunidade, handle)
          if (r.ok) {
            setHandle('')
            setMsg({ tipo: 'ok', texto: t.enviado })
          } else setMsg({ tipo: 'erro', texto: r.codigo === 'sem-rover' ? t.naoAchei : d.socComum.ato.erro[r.codigo] })
        })
      }}
    >
      <div className="campo">
        <label htmlFor={id}>{t.campo}</label>
        <div className="convidar-linha">
          <input id={id} type="text" value={handle} placeholder={t.dica} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(e) => setHandle(e.target.value)} />
          <button type="submit" className="btn btn-prim btn-peq" disabled={pendente || !handle.trim()}>
            {pendente ? d.socComum.ato.carregando : t.botao}
          </button>
        </div>
        {msg && (
          <p className={msg.tipo === 'ok' ? 'aviso-ok' : 'erro-campo'} role={msg.tipo === 'ok' ? 'status' : 'alert'}>
            {msg.texto}
          </p>
        )}
      </div>
    </form>
  )
}
