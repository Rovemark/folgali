'use client'

import { useState } from 'react'
import FollowButton from '@/components/FollowButton'
import ActionButton from '@/components/social/ActButton'
import { fmt, type Dictionary } from '@/lib/i18n-base'
import type { YouOnProfile } from '@/lib/social/types'

type Props = {
  uid: string
  nome: string
  euSigo?: boolean
  voce: YouOnProfile
  d: Dictionary
}

/**
 * The relation buttons: follow, friendship (ask, cancel, accept, decline, undo), and, behind "more
 * options", mute and block. It only shows what today's relation allows. The other side is never notified
 * of a mute or a block.
 */
export default function RelationActions({ uid, nome: name, euSigo: iFollow, voce: you, d }: Props) {
  const r = d.socPerfil.relacao
  const [open, setOpen] = useState(false)

  if (you.euBloqueei) {
    return (
      <div className="pf-notice-block" role="note">
        <div>
          <strong>{fmt(r.bloqueado, { nome: name })}</strong>
          <p>{fmt(r.bloqueadoTexto, { nome: name })}</p>
        </div>
        <ActionButton ato={{ tipo: 'relacao', alvo: uid, acao: 'desbloquear' }} d={d} className="btn btn-secondary btn-small">
          {r.desbloquear}
        </ActionButton>
      </div>
    )
  }

  return (
    <div className="pf-relationship">
      <div className="pf-relationship-row">
        {iFollow !== undefined && <FollowButton uid={uid} seguindo={iFollow} rotulos={{ seguir: r.seguir, seguindo: r.seguindo }} />}
        {you.amigo ? (
          <span className="pill" data-tom="ok">
            {r.amigos}
          </span>
        ) : you.pedidoRecebido ? (
          <>
            <ActionButton ato={{ tipo: 'amizade', alvo: uid, acao: 'aceitar' }} d={d} className="btn btn-primary">
              {r.aceitarAmizade}
            </ActionButton>
            <ActionButton ato={{ tipo: 'amizade', alvo: uid, acao: 'recusar' }} d={d} className="btn btn-secondary btn-small">
              {r.recusarAmizade}
            </ActionButton>
          </>
        ) : you.pedidoEnviado ? (
          <>
            <span className="pill" data-tom="acao">
              {r.pedidoEnviado}
            </span>
            <ActionButton ato={{ tipo: 'amizade', alvo: uid, acao: 'desfazer' }} d={d} className="btn btn-calm btn-small">
              {r.cancelarPedido}
            </ActionButton>
          </>
        ) : (
          <ActionButton ato={{ tipo: 'amizade', alvo: uid, acao: 'pedir' }} d={d} className="btn btn-secondary">
            {r.pedirAmizade}
          </ActionButton>
        )}
        <button type="button" className="btn btn-calm btn-small pf-more-btn" aria-expanded={open} aria-controls="pf-mais-opcoes" onClick={() => setOpen(!open)}>
          {r.menu}
        </button>
      </div>
      {open && (
        <div id="pf-mais-opcoes" className="pf-more-options">
          {you.amigo && (
            <ActionButton
              ato={{ tipo: 'amizade', alvo: uid, acao: 'desfazer' }}
              d={d}
              className="btn btn-secondary btn-small"
              confirmar={{ titulo: fmt(r.desfazerTitulo, { nome: name }), texto: fmt(r.desfazerTexto, { nome: name }), ok: r.desfazerOk }}
            >
              {r.desfazerAmizade}
            </ActionButton>
          )}
          {you.euSilenciei ? (
            <ActionButton ato={{ tipo: 'relacao', alvo: uid, acao: 'dessilenciar' }} d={d} className="btn btn-secondary btn-small">
              {r.dessilenciar}
            </ActionButton>
          ) : (
            <ActionButton
              ato={{ tipo: 'relacao', alvo: uid, acao: 'silenciar' }}
              d={d}
              className="btn btn-secondary btn-small"
              confirmar={{ titulo: fmt(r.silenciarTitulo, { nome: name }), texto: fmt(r.silenciarTexto, { nome: name }), ok: r.silenciarOk }}
            >
              {r.silenciar}
            </ActionButton>
          )}
          <ActionButton
            ato={{ tipo: 'relacao', alvo: uid, acao: 'bloquear' }}
            d={d}
            className="btn btn-danger btn-small"
            confirmar={{ titulo: fmt(r.bloquearTitulo, { nome: name }), texto: fmt(r.bloquearTexto, { nome: name }), ok: r.bloquearOk }}
          >
            {r.bloquear}
          </ActionButton>
          <p className="fine pf-more-note">
            {r.nunca} {r.denunciarNota}
          </p>
        </div>
      )}
      {you.euSilenciei && !open && <p className="fine">{fmt(r.silenciado, { nome: name })}</p>}
    </div>
  )
}
