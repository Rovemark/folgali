// SPDX-License-Identifier: AGPL-3.0-or-later
// Private messages in the relay (revision 0.4.0, PROTOCOL.md section 15). The relay decrypts NOTHING: it checks shape, signature, approval,
// friendship, block, conversation state, current keys and rate, and stores the ciphertext for 30 days. It only exists with the feature on
// (`new Relay({ mensagens: true })`); when off, nothing of the messages exists (route, type, resource). The cleanup and delete functions at the end of the file
// apply with the feature on or not, so that what was already stored leaves on time.
import { BURST_PER_CONVERSATION, FEATURE_MESSAGES_WITHOUT_APPROVAL, limitError,
  MESSAGE_STRUCTURE, ProtocolError, ID_RE, MESSAGE_LIMITS, DEFAULT_PAGE, APPEAL_MESSAGES,
  MESSAGE_TIMES, MESSAGE_TYPES, UID_RE, MESSAGES_VERSION, canonicalize, letterMatches, weakCipherKey
} from '../../protocol/src/index.js'
import { pairOf } from './social-base.js'

const T = MESSAGE_TIMES
const OPEN = "('pendente', 'ativa')"
const LIST_STATES = { pendentes: ['pendente'], ativas: ['ativa'], todas: ['pendente', 'ativa', 'recusada', 'encerrada'] }

export class Messages {
  /** @param {import('./relay.js').Relay} relay */
  constructor(relay) {
    this.rele = relay
    this.a = relay.store
  }

  get social() { return this.rele.social }

  // ====================================================================================================
  // WRITE
  // ====================================================================================================

  /**
   * It arrives here after: envelope, shape (schema, previo null, id), attestation, operator blocks, signature, duplicate and clock.
   * From here: registered rover, release (approval), type rules, rate, writing. Nothing enters the `previo` chain.
   */
  aceitar({ envelope, obj, effective, newAttestation, stored, agora: now }) {
    if (!stored) throw new ProtocolError('perfil_primeiro')
    // proposal 0014: the optional package `mensagens` (an authorization "0.6") releases conversa-pedir, conversa-decidir and mensagem
    const { aprovacao: approval, autorizacao: authorization } = this.rele._release(envelope, obj, effective, stored, now)
    if (obj.tipo === 'mensagem-denuncia') return this.denunciar(obj, now)
    const effect = this[`r_${obj.tipo.replaceAll('-', '_')}`](obj, now)
    this.rele._checkRate(obj, effective.emissor, now, authorization ?? null, stored, {}, effective.especie)
    this.a.transaction(() => {
      if (newAttestation) this.rele._updateAttestation(obj, newAttestation)
      // Only the trace of the id (against resubmission, and for the rate): no envelope and no target, so as not to keep who talks to whom beyond what is necessary.
      this.a.executar(
        `INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor, profundidade, envelope, removido_em, autorizacao_id)
         VALUES (:id, :autor, :tipo, :criadoEm, :agora, :emissor, 0, NULL, :agora, :autorizacao)`,
        // (the authorization id is kept so its own ceilings count the messages it released)
        { id: obj.id, autor: obj.autor, tipo: obj.tipo, criadoEm: obj.criadoEm, agora: now, emissor: effective.emissor, autorizacao: authorization?.id ?? null }
      )
      effect.gravar({ agora: now, aprovacao: approval, autorizacao: authorization, chaveDeRede: effective.chave })
    })
    return effect.resultado === undefined ? { estado: 'aceito', id: obj.id } : { estado: 'aceito', id: obj.id, resultado: effect.resultado }
  }

  // ---------- queries ----------

  conversa(id) { return typeof id === 'string' ? this.a.um('SELECT * FROM conversas WHERE id = :id', { id }) : null }
  pairOpenConversation(x, y) { return this.a.um(`SELECT * FROM conversas WHERE par = :par AND estado IN ${OPEN}`, { par: pairOf(x, y) }) }
  currentKey(uid) { return this.a.um('SELECT * FROM chaves_de_cifra WHERE uid = :uid AND vigente = 1', { uid }) }
  otherSide(c, uid) { return c.de === uid ? c.para : c.para === uid ? c.de : null }

  /** An active friendship and no block. Both cases give the SAME answer: the blocked person does not find out they were blocked. */
  requireFriendsWithoutBlock(x, y, field) {
    if (this.social.blockBetween(x, y) || !this.social.activeFriendship(x, y)) throw new ProtocolError('interacao_nao_permitida', { campo: field })
  }

  /** The conversation exists and the author is one of the sides. Whoever is not a party gets the same as "does not exist". */
  requireParty(id, uid, field = 'objeto.corpo.conversa') {
    const c = this.conversa(id)
    if (!c || this.otherSide(c, uid) === null) throw new ProtocolError('nao_encontrado', { campo: field })
    return c
  }

  markActivity(id, now, extra = '') {
    this.a.executar(`UPDATE conversas SET atualizada_em = :agora, seq_atividade = (SELECT COALESCE(MAX(seq_atividade), 0) + 1 FROM conversas)${extra} WHERE id = :id`, { id, agora: now })
  }

  // ---------- rules by type: each one checks and returns { resultado?, gravar({ agora, aprovacao, chaveDeRede }) } ----------

  r_chave_de_cifra(obj) {
    if (weakCipherKey(obj.corpo.chave)) throw new ProtocolError('chave_fraca', { campo: 'objeto.corpo.chave' })
    return {
      gravar: ({ agora: now }) => {
        this.a.executar('UPDATE chaves_de_cifra SET vigente = 0 WHERE uid = :uid', { uid: obj.autor })
        this.a.executar('INSERT INTO chaves_de_cifra (id, uid, chave, envelope, em, vigente) VALUES (:id, :uid, :chave, :envelope, :agora, 1)', {
          id: obj.id, uid: obj.autor, chave: obj.corpo.chave, envelope: canonicalize({ objeto: obj }), agora: now
        })
      }
    }
  }

  r_conversa_pedir(obj, now) {
    const target = this.social.requireRover(obj.corpo.alvo, now)
    this.requireFriendsWithoutBlock(obj.autor, target.uid, 'objeto.corpo.alvo')
    if (this.pairOpenConversation(obj.autor, target.uid)) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.alvo' })
    const refusal = this.a.um(
      "SELECT MAX(atualizada_em) AS em FROM conversas WHERE de = :de AND para = :para AND estado = 'recusada'", { de: obj.autor, para: target.uid }
    )
    if (refusal?.em && refusal.em + T.conversationRequestRefusalS > now) {
      throw new ProtocolError('limite_de_taxa', { detalhe: 'O último pedido de conversa a este rover foi recusado há pouco tempo.', retryAfterS: refusal.em + T.conversationRequestRefusalS - now })
    }
    const E = MESSAGE_STRUCTURE
    const account = (sql, p) => this.a.um(`SELECT COUNT(*) AS n FROM conversas WHERE ${sql}`, p).n
    if (account("de = :uid AND estado = 'pendente'", { uid: obj.autor }) >= E.sentPendingRequests) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${E.sentPendingRequests} pedidos de conversa pendentes enviados.` })
    }
    if (account("para = :uid AND estado = 'pendente'", { uid: target.uid }) >= E.receivedPendingRequests) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: 'Este rover já tem pedidos de conversa pendentes demais.' })
    }
    return {
      resultado: 'pendente',
      gravar: ({ agora: t, aprovacao: approval, autorizacao: authorization }) => {
        this.a.executar(
          `INSERT INTO conversas (id, par, de, para, estado, pedido, criada_em, atualizada_em, ultima_mensagem_em, seq_atividade)
           VALUES (:id, :par, :de, :para, 'pendente', :pedido, :t, :t, NULL, (SELECT COALESCE(MAX(seq_atividade), 0) + 1 FROM conversas))`,
          { id: obj.id, par: pairOf(obj.autor, target.uid), de: obj.autor, para: target.uid, pedido: canonicalize({ objeto: obj, ...(approval === undefined ? {} : { aprovacao: approval }), ...(authorization ? { autorizacao: authorization } : {}) }), t }
        )
        this.social.notify(target.uid, 'conversa-pedido', { origem: obj.autor }, t)
      }
    }
  }

  r_conversa_decidir(obj, now) {
    const c = this.requireParty(obj.corpo.conversa, obj.autor)
    const state = (newValue, extra = '') => ({ agora: t }) => this.a.executar(`UPDATE conversas SET estado = '${newValue}', atualizada_em = :t${extra} WHERE id = :id`, { id: c.id, t })
    switch (obj.corpo.decisao) {
      case 'aceitar':
      case 'recusar': {
        if (c.para !== obj.autor) throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.conversa', detalhe: 'Só quem recebeu o pedido decide sobre ele.' })
        if (c.estado !== 'pendente') throw new ProtocolError('estado_da_conversa', { campo: 'objeto.corpo.conversa' })
        if (obj.corpo.decisao === 'recusar') return { resultado: 'recusada', gravar: state('recusada', ', pedido = NULL') }
        this.requireFriendsWithoutBlock(obj.autor, c.de, 'objeto.corpo.conversa')
        if (this.a.um("SELECT COUNT(*) AS n FROM conversas WHERE estado = 'ativa' AND (de = :uid OR para = :uid)", { uid: obj.autor }).n >= MESSAGE_STRUCTURE.activeConversations) {
          throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${MESSAGE_STRUCTURE.activeConversations} conversas aceitas.` })
        }
        return {
          resultado: 'ativa',
          gravar: ({ agora: t }) => {
            this.a.executar("UPDATE conversas SET estado = 'ativa' WHERE id = :id", { id: c.id })
            this.markActivity(c.id, t)
            this.social.notify(c.de, 'conversa-aceita', { origem: obj.autor }, t)
          }
        }
      }
      default: {
        // closing: an accepted conversation can be closed by either side; a pending one only by whoever asked (that is cancelling)
        const applies = c.estado === 'ativa' || (c.estado === 'pendente' && c.de === obj.autor)
        if (!applies) throw new ProtocolError('estado_da_conversa', { campo: 'objeto.corpo.conversa' })
        return { resultado: 'encerrada', gravar: state('encerrada', ', pedido = NULL') }
      }
    }
  }

  r_mensagem(obj, now) {
    const { conversa: conversation, para: to, chaveDe: keyOf, chavePara: keyFor } = obj.corpo
    const c = this.requireParty(conversation, obj.autor)
    if (this.otherSide(c, obj.autor) !== to) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.para' })
    if (c.estado !== 'ativa') throw new ProtocolError('estado_da_conversa', { campo: 'objeto.corpo.conversa' })
    this.social.requireRover(to, now, 'objeto.corpo.para')
    this.requireFriendsWithoutBlock(obj.autor, to, 'objeto.corpo.para')
    if (this.currentKey(obj.autor)?.chave !== keyOf) throw new ProtocolError('chave_de_cifra_desatualizada', { campo: 'objeto.corpo.chaveDe' })
    if (this.currentKey(to)?.chave !== keyFor) throw new ProtocolError('chave_de_cifra_desatualizada', { campo: 'objeto.corpo.chavePara' })
    // proposal 0014: a burst ceiling per conversation and author, for everyone (a rover that writes alone cannot flood one chat)
    for (const [windowS, max] of BURST_PER_CONVERSATION) {
      const n = this.a.um('SELECT COUNT(*) AS n, MIN(recebido_em) AS velho FROM mensagens WHERE conversa = :c AND de = :de AND recebido_em > :desde', { c: c.id, de: obj.autor, desde: now - windowS })
      if (n.n >= max) throw limitError('limite_de_taxa', { max, janelaS: windowS, retryAfterS: n.velho + windowS - now, deQue: 'mensagens nesta conversa' })
    }
    return {
      gravar: ({ agora: t, aprovacao: approval, autorizacao: authorization, chaveDeRede: networkKey }) => {
        this.a.executar(
          `INSERT INTO mensagens (id, conversa, de, para, criado_em, recebido_em, iv, chave_rede_de, envelope)
           VALUES (:id, :conversa, :de, :para, :criadoEm, :t, :iv, :chaveDeRede, :envelope)`,
          { id: obj.id, conversa: c.id, de: obj.autor, para: to, criadoEm: obj.criadoEm, t, iv: obj.corpo.iv, chaveDeRede: networkKey, envelope: canonicalize({ objeto: obj, ...(approval === undefined ? {} : { aprovacao: approval }), ...(authorization ? { autorizacao: authorization } : {}) }) }
        )
        this.markActivity(c.id, t, ', ultima_mensagem_em = :agora')
      }
    }
  }

  r_conversa_apagar(obj) {
    const c = this.requireParty(obj.corpo.conversa, obj.autor)
    const column = c.de === obj.autor ? 'apagada_de' : 'apagada_para'
    const target = obj.corpo.mensagem
    if (target !== null && !this.a.um('SELECT 1 AS x FROM mensagens WHERE id = :id AND conversa = :c', { id: target, c: c.id })) {
      throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.mensagem' })
    }
    const filter = target === null ? 'conversa = :c' : 'conversa = :c AND id = :id'
    const params = target === null ? { c: c.id } : { c: c.id, id: target }
    const n = this.a.um(`SELECT COUNT(*) AS n FROM mensagens WHERE ${filter} AND ${column} = 0`, params).n
    return {
      resultado: n,
      gravar: () => {
        this.a.executar(`UPDATE mensagens SET ${column} = 1 WHERE ${filter}`, params)
        this.a.executar('DELETE FROM mensagens WHERE apagada_de = 1 AND apagada_para = 1')
        this.a.executar(`DELETE FROM conversas WHERE id = :c AND estado IN ('encerrada', 'recusada') AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa = :c)`, { c: c.id })
      }
    }
  }

  /**
   * Message report: only the recipient, with the letter revealed. The relay rebuilds the letter from what it stored (conversa, criadoEm, de, iv,
   * para) and the revealed text, and checks it against the network key the sender had WHEN the message arrived. Then it stores what was
   * revealed and discards the object, as in the ordinary report (section 9.4): of the reporter only the pseudonym remains.
   */
  denunciar(obj, now) {
    const m = this.a.um('SELECT * FROM mensagens WHERE id = :id', { id: obj.corpo.mensagem })
    if (!m || m.para !== obj.autor) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.mensagem' })
    const letter = { conversa: m.conversa, criadoEm: m.criado_em, de: m.de, iv: m.iv, para: m.para, texto: obj.corpo.texto }
    if (!letterMatches(letter, obj.corpo.assinatura, m.chave_rede_de)) throw new ProtocolError('revelacao_invalida', { campo: 'objeto.corpo.assinatura' })
    const pseudonym = this.rele._pseudonym(obj.autor)
    for (const [windowS, max] of this.rele.rates.denuncia) {
      const n = this.a.um('SELECT COUNT(*) AS n FROM denuncias_de_mensagem WHERE pseudonimo = :p AND criado_em > :desde', { p: pseudonym, desde: now - windowS }).n
      if (n >= max) throw new ProtocolError('limite_de_taxa', { retryAfterS: windowS })
    }
    this.a.executar(
      'INSERT OR IGNORE INTO denuncias_de_mensagem (mensagem, autor_do_alvo, motivo, texto, pseudonimo, criado_em) VALUES (:mensagem, :autor, :motivo, :texto, :p, :agora)',
      { mensagem: m.id, autor: m.de, motivo: obj.corpo.motivo, texto: obj.corpo.texto, p: pseudonym, agora: now }
    )
    return { estado: 'recebida', id: obj.id }
  }

  // ====================================================================================================
  // READ
  // ====================================================================================================

  chaveDe(uid) {
    const now = this.rele.relogio()
    const r = UID_RE.test(uid) ? this.rele._roverVisible(uid, now) : null
    const k = r ? this.currentKey(uid) : null
    if (!k) throw new ProtocolError('nao_encontrado')
    return JSON.parse(k.envelope)
  }

  cartao(c, reader) {
    const column = c.de === reader ? 'apagada_de' : 'apagada_para'
    return {
      id: c.id,
      com: this.social.resumo(this.otherSide(c, reader)),
      estado: c.estado,
      iniciadaPor: c.de,
      criadaEm: c.criada_em,
      atualizadaEm: c.atualizada_em,
      ultimaMensagemEm: c.ultima_mensagem_em,
      mensagens: this.a.um(`SELECT COUNT(*) AS n FROM mensagens WHERE conversa = :c AND ${column} = 0`, { c: c.id }).n,
      pedido: c.pedido ? JSON.parse(c.pedido) : null
    }
  }

  conversationsOf(uid, { estado: state = 'todas', antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null } = {}) {
    const now = this.rele.relogio()
    const reader = this.social.requireOwn(uid, credential, now)
    const states = LIST_STATES[state ?? 'todas']
    if (!states) throw new ProtocolError('esquema', { campo: 'estado', detalhe: 'Parâmetro estado: pendentes, ativas ou todas.' })
    const lines = this.a.todos(
      `SELECT * FROM conversas WHERE (de = :uid OR para = :uid) AND estado IN (SELECT value FROM json_each(:estados))
         AND (:antes IS NULL OR seq_atividade < :antes) ORDER BY seq_atividade DESC LIMIT :limite`,
      { uid: reader, estados: JSON.stringify(states), antes: before, limite: limit + 1 }
    )
    return { itens: lines.slice(0, limit).map((c) => this.cartao(c, reader)), proximo: lines.length > limit ? lines[limit - 1].seq_atividade : null }
  }

  conversationOf(uid, id, { credencial: credential = null } = {}) {
    const reader = this.social.requireOwn(uid, credential, this.rele.relogio())
    const c = ID_RE.test(id) ? this.conversa(id) : null
    if (!c || this.otherSide(c, reader) === null) throw new ProtocolError('nao_encontrado')
    return this.cartao(c, reader)
  }

  messagesOf(uid, id, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null } = {}) {
    const reader = this.social.requireOwn(uid, credential, this.rele.relogio())
    const c = ID_RE.test(id) ? this.conversa(id) : null
    if (!c || this.otherSide(c, reader) === null) throw new ProtocolError('nao_encontrado')
    const column = c.de === reader ? 'apagada_de' : 'apagada_para'
    const lines = this.a.todos(
      `SELECT seq, envelope FROM mensagens WHERE conversa = :c AND ${column} = 0 AND (:antes IS NULL OR seq < :antes) ORDER BY seq DESC LIMIT :limite`,
      { c: c.id, antes: before, limite: limit + 1 }
    )
    return { itens: lines.slice(0, limit).map((l) => JSON.parse(l.envelope)), proximo: lines.length > limit ? lines[limit - 1].seq : null }
  }

  listReports({ limite: limit = 50 } = {}) {
    return this.a.todos(
      `SELECT id, mensagem, autor_do_alvo AS autorDoAlvo, motivo, texto, pseudonimo AS denunciante, criado_em AS criadoEm
       FROM denuncias_de_mensagem ORDER BY id DESC LIMIT :limite`,
      { limite: limit }
    )
  }

  /** What `GET /v1/info` gains with the feature on. */
  info(base) {
    return {
      ...base,
      // the declared revision is the relay's (DRAFT_REVIEW, 0.5.0, which contains 0.4.0): turning messages on only adds
      protocolo: [...base.protocolo, MESSAGES_VERSION],
      // proposal 0014: the optional package `mensagens` of the "0.6" authorization releases the three message types
      recursos: [...base.recursos, APPEAL_MESSAGES, FEATURE_MESSAGES_WITHOUT_APPROVAL],
      limites: {
        ...base.limites,
        mensagemCaracteres: MESSAGE_LIMITS.texto.max,
        pedidoDeConversaCaracteres: MESSAGE_LIMITS.pedido.max,
        retencaoDeMensagemS: T.retencaoDeMensagemS
      },
      mensagens: true
    }
  }
}

// ====================================================================================================
// APPLY WITH THE FEATURE ON OR NOT (what was already stored leaves on time and disappears when the rover leaves)
// ====================================================================================================

/** Undoing a friendship or blocking closes the open conversation between the two. Retained messages stay until deleted or for 30 days. */
export function closePairConversations(store, x, y, now) {
  store.executar(`UPDATE conversas SET estado = 'encerrada', pedido = NULL, atualizada_em = :agora WHERE par = :par AND estado IN ${OPEN}`, { par: pairOf(x, y), agora: now })
}

/** Leaving the network deletes, on this relay, the rover's conversations, messages and cipher keys, on both sides. */
export function deleteRoverMessages(store, uid) {
  store.executar('DELETE FROM mensagens WHERE de = :uid OR para = :uid', { uid })
  store.executar('DELETE FROM conversas WHERE de = :uid OR para = :uid', { uid })
  store.executar('DELETE FROM chaves_de_cifra WHERE uid = :uid', { uid })
}

/**
 * Retention (section 15.10): a message more than 30 days old since receipt; a pending request more than 30 days old; a refusal more than 7 days old;
 * a conversation closed with no messages; the id trace of 0.4 objects more than 30 days old. Returns how many messages it deleted.
 */
export function clearMessages(store, now, reportRetentionDays = 180) {
  const deleted = Number(store.executar('DELETE FROM mensagens WHERE recebido_em < :corte', { corte: now - T.retencaoDeMensagemS }).changes)
  store.executar("DELETE FROM conversas WHERE estado = 'pendente' AND criada_em < :corte", { corte: now - T.requestRetentionS })
  store.executar('UPDATE conversas SET pedido = NULL WHERE pedido IS NOT NULL AND criada_em < :corte', { corte: now - T.requestRetentionS })
  store.executar("DELETE FROM conversas WHERE estado = 'recusada' AND atualizada_em < :corte", { corte: now - T.conversationRequestRefusalS })
  store.executar("DELETE FROM conversas WHERE estado = 'encerrada' AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa = conversas.id)")
  store.executar(
    'DELETE FROM objetos WHERE tipo IN (SELECT value FROM json_each(:tipos)) AND recebido_em < :corte',
    { tipos: JSON.stringify(MESSAGE_TYPES), corte: now - T.objectTrailS }
  )
  store.executar('DELETE FROM denuncias_de_mensagem WHERE criado_em < :corte', { corte: now - reportRetentionDays * 86400 })
  return deleted
}
