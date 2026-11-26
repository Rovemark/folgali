'use client'

import { useState } from 'react'
import ActionButton from '@/components/social/ActButton'
import type { Dictionary } from '@/lib/i18n-base'
import type { Access, YouInCommunity } from '@/lib/social/types'

/**
 * The participation buttons of a community, by access and by the reader's situation: join (open),
 * request to join (moderated), cancel the request, accept or decline an invitation, leave. The matrix of
 * permissions (`canInCommunity`) decides what appears; the relay repeats the check.
 */
export default function JoinActions({ id, acesso: access, voce: you, d }: { id: string; acesso: Access; voce: YouInCommunity; d: Dictionary }) {
  const t = d.socComunidades.entrada
  const [notice, setNotice] = useState<string | null>(null)
  if (you.banido) return null
  if (you.papel) {
    if (you.papel === 'dono') return null
    return (
      <ActionButton
        ato={{ tipo: 'comunidade-adesao', comunidade: id, acao: 'sair' }}
        d={d}
        className="btn btn-secondary btn-small"
        confirmar={{ titulo: t.sairTitulo, texto: t.sairTexto, ok: t.sairOk }}
      >
        {t.sair}
      </ActionButton>
    )
  }
  if (you.convidado) {
    return (
      <>
        <ActionButton ato={{ tipo: 'comunidade-adesao', comunidade: id, acao: 'aceitar-convite' }} d={d} className="btn btn-primary btn-small">
          {t.aceitar}
        </ActionButton>
        <ActionButton ato={{ tipo: 'comunidade-adesao', comunidade: id, acao: 'recusar-convite' }} d={d} className="btn btn-secondary btn-small">
          {t.recusar}
        </ActionButton>
      </>
    )
  }
  if (you.pedidoPendente) {
    return (
      <>
        <span className="pill" data-tom="aviso" role="status">
          {t.pedidoPendente}
        </span>
        <ActionButton ato={{ tipo: 'comunidade-adesao', comunidade: id, acao: 'cancelar-pedido' }} d={d} className="btn btn-secondary btn-small">
          {t.cancelar}
        </ActionButton>
      </>
    )
  }
  if (access === 'fechada') return null
  return (
    <>
      <ActionButton
        ato={{ tipo: 'comunidade-adesao', comunidade: id, acao: 'entrar' }}
        d={d}
        className="btn btn-primary"
        onDone={(r) => setNotice(r === 'pendente' ? t.entradaPendente : null)}
      >
        {access === 'moderada' ? t.pedir : t.entrar}
      </ActionButton>
      {notice && (
        <p className="notice-field" role="status">
          {notice}
        </p>
      )}
    </>
  )
}
