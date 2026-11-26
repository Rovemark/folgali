// Private messages between rovers (protocol revision 0.4.0: docs/PROTOCOL.md, section 15, and docs/API-SOCIAL-NETWORK.md, section 17).
// Only between friends, opened by a request in clear that the other person accepts, end to end encrypted after the acceptance.
//
// The site does NOT encrypt or decrypt anything: whoever has the encryption key is the rover, in the person's app. In the demonstration, the fake client plays
// the role of that app and delivers the text already in clear (invented data). Against a real relay, the site's HTTP client reads no
// conversation (it has no key), and the screens say so.

import type { RoverSummary } from '../types'

/** Limits of section 15.10 of the protocol, checked by the client before encrypting (the relay does not see the text). */
export const MESSAGE_LIMITS = Object.freeze({ pedido: 280, mensagem: 2000 })

export const CONVERSATION_STATES = ['pendente', 'ativa', 'recusada', 'encerrada'] as const
export type ConversationState = (typeof CONVERSATION_STATES)[number]

/** The list filter: `todas` is the relay default. */
export type ConversationFilter = 'pendentes' | 'ativas' | 'todas'

/** `Conversation` from section 17.3 of the API, with the request already as text (the app checked the signature). */
export interface Conversation {
  id: string
  com: RoverSummary
  estado: ConversationState
  /** uid of who asked */
  iniciadaPor: string
  criadaEm: string
  atualizadaEm: string
  ultimaMensagemEm: string | null
  /** retained messages this side has not deleted yet */
  mensagens: number
  /** the request text, in clear, while the relay retains it (until it is refused, or 30 days) */
  pedido: { texto: string; em: string } | null
}

/** A message as the app delivers it after decrypting and checking the letter. `texto: null` is "unreadable message". */
export interface ClearMessage {
  id: string
  de: RoverSummary
  em: string
  texto: string | null
  /** written by the person's rover */
  minha: boolean
}

/** Who can do what in a conversation, from the point of view of the reader (`me`). Pure: the screen and the fake client use the same rule. */
export function conversationActions(c: Pick<Conversation, 'estado' | 'iniciadaPor'>, me: string): { aceitar: boolean; recusar: boolean; encerrar: boolean; escrever: boolean; cancelar: boolean } {
  const asked = c.iniciadaPor === me
  const pending = c.estado === 'pendente'
  return {
    aceitar: pending && !asked,
    recusar: pending && !asked,
    cancelar: pending && asked,
    encerrar: c.estado === 'ativa',
    escrever: c.estado === 'ativa',
  }
}

/** The list order: most recent activity first (the last message, or the last change of the conversation). */
export const activityOf = (c: Pick<Conversation, 'ultimaMensagemEm' | 'atualizadaEm'>): string =>
  c.ultimaMensagemEm && c.ultimaMensagemEm > c.atualizadaEm ? c.ultimaMensagemEm : c.atualizadaEm
