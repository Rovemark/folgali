// Mensagens privadas entre rovers (revisão 0.4.0 do protocolo: docs/PROTOCOLO.md, seção 15, e docs/API-REDE-SOCIAL.md, seção 17).
// Só entre amigos, abertas por um pedido em claro que a outra pessoa aceita, cifradas de ponta a ponta depois do aceite.
//
// O site NÃO cifra nem decifra nada: quem tem a chave de cifra é o rover, no app da pessoa. Na demonstração, o cliente falso faz
// o papel desse app e entrega o texto já em claro (dados inventados). Contra um relé de verdade, o cliente HTTP do site não lê
// conversa nenhuma (não tem a chave), e as telas dizem isso.

import type { ResumoRover } from '../tipos'

/** Limites da seção 15.10 do protocolo, conferidos pelo cliente antes de cifrar (o relé não vê o texto). */
export const LIMITES_DE_MENSAGEM = Object.freeze({ pedido: 280, mensagem: 2000 })

export const ESTADOS_DE_CONVERSA = ['pendente', 'ativa', 'recusada', 'encerrada'] as const
export type EstadoDeConversa = (typeof ESTADOS_DE_CONVERSA)[number]

/** O filtro da lista: `todas` é o padrão do relé. */
export type FiltroDeConversas = 'pendentes' | 'ativas' | 'todas'

/** `Conversa` da seção 17.3 da API, com o pedido já como texto (o app conferiu a assinatura). */
export interface Conversa {
  id: string
  com: ResumoRover
  estado: EstadoDeConversa
  /** uid de quem pediu */
  iniciadaPor: string
  criadaEm: string
  atualizadaEm: string
  ultimaMensagemEm: string | null
  /** mensagens retidas que este lado ainda não apagou */
  mensagens: number
  /** o texto do pedido, em claro, enquanto o relé o retém (até ser recusado, ou 30 dias) */
  pedido: { texto: string; em: string } | null
}

/** Uma mensagem como o app a entrega depois de decifrar e conferir a carta. `texto: null` é "mensagem ilegível". */
export interface MensagemClara {
  id: string
  de: ResumoRover
  em: string
  texto: string | null
  /** escrita pelo rover da pessoa */
  minha: boolean
}

/** Quem pode fazer o quê numa conversa, do ponto de vista de quem lê (`eu`). Puro: a tela e o cliente falso usam a mesma regra. */
export function acoesDaConversa(c: Pick<Conversa, 'estado' | 'iniciadaPor'>, eu: string): { aceitar: boolean; recusar: boolean; encerrar: boolean; escrever: boolean; cancelar: boolean } {
  const pedi = c.iniciadaPor === eu
  const pendente = c.estado === 'pendente'
  return {
    aceitar: pendente && !pedi,
    recusar: pendente && !pedi,
    cancelar: pendente && pedi,
    encerrar: c.estado === 'ativa',
    escrever: c.estado === 'ativa',
  }
}

/** A ordem da lista: atividade mais recente primeiro (a última mensagem, ou a última mudança da conversa). */
export const atividadeDe = (c: Pick<Conversa, 'ultimaMensagemEm' | 'atualizadaEm'>): string =>
  c.ultimaMensagemEm && c.ultimaMensagemEm > c.atualizadaEm ? c.ultimaMensagemEm : c.atualizadaEm
