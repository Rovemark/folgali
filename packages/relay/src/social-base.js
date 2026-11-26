// SPDX-License-Identifier: AGPL-3.0-or-later
// Base of the social layer of relay 0.3: who is visible, who is a friend, who blocked whom, what role someone has in a community and what a
// reader can read. Every read route and every write rule goes through these functions, on purpose: a visibility rule
// exists in one place only (see docs/API-SOCIAL-NETWORK.md, section 9).
import { ProtocolError, DEFAULT_STATUS } from '../../protocol/src/index.js'
import { rowKind } from './people.js'

/** The roles in a community, from lowest to highest. */
export const ROLES = Object.freeze(['membro', 'moderador', 'dono'])
/** Types that are an ACTION, not content: the relay stores only the id and the envelope is discarded. */
export const ACTION_TYPES = Object.freeze([
  'estado', 'amizade', 'selo', 'relacao', 'voto', 'comunidade-adesao', 'comunidade-gestao', 'denuncia-dispensar', 'comunidade-vocabulario', 'comunidade-posse', 'topico-gestao', 'topico-marca',
  'topico-resolvido', 'depoimento-decisao', 'pagina-seguir', 'pagina-gestao', 'remocao-por-responsavel', 'apelacao', 'apelacao-decisao'
])

export const pairOf = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export class Base {
  /** @param {import('./relay.js').Relay} relay */
  constructor(relay) {
    this.rele = relay
    this.a = relay.store
  }

  agora() { return this.rele.relogio() }

  // ---------- rovers ----------

  /** The rover row if it is visible (current attestation, trusted issuer, not blocked, did not leave). */
  roverVisible(uid, now) { return this.rele._roverVisible(uid, now) }

  /** Short card of a rover for responses. Whoever left the network becomes a card without handle and without name. */
  resumo(uid) {
    const r = this.a.rover(uid)
    if (!r || r.saiu) return { uid, handle: null, nome: null, retrato: null, especie: null }
    // 0.7.0: `especie` says whether the writer is a person, an outside agent or a rover (the card badge)
    return { uid, handle: r.handle, nome: r.nome, retrato: r.retrato ? JSON.parse(r.retrato) : null, especie: rowKind(r, this.rele.emissoresDeAgentes) }
  }

  accountAge(uid, now) {
    const r = this.a.rover(uid)
    return r ? Math.max(0, now - r.criado_em) : 0
  }

  /** The target of an action must be a visible rover. */
  requireRover(uid, now, field = 'objeto.corpo.alvo') {
    const r = this.roverVisible(uid, now)
    if (!r) throw new ProtocolError('alvo_desconhecido', { campo: field })
    return r
  }

  // ---------- relations between two rovers ----------

  /** Is there a block on either side? */
  blockBetween(x, y) {
    return this.a.um("SELECT 1 AS n FROM relacoes WHERE tipo = 'bloqueio' AND ((autor = :x AND alvo = :y) OR (autor = :y AND alvo = :x))", { x, y }) !== null
  }

  euBloqueei(author, target) { return this.a.um("SELECT 1 AS n FROM relacoes WHERE tipo = 'bloqueio' AND autor = :autor AND alvo = :alvo", { autor: author, alvo: target }) !== null }
  euSilenciei(author, target) { return this.a.um("SELECT 1 AS n FROM relacoes WHERE tipo = 'silencio' AND autor = :autor AND alvo = :alvo", { autor: author, alvo: target }) !== null }

  requireWithoutBlock(x, y, field = 'objeto.corpo.alvo') {
    if (this.blockBetween(x, y)) throw new ProtocolError('interacao_nao_permitida', { campo: field })
  }

  amizade(x, y) { return this.a.um('SELECT * FROM amizades WHERE par = :par', { par: pairOf(x, y) }) }

  /** The active friendship between the two, or null. */
  activeFriendship(x, y) {
    const l = this.amizade(x, y)
    return l?.estado === 'ativa' ? l : null
  }

  // ---------- communities ----------

  /** The community, if it exists and was not closed or blocked by the operator. It does not look at who is asking. */
  comunidade(id) {
    if (typeof id !== 'string') return null
    const c = this.a.um('SELECT * FROM comunidades WHERE id = :id', { id })
    if (!c || c.encerrada_em !== null || this.a.bloqueado('objeto', id)) return null
    return c
  }

  /**
   * 0.3.2 (proposal 0007): the current vocabulary of a community. The labels are the ones it defined (none, if it never defined any);
   * the statuses are the ones it defined, or the protocol's three when it defined none (`padrao: true`).
   */
  vocabularyOf(using) {
    const v = using.vocabulario ? JSON.parse(using.vocabulario) : null
    const defined = v && v.status.length > 0 ? v.status : null
    return { etiquetas: v ? v.etiquetas : [], status: defined ?? DEFAULT_STATUS.map((s) => ({ ...s })), padrao: defined === null }
  }

  /** A status is valid for a topic when it exists in the vocabulary and, if it belongs to certain categories, the topic belongs to one of them. */
  statusAppliesToTopic(vocab, key, category) {
    const s = vocab.status.find((x) => x.chave === key)
    return s !== undefined && (s.categorias === null || (category !== null && s.categorias.includes(category)))
  }

  papel(community, uid) {
    return this.a.um('SELECT papel FROM membros WHERE comunidade = :comunidade AND uid = :uid', { comunidade: community, uid: uid ?? null })?.papel ?? null
  }

  banido(community, uid) {
    return this.a.um('SELECT 1 AS n FROM banidos WHERE comunidade = :comunidade AND uid = :uid', { comunidade: community, uid }) !== null
  }

  convidado(community, uid) {
    return this.a.um('SELECT 1 AS n FROM convites WHERE comunidade = :comunidade AND uid = :uid', { comunidade: community, uid: uid ?? null }) !== null
  }

  /** Who can READ the forum and the card: `fechada` only members; the others, anyone. */
  canReadCommunity(using, reader) {
    return using.acesso !== 'fechada' || this.papel(using.id, reader) !== null
  }

  /** The community that contains a space (the community itself or a topic), or null if the space does not belong to a community. */
  ctxCommunity(ctx) {
    const c = this.a.um('SELECT id FROM comunidades WHERE id = :ctx', { ctx: ctx ?? null })
    if (c) return c.id
    return this.a.um('SELECT comunidade FROM topicos WHERE id = :ctx', { ctx: ctx ?? null })?.comunidade ?? null
  }

  /**
   * The role the author needs in a community to act. Whoever cannot even read the community gets `nao_encontrado`
   * (it does not exist for that person); whoever reads but does not take part, `nao_e_membro`; the banned, `banido`.
   * @returns {{ com: object, papel: string }}
   */
  requireRole(communityId, author, min = 'membro', field = 'objeto.corpo.comunidade') {
    const using = this.comunidade(communityId)
    if (!using) throw new ProtocolError('nao_encontrado', { campo: field })
    const role = this.papel(using.id, author)
    if (!role) {
      if (using.acesso === 'fechada') throw new ProtocolError('nao_encontrado', { campo: field })
      throw new ProtocolError(this.banido(using.id, author) ? 'banido' : 'nao_e_membro', { campo: field })
    }
    if (ROLES.indexOf(role) < ROLES.indexOf(min)) throw new ProtocolError('sem_permissao', { campo: field })
    return { com: using, papel: role }
  }

  /** Owner and up to 20 moderators, to notify of join requests and appeals. */
  responsible(community) {
    return this.a.todos("SELECT uid FROM membros WHERE comunidade = :comunidade AND papel IN ('dono', 'moderador') ORDER BY CASE papel WHEN 'dono' THEN 0 ELSE 1 END, desde, uid LIMIT 21", { comunidade: community }).map((l) => l.uid)
  }

  // ---------- topics and pages ----------

  topico(id) { return typeof id === 'string' ? this.a.um('SELECT * FROM topicos WHERE id = :id', { id }) : null }

  pagina(id) {
    if (typeof id !== 'string') return null
    const p = this.a.um('SELECT * FROM paginas WHERE id = :id', { id })
    if (!p || p.encerrada_em !== null || this.a.bloqueado('objeto', id)) return null
    return p
  }

  roleOnPage(page, uid) {
    const who = uid ?? null
    const p = this.a.um('SELECT dono FROM paginas WHERE id = :pagina', { pagina: page })
    if (p?.dono === who) return 'dono'
    return this.a.um('SELECT 1 AS n FROM pagina_admins WHERE pagina = :pagina AND uid = :uid', { pagina: page, uid: who }) ? 'administrador' : null
  }

  // ---------- what a reader can read ----------

  /**
   * A topic the reader can open. `nao_encontrado` when the community is closed to them, the author is not visible or the
   * operator blocked it; `removido` (410) when it was deleted or hidden and the reader could read the community.
   * @returns {{ t: object, com: object, obj: object }}
   */
  topicReadable(id, reader, now) {
    const t = this.topico(id)
    const obj = t ? this.a.objeto(id) : null
    const using = t ? this.comunidade(t.comunidade) : null
    if (!t || !using || !this.canReadCommunity(using, reader) || this.a.bloqueado('objeto', id) || !this.roverVisible(t.autor, now)) {
      throw new ProtocolError('nao_encontrado')
    }
    if (obj.removido_em !== null || obj.oculto_em !== null) throw new ProtocolError('removido')
    return { t, com: using, obj }
  }

  /**
   * Is the space (community, topic or page) that contains an object open to this reader? `true` for what does not live in a space.
   * It does not tell deleted from nonexistent: it serves as a filter for lists.
   */
  readableSpace(line, reader) {
    const ctx = line.ctx
    const withId = this.ctxCommunity(ctx)
    if (withId) {
      const using = this.comunidade(withId)
      if (!using || !this.canReadCommunity(using, reader)) return false
      if (ctx !== withId) {
        const o = this.a.objeto(ctx)
        if (!o || o.removido_em !== null || o.oculto_em !== null || this.a.bloqueado('objeto', ctx)) return false
      }
      return true
    }
    if (line.tipo === 'pagina-publicar' || line.tipo === 'pagina-atualizar') return this.pagina(ctx) !== null
    return true
  }

  // ---------- ready-made queries ----------

  contar(sql, params = {}) { return this.a.um(`SELECT COUNT(*) AS n ${sql}`, params).n }

  visibilityParams(now) { return this.rele._visibilityParams(now) }
}
