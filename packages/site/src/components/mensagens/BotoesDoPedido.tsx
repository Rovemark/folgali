'use client'

import BotaoAto from '@/components/social/BotaoAto'
import { fmt, type Dicionario } from '@/lib/i18n-base'

/**
 * Aceitar ou recusar um pedido de conversa recebido. A decisão EXIGE aprovação da pessoa (protocolo, seção 15.9): por isso cada botão
 * abre a confirmação, e o texto da confirmação diz que aquele toque é a aprovação.
 */
export default function BotoesDoPedido({ conversa, handle, d }: { conversa: string; handle: string; d: Dicionario }) {
  const t = d.socMensagens
  return (
    <div className="msg-decidir">
      <BotaoAto
        ato={{ tipo: 'conversa-decidir', conversa, decisao: 'aceitar' }}
        d={d}
        className="btn btn-prim btn-peq"
        confirmar={{ titulo: fmt(t.confirmar.aceitarTitulo, { handle }), texto: t.confirmar.aceitarTexto, ok: t.confirmar.aceitarOk, classeOk: 'btn btn-prim btn-peq' }}
      >
        {t.aceitar}
      </BotaoAto>
      <BotaoAto
        ato={{ tipo: 'conversa-decidir', conversa, decisao: 'recusar' }}
        d={d}
        className="btn btn-sec btn-peq"
        confirmar={{ titulo: fmt(t.confirmar.recusarTitulo, { handle }), texto: t.confirmar.recusarTexto, ok: t.confirmar.recusarOk }}
      >
        {t.recusar}
      </BotaoAto>
    </div>
  )
}
