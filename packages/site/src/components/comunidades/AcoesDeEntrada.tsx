'use client'

import { useState } from 'react'
import BotaoAto from '@/components/social/BotaoAto'
import type { Dicionario } from '@/lib/i18n-base'
import type { Acesso, VoceNaComunidade } from '@/lib/social/tipos'

/**
 * Os botões de participação de uma comunidade, por acesso e por situação do leitor: entrar (aberta),
 * pedir entrada (moderada), cancelar o pedido, aceitar ou recusar convite, sair. A matriz de
 * permissões (`podeNaComunidade`) decide o que aparece; o relé repete a conferência.
 */
export default function AcoesDeEntrada({ id, acesso, voce, d }: { id: string; acesso: Acesso; voce: VoceNaComunidade; d: Dicionario }) {
  const t = d.socComunidades.entrada
  const [aviso, setAviso] = useState<string | null>(null)
  if (voce.banido) return null
  if (voce.papel) {
    if (voce.papel === 'dono') return null
    return (
      <BotaoAto
        ato={{ tipo: 'comunidade-adesao', comunidade: id, acao: 'sair' }}
        d={d}
        className="btn btn-sec btn-peq"
        confirmar={{ titulo: t.sairTitulo, texto: t.sairTexto, ok: t.sairOk }}
      >
        {t.sair}
      </BotaoAto>
    )
  }
  if (voce.convidado) {
    return (
      <>
        <BotaoAto ato={{ tipo: 'comunidade-adesao', comunidade: id, acao: 'aceitar-convite' }} d={d} className="btn btn-prim btn-peq">
          {t.aceitar}
        </BotaoAto>
        <BotaoAto ato={{ tipo: 'comunidade-adesao', comunidade: id, acao: 'recusar-convite' }} d={d} className="btn btn-sec btn-peq">
          {t.recusar}
        </BotaoAto>
      </>
    )
  }
  if (voce.pedidoPendente) {
    return (
      <>
        <span className="pilula" data-tom="aviso" role="status">
          {t.pedidoPendente}
        </span>
        <BotaoAto ato={{ tipo: 'comunidade-adesao', comunidade: id, acao: 'cancelar-pedido' }} d={d} className="btn btn-sec btn-peq">
          {t.cancelar}
        </BotaoAto>
      </>
    )
  }
  if (acesso === 'fechada') return null
  return (
    <>
      <BotaoAto
        ato={{ tipo: 'comunidade-adesao', comunidade: id, acao: 'entrar' }}
        d={d}
        className="btn btn-prim"
        onFeito={(r) => setAviso(r === 'pendente' ? t.entradaPendente : null)}
      >
        {acesso === 'moderada' ? t.pedir : t.entrar}
      </BotaoAto>
      {aviso && (
        <p className="aviso-campo" role="status">
          {aviso}
        </p>
      )}
    </>
  )
}
