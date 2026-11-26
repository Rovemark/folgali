// SPDX-License-Identifier: AGPL-3.0-or-later
// Reading for the social layer (0.3): the rover page, friendship, communities, forum, pages, public moderation, notifications.
// Each method says who can read. The rule is single: what the reader cannot see answers `nao_encontrado`, the same as what does not exist.
import {
  VOCABULARY_KEY_RE, ProtocolError, DEFAULT_PAGE, TESTIMONIAL_BADGES, UID_RE, ID_RE, graphShowsCounts, graphShowsLists, REACTIONS_V3
} from '../../protocol/src/index.js'
import { PUBLIC_GRAPH, ROVER_VISIBLE } from './store.js'
import { ACTION_TYPES } from './social-base.js'
import { Search, windowOf } from './social-search.js'
import { isByPeople, invalidOrder, pointsParams, pointsSql } from './social-points.js'
import { TOPIC_SCORE_ORDERS, topicScoreOrder, topWindowDays } from './social-orders.js'

const SNIPPET = 200
const excerpt = (s) => { const c = [...s]; return c.length > SNIPPET ? `${c.slice(0, SNIPPET).join('')}…` : s }
const NO_BLOCKED_AUTHOR = `NOT EXISTS (SELECT 1 FROM relacoes bq WHERE bq.tipo = 'bloqueio' AND bq.autor = :dono AND bq.alvo = o.autor)`

export class Read extends Search {
  // ---------- who reads ----------

  /** The rover that signs the read (or null if no credential came). A present but invalid credential is 401. */
  leitor(credential, now) { return this.rele._reader(credential, now) }

  /** "Own" routes: the path belongs to the rover and only it reads, proving it with the network key. */
  requireOwn(uid, credential, now) {
    if (!UID_RE.test(uid) || !this.roverVisible(uid, now)) {
      this.rele._refuseRevokedRead(credential, now) // the revoked rover itself, with a valid credential, learns why
      throw new ProtocolError('nao_encontrado')
    }
    const l = this.leitor(credential, now)
    if (l === null) throw new ProtocolError('leitura_nao_autorizada')
    if (l !== uid) throw new ProtocolError('sem_permissao')
    return l
  }

  /** The rover in the path, visible, and its graph open to the reader (the rover itself always reads). Also returns the reader. */
  roverWithGraph(uid, credential, now) {
    const r = UID_RE.test(uid) ? this.roverVisible(uid, now) : null
    if (!r) throw new ProtocolError('nao_encontrado')
    const reader = this.leitor(credential, now)
    if (!graphShowsLists(this.rele._policyOf(r).grafo) && reader !== r.uid) throw new ProtocolError('grafo_privado')
    return { r, leitor: reader }
  }

  publicRover(uid, now) {
    const r = UID_RE.test(uid) ? this.roverVisible(uid, now) : null
    if (!r) throw new ProtocolError('nao_encontrado')
    return r
  }

  lista(sql, params, limit, map, key = 'seq') {
    const lines = this.a.todos(sql, { ...params, limite: limit + 1 })
    const page = lines.slice(0, limit)
    return { itens: page.map(map), proximo: lines.length > limit ? page[page.length - 1][key] : null }
  }

  /** List with an offset cursor (orders that have no natural increasing number). */
  listByOffset(sql, params, before, limit, map) {
    const offset = before ?? 0
    const lines = this.a.todos(`${sql} LIMIT :limite OFFSET :desloc`, { ...params, limite: limit + 1, desloc: offset })
    return { itens: lines.slice(0, limit).map(map), proximo: lines.length > limit ? offset + limit : null }
  }

  // ====================================================================================================
  // CARDS
  // ====================================================================================================

  versaoAtual(versionId) {
    const l = this.a.objeto(versionId)
    return l?.envelope ? JSON.parse(l.envelope) : null
  }

  communityCard(c) {
    return {
      id: c.id,
      nome: c.nome,
      descricao: c.descricao,
      tema: c.tema,
      acesso: c.acesso,
      membros: this.contar('FROM membros WHERE comunidade = :id', { id: c.id }),
      topicos: this.contar("FROM topicos t JOIN objetos o ON o.id = t.id WHERE t.comunidade = :id AND o.removido_em IS NULL AND o.oculto_em IS NULL", { id: c.id }),
      criadaEm: c.criada_em,
      atividadeEm: c.atividade_em,
      categorias: JSON.parse(c.categorias),
      // 0.7.0, additive: only appears on a community marked 18+ (whoever reads without knowing the field gets the same as before)
      ...(c.adulto ? { adulto: true } : {})
    }
  }

  topicCard(t) {
    const replies = this.contar("FROM objetos WHERE tipo = 'resposta-forum' AND ctx = :id AND removido_em IS NULL AND oculto_em IS NULL", { id: t.id })
    return {
      id: t.id,
      comunidade: t.comunidade,
      categoria: t.categoria,
      titulo: t.titulo,
      trecho: excerpt(t.texto),
      autor: this.resumo(t.autor),
      criadoEm: t.criado_em,
      atividadeEm: t.atividade_em,
      respostas: replies,
      fixado: t.fixado === 1,
      trancado: t.trancado === 1,
      resolvido: t.resolvido_resposta !== null,
      tags: JSON.parse(t.tags),
      enquete: t.enquete !== null,
      editado: t.versoes > 1,
      // 0.3.2: only when the topic has marks, so the card of a topic without marks is identical to the 0.3.1 one
      ...this.marksOf(t),
      // 0.10.0: arrow counts only when someone voted (a topic without votes reads as before)
      ...this.arrowExtra(t.id)
    }
  }

  /** 0.10.0 (proposal 0012): `{ setas }` and `{ minhaSeta }` only when there is something to say. */
  arrowExtra(id, reader = null) {
    const arrows = this.arrowsOf(id)
    const mine = this.minhaSeta(id, reader)
    return { ...(arrows ? { setas: arrows } : {}), ...(mine ? { minhaSeta: mine } : {}) }
  }

  /** `{ marcas: { etiquetas, status } }` when the topic has marks, or nothing (the keys; the label and color come from the community vocabulary). */
  marksOf(t) {
    const labels = t.etiquetas ? JSON.parse(t.etiquetas) : []
    const status = t.status ?? null
    return labels.length > 0 || status !== null ? { marcas: { etiquetas: labels, status } } : {}
  }

  pageCard(p) {
    return {
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      tema: p.tema,
      dono: this.resumo(p.dono),
      seguidores: this.contar(`FROM pagina_seguidores s JOIN rovers r ON r.uid = s.uid WHERE s.pagina = :id AND ${ROVER_VISIBLE} AND ${PUBLIC_GRAPH}`, { id: p.id, ...this.visibilityParams(this.agora()) }),
      criadaEm: p.criada_em,
      atividadeEm: p.atividade_em
    }
  }

  // ====================================================================================================
  // ROVER PAGE
  // ====================================================================================================

  badgeCount(uid, now) {
    const lines = this.a.todos(
      `SELECT o.sub AS selo, COUNT(DISTINCT o.autor) AS n FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'selo' AND o.alvo = :uid AND o.removido_em IS NULL AND ${ROVER_VISIBLE}
         AND EXISTS (SELECT 1 FROM amizades am WHERE am.estado = 'ativa' AND am.par = CASE WHEN o.autor < o.alvo THEN o.autor || '|' || o.alvo ELSE o.alvo || '|' || o.autor END)
         AND NOT EXISTS (SELECT 1 FROM relacoes b WHERE b.tipo = 'bloqueio' AND ((b.autor = o.autor AND b.alvo = o.alvo) OR (b.autor = o.alvo AND b.alvo = o.autor)))
       GROUP BY o.sub`,
      { uid, ...this.visibilityParams(now) }
    )
    const map = Object.fromEntries(TESTIMONIAL_BADGES.map((s) => [s, 0]))
    for (const l of lines) if (l.selo in map) map[l.selo] = l.n
    return map
  }

  /** Friends that appear in a list: visible and with a public graph (the rover itself sees all of its own). */
  _friendsSql(own) {
    return `FROM amizades am JOIN rovers r ON r.uid = CASE WHEN am.de = :uid THEN am.para ELSE am.de END
      WHERE am.estado = 'ativa' AND (am.de = :uid OR am.para = :uid) AND ${ROVER_VISIBLE}${own ? '' : ` AND ${PUBLIC_GRAPH}`}`
  }

  _communitiesSql(own) {
    return `FROM membros m JOIN comunidades c ON c.id = m.comunidade
      WHERE m.uid = :uid AND c.encerrada_em IS NULL AND c.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')${own ? '' : " AND c.acesso <> 'fechada'"}`
  }

  _pagesSql() {
    return `FROM paginas pg WHERE pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
      AND (pg.id IN (SELECT pagina FROM pagina_seguidores WHERE uid = :uid) OR pg.id IN (SELECT pagina FROM pagina_admins WHERE uid = :uid))`
  }

  // ====================================================================================================
  // 0.3.1: HELPERS (proposal 0006)
  // ====================================================================================================

  /** The topic an object (that exists) leads to: the topic itself, or the topic of a forum reply. `null` for the rest. */
  targetTopic(line) {
    if (line.tipo === 'topico') return line.id
    if (line.tipo === 'resposta-forum') return line.ctx
    return null
  }

  /**
   * Live reactions to an object, from those who are visible. Never the list of who reacted. `curtir` and `util` always come (as before 0.8.0);
   * 0.8.0: `amei`, `haha`, `uau` and `abraco` come in only when there are any, so an object without them answers the same as before, byte for byte.
   */
  reactionsOf(id, now) {
    const map = { curtir: 0, util: 0 }
    for (const l of this.a.todos(
      `SELECT json_extract(o.envelope, '$.objeto.corpo.reacao') AS k, COUNT(*) AS n FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'reacao' AND o.alvo = :id AND o.removido_em IS NULL AND ${ROVER_VISIBLE} GROUP BY k`,
      { id, ...this.visibilityParams(now) }
    )) if (REACTIONS_V3.includes(l.k)) map[l.k] = l.n
    return map
  }

  /** The reader's reaction to an object (`null` with no reader or no reaction). */
  minhaReacao(id, reader) {
    if (reader === null || reader === undefined) return null
    const l = this.a.um(
      "SELECT json_extract(envelope, '$.objeto.corpo.reacao') AS k FROM objetos WHERE tipo = 'reacao' AND autor = :autor AND alvo = :id AND removido_em IS NULL",
      { autor: reader, id }
    )
    return l?.k ?? null
  }

  /** Live replies to a post or to a reply, from those who are visible. */
  repliesTo(id, now) {
    return this.contar(
      `FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'resposta' AND o.alvo = :id AND o.removido_em IS NULL AND o.oculto_em IS NULL
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND ${ROVER_VISIBLE}`,
      { id, ...this.visibilityParams(now) }
    )
  }

  /** 0.10.0: `{ setas: { acima, abaixo } }` inside `contagens`, only when someone voted. */
  arrowCount(id) {
    const arrows = this.arrowsOf(id)
    return arrows ? { setas: arrows } : {}
  }

  /** 0.10.0: `{ minhaSeta }` only when the reader voted. */
  myArrowExtra(id, reader) {
    const mine = this.minhaSeta(id, reader)
    return mine ? { minhaSeta: mine } : {}
  }

  /** The item of the "complete" list (proposal 0006, section 15.4): the envelope with author, page, counts and the reader's reaction. */
  fullItem(line, reader, now) {
    const env = JSON.parse(line.envelope)
    const page = line.tipo === 'pagina-publicar' ? this.a.um('SELECT id, nome FROM paginas WHERE id = :id', { id: line.ctx }) : null
    return {
      tipo: line.tipo,
      envelope: env,
      autor: this.resumo(line.autor),
      pagina: page ? { id: page.id, nome: page.nome } : null,
      contagens: { respostas: line.tipo === 'postagem' ? this.repliesTo(line.id, now) : 0, reacoes: this.reactionsOf(line.id, now), ...this.arrowCount(line.id) },
      minhaReacao: this.minhaReacao(line.id, reader),
      // 0.10.0: the reader's arrow, only when there is one
      ...this.myArrowExtra(line.id, reader),
      // 0.5.0: `imagens` only with media on and only when the post has a live attachment
      ...(this.rele.midia ? this.rele.midia.itemExtra(line, now) : {}),
      // 0.11.0 part 2: `edicao` (what it says now), only when it was edited
      ...this.rele.edicoes.itemExtra(line)
    }
  }

  paginaDoRover(uid, { credencial: credential = null } = {}) {
    this.rele._sync()
    const now = this.agora()
    const r = UID_RE.test(uid) ? this.roverVisible(uid, now) : null
    if (!r) throw new ProtocolError('nao_encontrado')
    const reader = this.leitor(credential, now)
    const graph = this.rele._policyOf(r).grafo
    const own = reader === r.uid
    const countable = own || graphShowsCounts(graph)
    const p = { uid }
    const account = (sql, params = p) => (countable ? this.contar(sql, params) : null)
    const pending = reader === null ? null : this.amizade(reader, uid)
    const follow = countable ? this.rele._followCount(uid, now) : { seguindo: null, seguidores: null }
    return {
      rover: this.rele.perfil(uid),
      selos: this.badgeCount(uid, now),
      contagens: {
        amigos: account(this._friendsSql(own), { uid, ...this.visibilityParams(now) }),
        comunidades: account(this._communitiesSql(own)),
        paginas: account(this._pagesSql()),
        seguidores: follow.seguidores,
        seguindo: follow.seguindo,
        recados: this.contar(`FROM objetos o JOIN rovers r ON r.uid = o.autor WHERE o.tipo = 'recado' AND o.alvo = :dono AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIBLE} AND ${NO_BLOCKED_AUTHOR}`, { dono: uid, ...this.visibilityParams(now) }),
        depoimentos: this.contar("FROM objetos WHERE tipo = 'depoimento' AND alvo = :uid AND estado = 'aceito' AND removido_em IS NULL AND oculto_em IS NULL", p),
        entregas: this.contar("FROM objetos WHERE tipo = 'entrega' AND autor = :uid AND removido_em IS NULL", p)
      },
      voce: reader === null ? null : {
        amigo: pending?.estado === 'ativa',
        pedidoEnviado: pending?.estado === 'pendente' && pending.de === reader,
        pedidoRecebido: pending?.estado === 'pendente' && pending.para === reader,
        euBloqueei: this.euBloqueei(reader, uid),
        euSilenciei: this.euSilenciei(reader, uid),
        papel: own ? 'proprio' : null,
        amigoDesde: pending?.estado === 'ativa' ? pending.atualizado_em : null,
        contaDesde: this.a.rover(reader).criado_em,
        selosQueDei: this.a.todos("SELECT sub FROM objetos WHERE tipo = 'selo' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL ORDER BY seq", { autor: reader, alvo: uid }).map((l) => l.sub)
      }
    }
  }

  recados(uid, { antes: before = null, limite: limit = DEFAULT_PAGE }) {
    this.rele._sync()
    const now = this.agora()
    this.publicRover(uid, now)
    return this.lista(
      `SELECT o.seq, o.envelope, o.autor FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'recado' AND o.alvo = :dono AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIBLE} AND ${NO_BLOCKED_AUTHOR}
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND (:antes IS NULL OR o.seq < :antes)
       ORDER BY o.seq DESC LIMIT :limite`,
      { dono: uid, antes: before, ...this.visibilityParams(now) }, limit, (l) => ({ envelope: JSON.parse(l.envelope), autor: this.resumo(l.autor) })
    )
  }

  depoimentos(uid, { antes: before = null, limite: limit = DEFAULT_PAGE, estado: state = 'aceitos', credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    if (!['aceitos', 'pendentes', 'enviados'].includes(state)) throw new ProtocolError('esquema', { campo: 'estado', detalhe: 'Parâmetro estado: aceitos, pendentes ou enviados.' })
    if (state === 'pendentes' || state === 'enviados') this.requireOwn(uid, credential, now)
    else this.publicRover(uid, now)
    this.leitor(credential, now)
    if (state === 'enviados') {
      // 0.3.1: the author reads what they wrote and still awaits a decision (the recipient must stay visible and with no block between the two).
      return this.lista(
        `SELECT o.seq, o.envelope, o.alvo, o.estado FROM objetos o JOIN rovers r ON r.uid = o.alvo
         WHERE o.tipo = 'depoimento' AND o.autor = :uid AND o.estado = 'pendente' AND o.removido_em IS NULL AND o.oculto_em IS NULL
           AND ${ROVER_VISIBLE} AND NOT EXISTS (SELECT 1 FROM relacoes b WHERE b.tipo = 'bloqueio' AND ((b.autor = o.autor AND b.alvo = o.alvo) OR (b.autor = o.alvo AND b.alvo = o.autor)))
           AND (:antes IS NULL OR o.seq < :antes)
         ORDER BY o.seq DESC LIMIT :limite`,
        { uid, antes: before, ...this.visibilityParams(now) }, limit, (l) => ({ envelope: JSON.parse(l.envelope), alvo: this.resumo(l.alvo), estado: l.estado })
      )
    }
    return this.lista(
      `SELECT o.seq, o.envelope, o.autor, o.estado, o.estado_em FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'depoimento' AND o.alvo = :dono AND o.estado = :estado AND o.removido_em IS NULL AND o.oculto_em IS NULL
         AND ${ROVER_VISIBLE} AND ${NO_BLOCKED_AUTHOR} AND (:antes IS NULL OR o.seq < :antes)
       ORDER BY o.seq DESC LIMIT :limite`,
      { dono: uid, antes: before, estado: state === 'aceitos' ? 'aceito' : 'pendente', ...this.visibilityParams(now) }, limit,
      (l) => ({ envelope: JSON.parse(l.envelope), autor: this.resumo(l.autor), estado: l.estado, ...(l.estado === 'aceito' ? { aceitoEm: l.estado_em } : {}) })
    )
  }

  selos(uid) {
    this.rele._sync()
    const now = this.agora()
    this.publicRover(uid, now)
    return { selos: this.badgeCount(uid, now) }
  }

  entregas(uid, { antes: before = null, limite: limit = DEFAULT_PAGE }) {
    this.rele._sync()
    const now = this.agora()
    this.publicRover(uid, now)
    return this.lista(
      `SELECT o.seq, o.envelope FROM objetos o WHERE o.tipo = 'entrega' AND o.autor = :uid AND o.removido_em IS NULL AND o.oculto_em IS NULL
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND (:antes IS NULL OR o.seq < :antes)
       ORDER BY o.seq DESC LIMIT :limite`,
      { uid, antes: before }, limit, (l) => JSON.parse(l.envelope)
    )
  }

  amigos(uid, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const { r, leitor: reader } = this.roverWithGraph(uid, credential, now)
    return this.lista(
      `SELECT am.rowid AS seq, r.uid AS amigo, am.atualizado_em AS desde ${this._friendsSql(reader === r.uid)} AND (:antes IS NULL OR am.rowid < :antes) ORDER BY am.rowid DESC LIMIT :limite`,
      { uid, antes: before, ...this.visibilityParams(now) }, limit, (l) => ({ rover: this.resumo(l.amigo), desde: l.desde })
    )
  }

  amigosEmComum(uid, using, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    if (!UID_RE.test(using ?? '') || using === uid) throw new ProtocolError('esquema', { campo: 'com', detalhe: 'Parâmetro com: informe o uid de outro rover.' })
    const a = this.publicRover(uid, now)
    const b = this.publicRover(using, now)
    const reader = this.leitor(credential, now)
    // Each end shows its own edges only if the graph is public, or if the reader is that end itself.
    for (const tip of [a, b]) if (reader !== tip.uid && !graphShowsLists(this.rele._policyOf(tip).grafo)) throw new ProtocolError('grafo_privado')
    return this.lista(
      `SELECT am.rowid AS seq, r.uid AS amigo
       FROM amizades am JOIN rovers r ON r.uid = CASE WHEN am.de = :uid THEN am.para ELSE am.de END
       WHERE am.estado = 'ativa' AND (am.de = :uid OR am.para = :uid) AND ${ROVER_VISIBLE}
         AND (r.uid = :leitor OR (${PUBLIC_GRAPH}))
         AND EXISTS (SELECT 1 FROM amizades bm WHERE bm.estado = 'ativa' AND bm.par = CASE WHEN r.uid < :com THEN r.uid || '|' || :com ELSE :com || '|' || r.uid END)
         AND (:antes IS NULL OR am.rowid < :antes)
       ORDER BY am.rowid DESC LIMIT :limite`,
      { uid, com: using, leitor: reader ?? '', antes: before, ...this.visibilityParams(now) }, limit, (l) => this.resumo(l.amigo)
    )
  }

  comunidadesDoRover(uid, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const { r, leitor: reader } = this.roverWithGraph(uid, credential, now)
    return this.lista(
      `SELECT c.seq AS seq, c.*, m.papel AS papel_no ${this._communitiesSql(reader === r.uid)} AND (:antes IS NULL OR c.seq < :antes) ORDER BY c.seq DESC LIMIT :limite`,
      { uid, antes: before }, limit, (l) => ({ comunidade: this.communityCard(l), papel: l.papel_no })
    )
  }

  paginasDoRover(uid, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    this.roverWithGraph(uid, credential, now)
    return this.lista(
      `SELECT pg.seq AS seq, pg.* ${this._pagesSql()} AND (:antes IS NULL OR pg.seq < :antes) ORDER BY pg.seq DESC LIMIT :limite`,
      { uid, antes: before }, limit,
      (l) => ({ pagina: this.pageCard(l), relacao: l.dono === uid ? 'dono' : this.roleOnPage(l.id, uid) ?? 'seguidor' })
    )
  }

  amizadesPendentes(uid, credential) {
    this.rele._sync()
    const now = this.agora()
    this.requireOwn(uid, credential, now)
    const map = (field) => (l) => ({ rover: this.resumo(l[field]), em: l.criado_em })
    return {
      recebidos: this.a.todos("SELECT de, criado_em FROM amizades WHERE estado = 'pendente' AND para = :uid ORDER BY criado_em DESC LIMIT 100", { uid }).map(map('de')),
      enviados: this.a.todos("SELECT para, criado_em FROM amizades WHERE estado = 'pendente' AND de = :uid ORDER BY criado_em DESC LIMIT 50", { uid }).map(map('para'))
    }
  }

  roverInvites(uid, credential) {
    this.rele._sync()
    const now = this.agora()
    this.requireOwn(uid, credential, now)
    const lines = this.a.todos('SELECT * FROM convites WHERE uid = :uid ORDER BY em DESC LIMIT 50', { uid })
    return {
      itens: lines.flatMap((cv) => {
        const c = this.comunidade(cv.comunidade)
        return c ? [{ comunidade: { id: c.id, nome: c.nome, descricao: c.descricao, acesso: c.acesso }, por: this.resumo(cv.por), em: cv.em }] : []
      }),
      proximo: null
    }
  }

  relacoes(uid, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    this.requireOwn(uid, credential, this.agora())
    return this.lista(
      'SELECT rowid AS seq, alvo, tipo, em FROM relacoes WHERE autor = :uid AND (:antes IS NULL OR rowid < :antes) ORDER BY rowid DESC LIMIT :limite',
      { uid, antes: before }, limit, (l) => ({ rover: this.resumo(l.alvo), relacao: l.tipo, desde: l.em })
    )
  }

  notificationsOf(uid, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    this.requireOwn(uid, credential, now)
    return this.listar(uid, { antes: before, limite: limit }, now)
  }

  contagemDeNotificacoes(uid, { desde: since = 0, credencial: credential = null }) {
    this.rele._sync()
    this.requireOwn(uid, credential, this.agora())
    return { novas: this.contagem(uid, since) }
  }

  // ====================================================================================================
  // COMMUNITIES
  // ====================================================================================================

  /** The community the reader opens. Closed: members only (a guest reads the minimal card). */
  readableCommunity(id, reader, { allowInvite = false } = {}) {
    const c = this.comunidade(id)
    if (!c) throw new ProtocolError('nao_encontrado')
    if (this.canReadCommunity(c, reader)) return { c, minimo: false }
    if (allowInvite && this.convidado(c.id, reader)) return { c, minimo: true }
    throw new ProtocolError('nao_encontrado')
  }

  listedCommunities({ tema: theme = null, acesso: access = null, ordem: order = 'recentes', antes: before = null, limite: limit = DEFAULT_PAGE }) {
    this.rele._sync()
    if (access !== null && !['aberta', 'moderada'].includes(access)) throw new ProtocolError('esquema', { campo: 'acesso', detalhe: 'Parâmetro acesso: aberta ou moderada.' })
    if (!['recentes', 'ativas'].includes(order)) throw new ProtocolError('esquema', { campo: 'ordem', detalhe: 'Parâmetro ordem: recentes ou ativas.' })
    const column = order === 'ativas' ? 'atividade_seq' : 'seq'
    return this.lista(
      `SELECT c.*, c.${column} AS cursor FROM comunidades c
       WHERE c.acesso <> 'fechada' AND c.encerrada_em IS NULL AND c.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         AND (:tema IS NULL OR c.tema = :tema) AND (:acesso IS NULL OR c.acesso = :acesso) AND (:antes IS NULL OR c.${column} < :antes)
       ORDER BY c.${column} DESC LIMIT :limite`,
      { tema: theme, acesso: access, antes: before }, limit, (c) => this.communityCard(c), 'cursor'
    )
  }

  communityDetail(id, { credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const reader = this.leitor(credential, now)
    const { c, minimo: min } = this.readableCommunity(id, reader, { allowInvite: true })
    const role = this.papel(c.id, reader)
    const you = reader === null ? null : {
      papel: role,
      pedidoPendente: this.a.um('SELECT 1 AS n FROM pedidos_de_entrada WHERE comunidade = :c AND uid = :u', { c: c.id, u: reader }) !== null,
      convidado: this.convidado(c.id, reader),
      banido: this.banido(c.id, reader),
      banidoEm: this.a.um('SELECT em FROM banidos WHERE comunidade = :c AND uid = :u', { c: c.id, u: reader })?.em ?? null,
      membroDesde: this.a.um('SELECT desde FROM membros WHERE comunidade = :c AND uid = :u', { c: c.id, u: reader })?.desde ?? null
    }
    if (min) return { id: c.id, nome: c.nome, descricao: c.descricao, acesso: c.acesso, voce: you }
    return {
      ...this.communityCard(c),
      regras: c.regras,
      dono: this.resumo(c.dono),
      moderadores: this.contar("FROM membros WHERE comunidade = :c AND papel = 'moderador'", { c: c.id }),
      envelope: this.versaoAtual(c.versao_id),
      voce: you,
      // 0.3.2: the vocabulary of labels and statuses (the protocol default when it never defined a status)
      vocabulario: this.vocabularyOf(c)
    }
  }

  requireModerator(id, credential, now) {
    const reader = this.leitor(credential, now)
    const c = this.comunidade(id)
    const role = c && reader ? this.papel(c.id, reader) : null
    if (!c) throw new ProtocolError('nao_encontrado')
    if (reader === null) {
      if (c.acesso === 'fechada') throw new ProtocolError('nao_encontrado')
      throw new ProtocolError('leitura_nao_autorizada')
    }
    if (!role) throw new ProtocolError(c.acesso === 'fechada' ? 'nao_encontrado' : 'sem_permissao')
    if (role === 'membro') throw new ProtocolError('sem_permissao')
    return { c, leitor: reader, papel: role }
  }

  membersOf(id, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const reader = this.leitor(credential, now)
    const { c } = this.readableCommunity(id, reader)
    const moderator = ['dono', 'moderador'].includes(this.papel(c.id, reader))
    return this.listByOffset(
      `SELECT m.uid AS uid, m.papel AS papel, m.desde AS desde FROM membros m JOIN rovers r ON r.uid = m.uid
       WHERE m.comunidade = :c AND ${ROVER_VISIBLE} AND (:moderador = 1 OR m.uid = :leitor OR (${PUBLIC_GRAPH}))
       ORDER BY CASE m.papel WHEN 'dono' THEN 0 WHEN 'moderador' THEN 1 ELSE 2 END, m.desde, m.uid`,
      { c: c.id, moderador: moderator ? 1 : 0, leitor: reader ?? '', ...this.visibilityParams(now) }, before, limit,
      (l) => ({ rover: this.resumo(l.uid), papel: l.papel, desde: l.desde })
    )
  }

  pedidosDe(id, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const { c } = this.requireModerator(id, credential, this.agora())
    return this.listByOffset('SELECT uid, em FROM pedidos_de_entrada WHERE comunidade = :c ORDER BY em, uid', { c: c.id }, before, limit, (l) => ({ rover: this.resumo(l.uid), em: l.em }))
  }

  convitesDa(id, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const { c } = this.requireModerator(id, credential, this.agora())
    return this.listByOffset('SELECT uid, por, em FROM convites WHERE comunidade = :c ORDER BY em, uid', { c: c.id }, before, limit, (l) => ({ rover: this.resumo(l.uid), por: this.resumo(l.por), em: l.em }))
  }

  banidosDa(id, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const { c } = this.requireModerator(id, credential, this.agora())
    return this.listByOffset(
      'SELECT uid, motivo, papel_de_quem_baniu AS por, em, apelacao FROM banidos WHERE comunidade = :c ORDER BY em DESC, uid', { c: c.id }, before, limit,
      (l) => ({ rover: this.resumo(l.uid), motivo: l.motivo, por: l.por, em: l.em, apelacao: l.apelacao })
    )
  }

  // ====================================================================================================
  // FORUM
  // ====================================================================================================

  topicsOf(id, { categoria: category = null, tag = null, status = null, etiqueta: label = null, ordem: order = 'recentes', janela: window = null, antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const reader = this.leitor(credential, now)
    const { c } = this.readableCommunity(id, reader)
    // 0.10.0: quentes, top and comentados walk the score rows (social-karma.js)
    const orders = ['recentes', 'ativos', 'sem-resposta', 'melhores', 'em-alta', ...TOPIC_SCORE_ORDERS]
    if (!orders.includes(order)) throw invalidOrder(orders)
    if (tag !== null && !/^[a-z0-9][a-z0-9-]{1,23}$/.test(tag)) throw new ProtocolError('esquema', { campo: 'tag', detalhe: 'Parâmetro tag: uma tag válida.' })
    if (status !== null && !VOCABULARY_KEY_RE.test(status)) throw new ProtocolError('esquema', { campo: 'status', detalhe: 'Parâmetro status: uma chave do vocabulário.' })
    if (label !== null && !VOCABULARY_KEY_RE.test(label)) throw new ProtocolError('esquema', { campo: 'etiqueta', detalhe: 'Parâmetro etiqueta: uma chave do vocabulário.' })
    const byPeople = isByPeople(order)
    const duration = order === 'em-alta' ? windowOf(window) : null
    const column = order === 'ativos' ? 'atividade_seq' : 'seq'
    const base = `FROM topicos t JOIN objetos o ON o.id = t.id JOIN rovers r ON r.uid = t.autor LEFT JOIN placar pl ON pl.id = t.id
      WHERE t.comunidade = :c AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIBLE}
        AND t.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
        AND (:categoria IS NULL OR (:categoria = '-' AND t.categoria IS NULL) OR t.categoria = :categoria)
        AND (:tag IS NULL OR EXISTS (SELECT 1 FROM tags_uso tu WHERE tu.objeto = t.id AND tu.tag = :tag))
        AND (:status IS NULL OR t.status = :status)
        AND (:etiqueta IS NULL OR EXISTS (SELECT 1 FROM json_each(t.etiquetas) je WHERE je.value = :etiqueta))
        ${order === 'sem-resposta' ? "AND NOT EXISTS (SELECT 1 FROM objetos x WHERE x.tipo = 'resposta-forum' AND x.ctx = t.id AND x.removido_em IS NULL AND x.oculto_em IS NULL)" : ''}`
    const p = { c: c.id, categoria: category, tag, status, etiqueta: label, ...this.visibilityParams(now) }
    let page
    if (TOPIC_SCORE_ORDERS.includes(order)) {
      const days = order === 'quentes' ? null : topWindowDays(window)
      page = this.listByOffset(
        `SELECT t.* ${base} AND t.fixado = 0 AND (:corte IS NULL OR t.criado_em >= :corte)
         ORDER BY ${topicScoreOrder(order)}, t.seq DESC`,
        { ...p, corte: days === null ? null : now - days * 86400 }, before, limit, (t) => this.topicCard(t)
      )
    } else if (byPeople) {
      const points = pointsSql({ alias: 't', tipoResposta: 'resposta-forum', colunaResposta: 'ctx', janela: duration !== null })
      page = this.listByOffset(
        `SELECT t.* ${base} AND t.fixado = 0 ORDER BY ${points} DESC, t.atividade_seq DESC`,
        pointsParams(p, now, duration), before, limit, (t) => this.topicCard(t)
      )
    } else {
      page = this.lista(
        `SELECT t.*, t.${column} AS cursor ${base} AND t.fixado = 0 AND (:antes IS NULL OR t.${column} < :antes) ORDER BY t.${column} DESC LIMIT :limite`,
        { ...p, antes: before }, limit, (t) => this.topicCard(t), 'cursor'
      )
    }
    if (before === null) {
      page.fixados = this.a.todos(`SELECT t.* ${base} AND t.fixado = 1 ORDER BY t.seq DESC LIMIT 10`, p).map((t) => this.topicCard(t))
    }
    return page
  }

  topicDetail(id, { credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const reader = this.leitor(credential, now)
    const { t, com: using } = this.topicReadable(id, reader, now)
    const rawPoll = t.enquete ? JSON.parse(t.enquete) : null
    let poll = null
    if (rawPoll) {
      const votes = Object.fromEntries(this.a.todos('SELECT opcao, COUNT(*) AS n FROM votos WHERE topico = :t GROUP BY opcao', { t: t.id }).map((l) => [l.opcao, l.n]))
      const mine = reader ? this.a.um('SELECT opcao FROM votos WHERE topico = :t AND uid = :uid', { t: t.id, uid: reader }) : null
      poll = {
        opcoes: rawPoll.opcoes.map((text, i) => ({ texto: text, votos: votes[i] ?? 0 })),
        encerraEm: rawPoll.encerraEm,
        encerrada: now >= rawPoll.encerraEm,
        total: Object.values(votes).reduce((s, n) => s + n, 0),
        voce: mine ? mine.opcao : null
      }
    }
    const last = this.a.um("SELECT id FROM objetos WHERE tipo = 'topico-editar' AND ctx = :id AND removido_em IS NULL ORDER BY seq DESC LIMIT 1", { id: t.id })
    const resolvedBy = t.resolvido_resposta ? { resposta: t.resolvido_resposta, por: this.resumo(t.resolvido_por), em: t.resolvido_em } : null
    return {
      ...this.topicCard(t),
      texto: t.texto,
      envelope: JSON.parse(this.a.objeto(last?.id ?? t.id).envelope),
      comunidadeNome: using.nome,
      resolvidoPor: resolvedBy,
      enquete: poll,
      versoes: t.versoes,
      reacoes: this.reactionsOf(t.id, now),
      minhaReacao: this.minhaReacao(t.id, reader),
      ...this.arrowExtra(t.id, reader),
      // 0.11.0: `imagens` (and `anexosRemovidos`) of the topic, only with media on and only when there is something
      ...this.mediaExtra({ tipo: 'topico', id: t.id }, now),
      // 0.11.0 part 2: the edit mark (the current text is already in `titulo` and `texto`)
      ...this.rele.edicoes.itemExtra({ tipo: 'topico', id: t.id })
    }
  }

  /** 0.11.0 (proposal 0013): the attachment fields of an item (`imagens`, `anexosRemovidos`); nothing with media off. */
  mediaExtra(line, now) {
    return this.rele.midia ? this.rele.midia.itemExtra(line, now) : {}
  }

  _forumReply(l) {
    const env = JSON.parse(l.envelope)
    const c = env.objeto.corpo
    let quotes = null
    if (c.cita) {
      const quoted = this.a.objeto(c.cita)
      const live = quoted && quoted.removido_em === null && quoted.oculto_em === null && quoted.envelope !== null
      quotes = { id: c.cita, autor: this.resumo(quoted?.autor ?? ''), trecho: live ? excerpt(JSON.parse(quoted.envelope).objeto.corpo.texto) : null }
    }
    const reactions = Object.fromEntries(['curtir', 'util'].map((k) => [k, 0]))
    for (const r of this.a.todos(
      "SELECT json_extract(envelope, '$.objeto.corpo.reacao') AS k, COUNT(*) AS n FROM objetos WHERE tipo = 'reacao' AND alvo = :id AND removido_em IS NULL GROUP BY k", { id: l.id }
    )) if (r.k in reactions) reactions[r.k] = r.n
    const resolved = this.a.um('SELECT 1 AS n FROM topicos WHERE id = :t AND resolvido_resposta = :id', { t: l.ctx, id: l.id }) !== null
    return {
      id: l.id,
      envelope: env,
      autor: this.resumo(l.autor),
      criadoEm: l.criado_em,
      em: c.em,
      cita: quotes,
      filhas: this.contar("FROM objetos WHERE tipo = 'resposta-forum' AND alvo = :id AND removido_em IS NULL AND oculto_em IS NULL", { id: l.id }),
      resolveu: resolved,
      reacoes: reactions,
      ...this.arrowExtra(l.id),
      ...this.mediaExtra(l, this.agora()),
      ...this.rele.edicoes.itemExtra(l)
    }
  }

  repliesOf(id, { em: at = null, antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null, ordem: order = 'antigas', janela: window = null }) {
    this.rele._sync()
    const now = this.agora()
    const reader = this.leitor(credential, now)
    const accepted = ['antigas', 'recentes', 'melhores', 'em-alta']
    if (!accepted.includes(order)) throw invalidOrder(accepted)
    const { t } = this.topicReadable(id, reader, now)
    let parentId = t.id
    if (at !== null) {
      const parent = ID_RE.test(at) ? this.a.objeto(at) : null
      if (!parent || parent.tipo !== 'resposta-forum' || parent.ctx !== t.id || parent.alvo !== t.id) throw new ProtocolError('nao_encontrado')
      if (parent.removido_em !== null || parent.oculto_em !== null) throw new ProtocolError('removido')
      parentId = parent.id
    }
    const visible = `FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'resposta-forum' AND o.ctx = :t AND o.alvo = :pai AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIBLE}
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')`
    if (isByPeople(order)) {
      const duration = order === 'em-alta' ? windowOf(window) : null
      const points = pointsSql({ alias: 'o', tipoResposta: 'resposta-forum', colunaResposta: 'alvo', janela: duration !== null })
      return this.listByOffset(
        `SELECT o.* ${visible} ORDER BY ${points} DESC, o.seq DESC`,
        pointsParams({ t: t.id, pai: parentId, ...this.visibilityParams(now) }, now, duration), before, limit, (l) => this._forumReply(l)
      )
    }
    return this.lista(
      `SELECT o.* ${visible} AND (:antes IS NULL OR o.seq ${order === 'recentes' ? '<' : '>'} :antes)
       ORDER BY o.seq ${order === 'recentes' ? 'DESC' : 'ASC'} LIMIT :limite`,
      { t: t.id, pai: parentId, antes: before, ...this.visibilityParams(now) }, limit, (l) => this._forumReply(l)
    )
  }

  historyOf(id, { credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const { t } = this.topicReadable(id, this.leitor(credential, now), now)
    const editions = this.a.todos("SELECT envelope, criado_em FROM objetos WHERE tipo = 'topico-editar' AND ctx = :id AND removido_em IS NULL AND envelope IS NOT NULL ORDER BY seq", { id: t.id })
    const original = this.a.objeto(t.id)
    const all = [{ envelope: original.envelope, criado_em: original.criado_em }, ...editions]
    return { itens: all.map((l, i) => ({ versao: i + 1, envelope: JSON.parse(l.envelope), criadoEm: l.criado_em })) }
  }

  // ====================================================================================================
  // PAGES
  // ====================================================================================================

  listedPages({ tema: theme = null, ordem: order = 'recentes', antes: before = null, limite: limit = DEFAULT_PAGE }) {
    this.rele._sync()
    if (!['recentes', 'ativas'].includes(order)) throw new ProtocolError('esquema', { campo: 'ordem', detalhe: 'Parâmetro ordem: recentes ou ativas.' })
    const column = order === 'ativas' ? 'atividade_seq' : 'seq'
    return this.lista(
      `SELECT pg.*, pg.${column} AS cursor FROM paginas pg
       WHERE pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         AND (:tema IS NULL OR pg.tema = :tema) AND (:antes IS NULL OR pg.${column} < :antes)
       ORDER BY pg.${column} DESC LIMIT :limite`,
      { tema: theme, antes: before }, limit, (p) => this.pageCard(p), 'cursor'
    )
  }

  _readablePage(id) {
    const p = this.pagina(id)
    if (!p) throw new ProtocolError('nao_encontrado')
    return p
  }

  pageDetail(id, { credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const reader = this.leitor(credential, now)
    const p = this._readablePage(id)
    return {
      ...this.pageCard(p),
      administradores: this.a.todos('SELECT uid FROM pagina_admins WHERE pagina = :id ORDER BY desde, uid', { id: p.id }).map((l) => this.resumo(l.uid)),
      envelope: this.versaoAtual(p.versao_id),
      voce: reader === null ? null : {
        segue: this.a.um('SELECT 1 AS n FROM pagina_seguidores WHERE pagina = :id AND uid = :uid', { id: p.id, uid: reader }) !== null,
        papel: this.roleOnPage(p.id, reader)
      }
    }
  }

  communityUpdates(id, { antes: before = null, limite: limit = DEFAULT_PAGE, completo: complete = false, credencial: credential = null }) {
    this.rele._sync()
    const p = this._readablePage(id)
    const now = this.agora()
    const reader = complete ? this.leitor(credential, now) : null
    return this.lista(
      `SELECT o.seq, o.id, o.tipo, o.autor, o.ctx, o.envelope FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'pagina-publicar' AND o.ctx = :id AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIBLE}
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND (:antes IS NULL OR o.seq < :antes)
       ORDER BY o.seq DESC LIMIT :limite`,
      { id: p.id, antes: before, ...this.visibilityParams(now) }, limit, (l) => (complete ? this.fullItem(l, reader, now) : JSON.parse(l.envelope))
    )
  }

  /** 0.3.1: the themes of the open pages, from most used to least (the filter screen no longer needs to guess). */
  temasDePaginas() {
    this.rele._sync()
    const items = this.a.todos(
      `SELECT pg.tema AS tema, COUNT(*) AS paginas FROM paginas pg
       WHERE pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
       GROUP BY pg.tema ORDER BY paginas DESC, pg.tema ASC LIMIT 100`
    ).map((l) => ({ tema: l.tema, paginas: l.paginas }))
    return { itens: items }
  }

  /**
   * 0.3.1: what moderation removed from within what the rover itself wrote (only it reads). The envelope comes while the relay retains it,
   * so the author sees what to appeal; after retention it comes as `null`.
   */
  removedOf(uid, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    this.requireOwn(uid, credential, now)
    return this.lista(
      `SELECT * FROM remocoes WHERE autor_do_alvo = :uid AND acao = 'remocao' AND (:antes IS NULL OR id < :antes) ORDER BY id DESC LIMIT :limite`,
      { uid, antes: before }, limit,
      (l) => {
        const o = this.a.objeto(l.alvo)
        return {
          id: l.id, em: l.em, escopo: l.escopo, contexto: l.contexto, alvoTipo: l.alvo_tipo, alvo: l.alvo, motivo: l.motivo, por: l.papel,
          apelacao: l.apelacao_estado, envelope: o?.envelope ? JSON.parse(o.envelope) : null
        }
      }, 'id'
    )
  }

  /** A post the reader can see: visible author, not removed, not hidden, not blocked by the operator. */
  _readablePost(id, now) {
    const l = ID_RE.test(id) ? this.a.objeto(id) : null
    if (!l || l.tipo !== 'postagem' || this.a.bloqueado('objeto', id) || !this.roverVisible(l.autor, now)) throw new ProtocolError('nao_encontrado')
    if (l.removido_em !== null || l.oculto_em !== null) throw new ProtocolError('removido')
    return l
  }

  /** 0.3.1: the post with the counts and the reader's reaction (0.3 had only the envelope and no counts). */
  postDetail(id, { credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const reader = this.leitor(credential, now)
    const l = this._readablePost(id, now)
    const { tipo: type, pagina: page, ...rest } = this.fullItem(l, reader, now)
    return rest
  }

  /** 0.3.1: the replies to a post, with author, counts and the reader's reaction. */
  postReplies(id, { antes: before = null, limite: limit = DEFAULT_PAGE, ordem: order = 'recentes', janela: window = null, credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const reader = this.leitor(credential, now)
    const accepted = ['recentes', 'antigas', 'melhores', 'em-alta']
    if (!accepted.includes(order)) throw invalidOrder(accepted)
    const post = this._readablePost(id, now)
    const map = (l) => {
      const item = this.fullItem(l, reader, now)
      return {
        envelope: item.envelope, autor: item.autor,
        contagens: { respostas: this.repliesTo(l.id, now), reacoes: item.contagens.reacoes, ...this.arrowCount(l.id) },
        minhaReacao: item.minhaReacao, ...this.myArrowExtra(l.id, reader),
        // 0.11.0: a reply carries its own attachments, and its edit
        ...this.mediaExtra(l, now),
        ...this.rele.edicoes.itemExtra(l)
      }
    }
    const visible = `FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'resposta' AND o.alvo = :post AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIBLE}
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')`
    if (isByPeople(order)) {
      const duration = order === 'em-alta' ? windowOf(window) : null
      const points = pointsSql({ alias: 'o', tipoResposta: 'resposta', colunaResposta: 'alvo', janela: duration !== null })
      return this.listByOffset(
        `SELECT o.seq, o.id, o.tipo, o.autor, o.ctx, o.envelope ${visible} ORDER BY ${points} DESC, o.seq DESC`,
        pointsParams({ post: post.id, ...this.visibilityParams(now) }, now, duration), before, limit, map
      )
    }
    return this.lista(
      `SELECT o.seq, o.id, o.tipo, o.autor, o.ctx, o.envelope ${visible}
         AND (:antes IS NULL OR o.seq ${order === 'recentes' ? '<' : '>'} :antes)
       ORDER BY o.seq ${order === 'recentes' ? 'DESC' : 'ASC'} LIMIT :limite`,
      { post: post.id, antes: before, ...this.visibilityParams(now) }, limit, map
    )
  }

  followersOf(id, { antes: before = null, limite: limit = DEFAULT_PAGE }) {
    this.rele._sync()
    const p = this._readablePage(id)
    return this.lista(
      `SELECT s.rowid AS seq, s.uid FROM pagina_seguidores s JOIN rovers r ON r.uid = s.uid
       WHERE s.pagina = :id AND ${ROVER_VISIBLE} AND ${PUBLIC_GRAPH} AND (:antes IS NULL OR s.rowid < :antes)
       ORDER BY s.rowid DESC LIMIT :limite`,
      { id: p.id, antes: before, ...this.visibilityParams(this.agora()) }, limit, (l) => this.resumo(l.uid)
    )
  }

  // ====================================================================================================
  // MODERATION
  // ====================================================================================================

  _record(filter, params, { antes: before = null, limite: limit = DEFAULT_PAGE }) {
    return this.lista(
      `SELECT * FROM remocoes WHERE ${filter} AND (:antes IS NULL OR id < :antes) ORDER BY id DESC LIMIT :limite`,
      { ...params, antes: before }, limit,
      (l) => ({
        id: l.id,
        em: l.em,
        escopo: l.escopo,
        contexto: l.contexto,
        acao: l.acao,
        alvoTipo: l.alvo_tipo,
        alvo: l.acao === 'remocao' || l.acao === 'dispensa' ? l.alvo : this.resumo(l.alvo),
        motivo: l.motivo,
        por: l.papel,
        apelacao: l.apelacao_estado
      }), 'id'
    )
  }

  registroDaComunidade(id, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null }) {
    this.rele._sync()
    const reader = this.leitor(credential, this.agora())
    const { c } = this.readableCommunity(id, reader)
    return this._record("escopo = 'comunidade' AND contexto = :c", { c: c.id }, { antes: before, limite: limit })
  }

  pageRecord(id, { antes: before = null, limite: limit = DEFAULT_PAGE }) {
    this.rele._sync()
    const p = this._readablePage(id)
    return this._record("escopo = 'pagina' AND contexto = :c", { c: p.id }, { antes: before, limite: limit })
  }

  registroDoRele({ antes: before = null, limite: limit = DEFAULT_PAGE }) {
    this.rele._sync()
    return this._record("escopo = 'rele'", {}, { antes: before, limite: limit })
  }

  communityQueue(id, { credencial: credential = null }) {
    this.rele._sync()
    const { c, papel: role } = this.requireModerator(id, credential, this.agora())
    const groups = this.a.todos(
      `SELECT d.alvo AS alvo, COUNT(DISTINCT d.pseudonimo) AS total, SUM(d.forte) AS peso, MIN(d.criado_em) AS primeira, MAX(d.criado_em) AS ultima
       FROM denuncias d JOIN objetos o ON o.id = d.alvo AND o.removido_em IS NULL AND o.oculto_em IS NULL
       WHERE d.comunidade = :c AND d.dispensada_em IS NULL GROUP BY d.alvo ORDER BY peso DESC, ultima DESC LIMIT 50`, { c: c.id }
    )
    const reports = groups.map((g) => ({
      alvo: g.alvo,
      alvoTipo: this.a.objeto(g.alvo).tipo,
      topico: this.targetTopic(this.a.objeto(g.alvo)),
      motivos: Object.fromEntries(this.a.todos('SELECT motivo, COUNT(*) AS n FROM denuncias WHERE alvo = :alvo AND comunidade = :c AND dispensada_em IS NULL GROUP BY motivo', { alvo: g.alvo, c: c.id }).map((m) => [m.motivo, m.n])),
      total: g.total,
      primeiraEm: g.primeira,
      ultimaEm: g.ultima,
      peso: g.peso
    }))
    const appeals = role !== 'dono' ? [] : this.a.todos("SELECT * FROM apelacoes WHERE contexto = :c AND estado = 'aberta' AND decisor = 'dono' ORDER BY em LIMIT 50", { c: c.id }).map((ap) => this._appeal(ap))
    return { denuncias: reports, apelacoes: appeals }
  }

  _appeal(ap) {
    const target = ap.tipo === 'remocao' ? this.a.objeto(ap.alvo) : null
    return {
      id: ap.id,
      tipo: ap.tipo,
      alvo: ap.alvo,
      autor: this.resumo(ap.autor),
      texto: ap.envelope ? JSON.parse(ap.envelope).objeto.corpo.texto : null,
      em: ap.em,
      envelope: target?.envelope ? JSON.parse(target.envelope) : null
    }
  }

  relayAppeals({ limite: limit = DEFAULT_PAGE }) {
    return { itens: this.a.todos("SELECT * FROM apelacoes WHERE decisor = 'rele' AND estado = 'aberta' ORDER BY em LIMIT :limite", { limite: limit }).map((ap) => ({ ...this._appeal(ap), origem: 'rele' })), proximo: null }
  }

  // ====================================================================================================
  // OBJECT BY ID
  // ====================================================================================================

  /**
   * The social ACTION types answer 404 (the relay does not store the envelope). The rest obeys the visibility of the space where it lives.
   * @returns {object | null} the envelope, or null when it is not for this layer to decide
   */
  socialObject(line, reader) {
    if (ACTION_TYPES.includes(line.tipo)) throw new ProtocolError('nao_encontrado')
    if (line.tipo === 'depoimento' && line.estado !== 'aceito' && reader !== line.autor && reader !== line.alvo) throw new ProtocolError('nao_encontrado')
    if (!this.readableSpace(line, reader)) throw new ProtocolError('nao_encontrado')
    return null
  }
}

