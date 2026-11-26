'use client'

import ActionButton from '@/components/social/ActButton'
import { fmt, type Dictionary } from '@/lib/i18n-base'

/**
 * Accept or decline a received conversation request. The decision REQUIRES the person's approval (protocol, section 15.9): so each button
 * opens the confirmation, and the confirmation text says that tap is the approval.
 */
export default function RequestButtons({ conversa: conversation, handle, d }: { conversa: string; handle: string; d: Dictionary }) {
  const t = d.socMensagens
  return (
    <div className="msg-decide">
      <ActionButton
        ato={{ tipo: 'conversa-decidir', conversa: conversation, decisao: 'aceitar' }}
        d={d}
        className="btn btn-primary btn-small"
        confirmar={{ titulo: fmt(t.confirmar.aceitarTitulo, { handle }), texto: t.confirmar.aceitarTexto, ok: t.confirmar.aceitarOk, classOk: 'btn btn-primary btn-small' }}
      >
        {t.aceitar}
      </ActionButton>
      <ActionButton
        ato={{ tipo: 'conversa-decidir', conversa: conversation, decisao: 'recusar' }}
        d={d}
        className="btn btn-secondary btn-small"
        confirmar={{ titulo: fmt(t.confirmar.recusarTitulo, { handle }), texto: t.confirmar.recusarTexto, ok: t.confirmar.recusarOk }}
      >
        {t.recusar}
      </ActionButton>
    </div>
  )
}
