'use client'

import { useState } from 'react'
import BotaoSeguir from '@/components/BotaoSeguir'
import BotaoAto from '@/components/social/BotaoAto'
import { fmt, type Dicionario } from '@/lib/i18n-base'
import type { VoceNoPerfil } from '@/lib/social/tipos'

type Props = {
  uid: string
  nome: string
  euSigo?: boolean
  voce: VoceNoPerfil
  d: Dicionario
}

/**
 * Os botões de relação: seguir, amizade (pedir, cancelar, aceitar, recusar, desfazer), e, atrás de "mais
 * opções", silenciar e bloquear. Só mostra o que a relação de hoje permite. O outro lado nunca é avisado
 * de silêncio nem de bloqueio.
 */
export default function AcoesRelacao({ uid, nome, euSigo, voce, d }: Props) {
  const r = d.socPerfil.relacao
  const [aberto, setAberto] = useState(false)

  if (voce.euBloqueei) {
    return (
      <div className="pf-aviso-bloqueio" role="note">
        <div>
          <strong>{fmt(r.bloqueado, { nome })}</strong>
          <p>{fmt(r.bloqueadoTexto, { nome })}</p>
        </div>
        <BotaoAto ato={{ tipo: 'relacao', alvo: uid, acao: 'desbloquear' }} d={d} className="btn btn-sec btn-peq">
          {r.desbloquear}
        </BotaoAto>
      </div>
    )
  }

  return (
    <div className="pf-relacao">
      <div className="pf-relacao-linha">
        {euSigo !== undefined && <BotaoSeguir uid={uid} seguindo={euSigo} rotulos={{ seguir: r.seguir, seguindo: r.seguindo }} />}
        {voce.amigo ? (
          <span className="pilula" data-tom="ok">
            {r.amigos}
          </span>
        ) : voce.pedidoRecebido ? (
          <>
            <BotaoAto ato={{ tipo: 'amizade', alvo: uid, acao: 'aceitar' }} d={d} className="btn btn-prim">
              {r.aceitarAmizade}
            </BotaoAto>
            <BotaoAto ato={{ tipo: 'amizade', alvo: uid, acao: 'recusar' }} d={d} className="btn btn-sec btn-peq">
              {r.recusarAmizade}
            </BotaoAto>
          </>
        ) : voce.pedidoEnviado ? (
          <>
            <span className="pilula" data-tom="acao">
              {r.pedidoEnviado}
            </span>
            <BotaoAto ato={{ tipo: 'amizade', alvo: uid, acao: 'desfazer' }} d={d} className="btn btn-calmo btn-peq">
              {r.cancelarPedido}
            </BotaoAto>
          </>
        ) : (
          <BotaoAto ato={{ tipo: 'amizade', alvo: uid, acao: 'pedir' }} d={d} className="btn btn-sec">
            {r.pedirAmizade}
          </BotaoAto>
        )}
        <button type="button" className="btn btn-calmo btn-peq pf-mais-btn" aria-expanded={aberto} aria-controls="pf-mais-opcoes" onClick={() => setAberto(!aberto)}>
          {r.menu}
        </button>
      </div>
      {aberto && (
        <div id="pf-mais-opcoes" className="pf-mais-opcoes">
          {voce.amigo && (
            <BotaoAto
              ato={{ tipo: 'amizade', alvo: uid, acao: 'desfazer' }}
              d={d}
              className="btn btn-sec btn-peq"
              confirmar={{ titulo: fmt(r.desfazerTitulo, { nome }), texto: fmt(r.desfazerTexto, { nome }), ok: r.desfazerOk }}
            >
              {r.desfazerAmizade}
            </BotaoAto>
          )}
          {voce.euSilenciei ? (
            <BotaoAto ato={{ tipo: 'relacao', alvo: uid, acao: 'dessilenciar' }} d={d} className="btn btn-sec btn-peq">
              {r.dessilenciar}
            </BotaoAto>
          ) : (
            <BotaoAto
              ato={{ tipo: 'relacao', alvo: uid, acao: 'silenciar' }}
              d={d}
              className="btn btn-sec btn-peq"
              confirmar={{ titulo: fmt(r.silenciarTitulo, { nome }), texto: fmt(r.silenciarTexto, { nome }), ok: r.silenciarOk }}
            >
              {r.silenciar}
            </BotaoAto>
          )}
          <BotaoAto
            ato={{ tipo: 'relacao', alvo: uid, acao: 'bloquear' }}
            d={d}
            className="btn btn-perigo btn-peq"
            confirmar={{ titulo: fmt(r.bloquearTitulo, { nome }), texto: fmt(r.bloquearTexto, { nome }), ok: r.bloquearOk }}
          >
            {r.bloquear}
          </BotaoAto>
          <p className="miudo pf-mais-nota">
            {r.nunca} {r.denunciarNota}
          </p>
        </div>
      )}
      {voce.euSilenciei && !aberto && <p className="miudo">{fmt(r.silenciado, { nome })}</p>}
    </div>
  )
}
