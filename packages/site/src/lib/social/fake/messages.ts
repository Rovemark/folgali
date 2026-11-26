// PRIVATE MESSAGES in the fake client (revision 0.4.0: docs/PROTOCOL.md, section 15). This layer plays the role of the RELAY and the person's APP
// at the same time: it keeps the conversations with the same rules as the relay (friends only, request with acceptance, block, states, rate,
// 30 day retention, each side deletes its own copy) and delivers the text already in clear, as the app would deliver after decrypting.
// Everything here is invented. Nothing is really encrypted: the cipher lives in the app and in the protocol package, not on the site.

import { NetworkError, type Page } from '../../types'
import type { Fields } from '../../domain/social-approval'
import type { SocialAct, ActResult } from '../social-client'
import { MESSAGE_LIMITS, activityOf, type Conversation, type ConversationState, type ConversationFilter, type ClearMessage } from '../messages'
import type { SocialReportReason } from '../types'
import { iso, paginate } from './base'
import { Write } from './write'
import { DAY, HOUR } from './internal'

/** The caps of section 15.10, in the numbers the demonstration needs to check. */
export const MESSAGE_RULES = Object.freeze({
  requestsPerHour: 5,
  messagesPerHour: 60,
  sentPendingRequests: 20,
  receivedPendingRequests: 50,
  waitAfterRefusalMs: 7 * DAY,
  retentionMs: 30 * DAY,
})

export interface ConversationS {
  id: string
  de: string
  para: string
  estado: ConversationState
  criadaEm: number
  atualizadaEm: number
  pedido: { texto: string; em: number } | null
}
export interface MessageS {
  id: string
  conversa: string
  de: string
  para: string
  em: number
  /** `null`: the app could not decrypt (swapped cipher, a letter that does not check out). The screen shows "unreadable message". */
  texto: string | null
  deletedBySender: boolean
  deletedByRecipient: boolean
}
/** What the operator receives: the text the recipient revealed, the message author and the reason. Never who reported. */
export interface MessageReportS {
  mensagem: string
  autorDoAlvo: string
  motivo: SocialReportReason
  texto: string
  em: number
}

type MessageAct = Extract<SocialAct, { tipo: 'conversa-decidir' | 'conversa-apagar' | 'mensagem-denuncia' }>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export class Messages extends Write {
  readonly dbConversations: ConversationS[] = []
  readonly dbMessages: MessageS[] = []
  readonly messageReports: MessageReportS[] = []
  /** who reported what (once per message), kept apart as the relay keeps the pseudonym */
  private readonly alreadyReported = new Set<string>()

  // ---- ajudantes -----------------------------------------------------------------------------------------------

  protected fromSide(c: ConversationS, uid: string): boolean {
    return c.de === uid || c.para === uid
  }
  protected outro(c: ConversationS, uid: string): string {
    return c.de === uid ? c.para : c.de
  }
  /** The conversation of which `uid` is one of the sides. For someone outside, it does not exist. */
  protected conversationOf(id: string, uid: string): ConversationS {
    const c = this.dbConversations.find((x) => x.id === id)
    if (!c || !this.fromSide(c, uid)) throw new NetworkError('nao-encontrado', 'conversa não encontrada')
    return c
  }
  /** Friends only, and no block on either side. The answer is the SAME in both cases: the blocked person does not find out they were blocked. */
  protected requireFriendship(a: string, b: string): void {
    if (!this.isFriend(a, b) || this.bloqueio(a, b)) throw new NetworkError('interacao-nao-permitida', 'não é possível interagir')
  }
  protected visible(m: MessageS, uid: string): boolean {
    return m.de === uid ? !m.deletedBySender : !m.deletedByRecipient
  }
  /** 30 day retention: what passed the deadline disappears before any read or write. */
  protected clearMessages(): void {
    const cutoff = this.now() - MESSAGE_RULES.retentionMs
    for (let i = this.dbMessages.length - 1; i >= 0; i--) {
      const m = this.dbMessages[i]
      if (m.em < cutoff || (m.deletedBySender && m.deletedByRecipient)) this.dbMessages.splice(i, 1)
    }
    for (let i = this.dbConversations.length - 1; i >= 0; i--) {
      const c = this.dbConversations[i]
      if (c.pedido && c.pedido.em < cutoff) c.pedido = null
      const withoutMessages = !this.dbMessages.some((m) => m.conversa === c.id)
      const some =
        (c.estado === 'pendente' && c.criadaEm < cutoff) ||
        (c.estado === 'recusada' && this.now() - c.atualizadaEm > MESSAGE_RULES.waitAfterRefusalMs) ||
        (c.estado === 'encerrada' && withoutMessages)
      if (some) this.dbConversations.splice(i, 1)
    }
  }

  protected view(c: ConversationS, uid: string): Conversation {
    const mine = this.dbMessages.filter((m) => m.conversa === c.id && this.visible(m, uid))
    const last = mine.reduce((max, m) => Math.max(max, m.em), 0)
    return {
      id: c.id,
      com: this.resumo(this.outro(c, uid)),
      estado: c.estado,
      iniciadaPor: c.de,
      criadaEm: iso(c.criadaEm),
      atualizadaEm: iso(c.atualizadaEm),
      ultimaMensagemEm: last ? iso(last) : null,
      mensagens: mine.length,
      pedido: c.pedido ? { texto: c.pedido.texto, em: iso(c.pedido.em) } : null,
    }
  }

  /** Own read: only the person's rover reads its conversations. */
  protected requireOwn(uid: string): void {
    if (uid !== this.eu) throw new NetworkError('sem-permissao', 'só o próprio rover lê as conversas dele')
  }

  // ---- leitura (docs/API-SOCIAL-NETWORK.md, 17.3) -----------------------------------------------------------------

  override async conversas(uid: string, options: { estado?: ConversationFilter; cursor?: string } = {}): Promise<Page<Conversation>> {
    this.requireOwn(uid)
    this.clearMessages()
    const filter = options.estado ?? 'todas'
    const list = this.dbConversations
      .filter((c) => this.fromSide(c, uid))
      .filter((c) => (filter === 'pendentes' ? c.estado === 'pendente' : filter === 'ativas' ? c.estado === 'ativa' : true))
      .map((c) => this.view(c, uid))
      .sort((a, b) => (activityOf(a) < activityOf(b) ? 1 : activityOf(a) > activityOf(b) ? -1 : a.id.localeCompare(b.id)))
    return structuredClone(paginate(list, options.cursor))
  }

  override async conversa(uid: string, id: string): Promise<Conversation> {
    this.requireOwn(uid)
    this.clearMessages()
    return structuredClone(this.view(this.conversationOf(id, uid), uid))
  }

  override async mensagensDaConversa(uid: string, id: string, cursor?: string): Promise<Page<ClearMessage>> {
    this.requireOwn(uid)
    this.clearMessages()
    const c = this.conversationOf(id, uid)
    const list: ClearMessage[] = this.dbMessages
      .filter((m) => m.conversa === c.id && this.visible(m, uid))
      .sort((a, b) => a.em - b.em || a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, de: this.resumo(m.de), em: iso(m.em), texto: m.texto, minha: m.de === uid }))
    return structuredClone(paginate(list, cursor, 50))
  }

  // ---- writing: request and message arrive after the person's approval (draft queue) -------------------------

  protected override createFromMessage(author: string, type: 'conversa-pedir' | 'mensagem', fields: Fields, id: string): string {
    this.clearMessages()
    const t = this.now()
    const text = str(fields.texto)
    if (type === 'conversa-pedir') {
      const target = str(fields.alvo)
      this.rover(target)
      if (target === author) throw new NetworkError('invalido', 'um rover não conversa consigo')
      if (Array.from(text).length > MESSAGE_LIMITS.pedido) throw new NetworkError('invalido', 'o pedido passa de 280 caracteres')
      this.requireFriendship(author, target)
      const fromPair = this.dbConversations.filter((c) => (c.de === author && c.para === target) || (c.de === target && c.para === author))
      if (fromPair.some((c) => c.estado === 'pendente' || c.estado === 'ativa')) throw new NetworkError('ja-existe', 'já há conversa entre os dois')
      if (fromPair.some((c) => c.estado === 'recusada' && c.de === author && t - c.atualizadaEm < MESSAGE_RULES.waitAfterRefusalMs)) throw new NetworkError('limite', 'o pedido foi recusado há menos de 7 dias')
      if (this.dbConversations.filter((c) => c.de === author && c.estado === 'pendente').length >= MESSAGE_RULES.sentPendingRequests) throw new NetworkError('limite-de-estrutura', 'pedidos pendentes demais')
      if (this.dbConversations.filter((c) => c.para === target && c.estado === 'pendente').length >= MESSAGE_RULES.receivedPendingRequests) throw new NetworkError('limite-de-estrutura', 'o outro rover tem pedidos demais')
      if (this.countRate(`conversa-pedir:${author}`, HOUR) >= MESSAGE_RULES.requestsPerHour) throw new NetworkError('limite', 'pedidos demais nesta hora')
      this.markRate(`conversa-pedir:${author}`)
      this.dbConversations.push({ id, de: author, para: target, estado: 'pendente', criadaEm: t, atualizadaEm: t, pedido: { texto: text, em: t } })
      // the notice only says who asked (like the relay: no object, no text); whoever muted or blocked the origin does not receive it
      this.notify(target, 'conversa-pedido', { origem: author })
      return id
    }
    const c = this.conversationOf(str(fields.conversa), author)
    if (c.estado !== 'ativa') throw new NetworkError('interacao-nao-permitida', 'a conversa não está aceita')
    const to = this.outro(c, author)
    this.requireFriendship(author, to)
    if (Array.from(text).length > MESSAGE_LIMITS.mensagem) throw new NetworkError('invalido', 'a mensagem passa de 2000 caracteres')
    if (this.countRate(`mensagem:${author}`, HOUR) >= MESSAGE_RULES.messagesPerHour) throw new NetworkError('limite', 'mensagens demais nesta hora')
    this.markRate(`mensagem:${author}`)
    this.dbMessages.push({ id, conversa: c.id, de: author, para: to, em: t, texto: text, deletedBySender: false, deletedByRecipient: false })
    c.atualizadaEm = t
    return id
  }

  // ---- gestures: decide (with the person's touch as approval), delete and report ---------------------------------

  protected override messageAct(author: string, act: MessageAct): ActResult {
    this.clearMessages()
    const t = this.now()
    switch (act.tipo) {
      case 'conversa-decidir': {
        const c = this.conversationOf(act.conversa, author)
        if (act.decisao === 'encerrar') {
          const can = c.estado === 'ativa' || (c.estado === 'pendente' && c.de === author)
          if (!can) throw new NetworkError('interacao-nao-permitida', 'a conversa não está num estado que permita encerrar')
          Object.assign(c, { estado: 'encerrada', atualizadaEm: t, pedido: c.estado === 'pendente' ? null : c.pedido })
          return { resultado: 'encerrada' }
        }
        if (c.estado !== 'pendente') throw new NetworkError('interacao-nao-permitida', 'o pedido já foi decidido')
        if (c.para !== author) throw new NetworkError('sem-permissao', 'só quem recebeu o pedido decide')
        if (act.decisao === 'recusar') {
          Object.assign(c, { estado: 'recusada', atualizadaEm: t, pedido: null })
          return { resultado: 'recusada' }
        }
        this.requireFriendship(author, c.de)
        Object.assign(c, { estado: 'ativa', atualizadaEm: t })
        this.notify(c.de, 'conversa-aceita', { origem: author })
        return { resultado: 'ativa' }
      }
      case 'conversa-apagar': {
        const c = this.conversationOf(act.conversa, author)
        const target = this.dbMessages.filter((m) => m.conversa === c.id && this.visible(m, author) && (act.mensagem === null || m.id === act.mensagem))
        if (act.mensagem !== null && target.length === 0) throw new NetworkError('nao-encontrado', 'mensagem não encontrada')
        for (const m of target) {
          if (m.de === author) m.deletedBySender = true
          else m.deletedByRecipient = true
        }
        this.clearMessages()
        return {}
      }
      case 'mensagem-denuncia': {
        const m = this.dbMessages.find((x) => x.id === act.mensagem)
        // only the recipient reports, and only what is still retained; for the others, the message does not exist
        if (!m || m.para !== author) throw new NetworkError('nao-encontrado', 'mensagem não encontrada')
        // the app reveals the text it decrypted; what it did not decrypt has no letter to show
        if (m.texto === null) throw new NetworkError('invalido', 'não há texto legível para revelar')
        const key = `${author}>${m.id}`
        if (!this.alreadyReported.has(key)) {
          const day = this.countRate(`mensagem-denuncia:${author}`, DAY)
          if (day >= 10) throw new NetworkError('limite', 'denúncias demais hoje')
          this.markRate(`mensagem-denuncia:${author}`)
          this.alreadyReported.add(key)
          this.messageReports.push({ mensagem: m.id, autorDoAlvo: m.de, motivo: act.motivo, texto: m.texto, em: t })
        }
        return {}
      }
    }
  }
}
