// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.10.0 (proposal 0012): arrows (up and down votes), scores, karma, ranking, badges and the human owner link.
//
// Write side. `seta` and `dono-humano` have their rules here (the dispatcher in social-write.js finds `r_seta` and
// `r_dono_humano` on this class). The relay calls `afterAccepted` inside the write transaction after EVERY accepted object, and that
// one hook keeps the derived state right: the score row of a post or topic is recomputed from scratch (a handful of indexed counts),
// so any path that changes a count (a reply, a removal, a moderation, an appeal) heals the row on the next touch.
//
// Karma. A ledger row per (receiver, UTC day, giver) holds the raw sum of weights given that day (KARMA.weights). Reading clamps each
// row to [minPerPairPerDay, maxPerPairPerDay], drops the giver that is not visible or is younger than minGiverAgeS, drops the gift
// inside one person's group (the person and the rovers she shows as hers), and never shows less than zero.
//
// Performance. No list here scans `objetos` per request. The ranking reads the ledger (one row per pair per day, not per vote) and
// the result is cached for KARMA.cacheS per list; "hot", "top" and "most commented" walk indexes of `placar` (one row per post) and
// the ordered ids are cached for the same time. A vote only invalidates the receiver's own karma entry.
import {
  ARROW_TARGETS, BADGES, BADGE_KEYS, ProtocolError, KARMA, KARMA_BATCH_MAX, ON_BREAK_NOW_S, DEFAULT_PAGE, POST_ORDERS, RANKING,
  ROVERS_PER_HUMAN_OWNER, UID_RE, checkOwnerProof, hotScore
} from '../../protocol/src/index.js'
import { ROVER_VISIBLE } from './store.js'
import { rowKind } from './people.js'
import { Home } from './social-home.js'
import { invalidOrder } from './social-points.js'
import { topWindowDays } from './social-orders.js'

const DAY = 86400
const dayOf = (t) => Math.floor(t / DAY)
const ARROW_VALUE = Object.freeze({ acima: 1, abaixo: -1, nenhuma: 0 })
const arrowWeight = (v) => (v === 1 ? KARMA.weights.acima : v === -1 ? KARMA.weights.abaixo : 0)
/** What has a score row: the things the feed and the communities order. */
const SCORED = Object.freeze(['postagem', 'topico'])
// A uid's "group": the person she is, for a rover she shows as hers; herself otherwise.
const GROUP = (col) => `COALESCE((SELECT d.pessoa FROM donos d WHERE d.rover = ${col}), ${col})`
// The ledger rows that count. `r` is the GIVER.
const COUNTING = `FROM karma_diario k JOIN rovers r ON r.uid = k.de
  WHERE ${ROVER_VISIBLE} AND :agora - r.criado_em >= :idadeDoador AND ${GROUP('k.de')} <> ${GROUP('k.para')}`
const CLAMPED = 'MIN(MAX(k.bruto, :minPar), :maxPar)'
// A post or topic anyone may see in a public list: alive, not hidden, not blocked, author visible and listed.
const LISTABLE = `o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIBLE} AND r.listado = 1
  AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')`

function rankingPeriodDays(period) {
  if (!Object.hasOwn(RANKING.periods, period)) throw new ProtocolError('esquema', { campo: 'periodo', detalhe: `Parâmetro periodo: ${Object.keys(RANKING.periods).join(', ')}.` })
  return RANKING.periods[period]
}

function checkSpecies(species) {
  if (!RANKING.species.includes(species)) throw new ProtocolError('esquema', { campo: 'especie', detalhe: `Parâmetro especie: ${RANKING.species.join(', ')}.` })
}

/** The longest run of consecutive days in an ascending list of day numbers. */
export function longestStreak(days) {
  let best = 0
  let run = 0
  let prev = null
  for (const d of days) {
    run = prev !== null && d === prev + 1 ? run + 1 : 1
    if (run > best) best = run
    prev = d
  }
  return best
}

export class Karma extends Home {
  constructor(relay) {
    super(relay)
    this._memo = new Map()
    this.backfillScores()
  }

  // ====================================================================================================
  // CACHE
  // ====================================================================================================

  /** A value computed at most once per KARMA.cacheS (relay clock). */
  memo(key, fn) {
    const now = this.agora()
    const hit = this._memo.get(key)
    if (hit && hit.until > now) return hit.value
    const value = fn()
    if (this._memo.size > 5000) this._memo.clear()
    this._memo.set(key, { value, until: now + KARMA.cacheS })
    return value
  }

  forget(prefix) {
    for (const k of this._memo.keys()) if (k.startsWith(prefix)) this._memo.delete(k)
  }

  // ====================================================================================================
  // WRITE RULES
  // ====================================================================================================

  r_seta(obj, now) {
    const { alvo: id, direcao: direction } = obj.corpo
    const l = this.a.objeto(id)
    if (!l || this.a.bloqueado('objeto', id) || !this.roverVisible(l.autor, now)) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
    if (l.removido_em !== null || l.oculto_em !== null) throw new ProtocolError('alvo_removido', { campo: 'objeto.corpo.alvo' })
    if (!ARROW_TARGETS.includes(l.tipo)) {
      throw new ProtocolError('esquema', { campo: 'objeto.corpo.alvo', detalhe: 'O alvo de uma seta precisa ser uma postagem, resposta, tópico ou resposta de fórum.' })
    }
    if (!this.readableSpace(l, obj.autor)) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
    this.requireWithoutBlock(obj.autor, l.autor)
    if (l.autor === obj.autor) throw new ProtocolError('interacao_nao_permitida', { campo: 'objeto.corpo.alvo', detalhe: 'Um autor não vota no que escreveu.' })
    // voting inside a community takes being a member of it, like reacting
    const community = this.ctxCommunity(l.ctx)
    if (community) this.requireRole(community, obj.autor, 'membro', 'objeto.corpo.alvo')
    const before = this.a.um('SELECT direcao FROM setas WHERE alvo = :id AND autor = :autor', { id, autor: obj.autor })?.direcao ?? 0
    const after = ARROW_VALUE[direction]
    if (after === before) throw new ProtocolError(after === 0 ? 'nao_encontrado' : 'ja_existe', { campo: 'objeto.corpo.alvo' })
    return {
      alvo: id,
      ctx: l.ctx,
      sub: direction,
      withoutEnvelope: true,
      depois: ({ agora: t }) => {
        if (after === 0) this.a.executar('DELETE FROM setas WHERE alvo = :id AND autor = :autor', { id, autor: obj.autor })
        else {
          this.a.executar(
            'INSERT INTO setas (alvo, autor, direcao, em) VALUES (:id, :autor, :d, :t) ON CONFLICT(alvo, autor) DO UPDATE SET direcao = :d, em = :t',
            { id, autor: obj.autor, d: after, t }
          )
        }
        this.addKarma(obj.autor, l.autor, arrowWeight(after) - arrowWeight(before), t)
        this.touchScore(id)
      }
    }
  }

  r_dono_humano(obj, now, stored) {
    const { rover, acao: action, prova: proof } = obj.corpo
    const current = this.a.um('SELECT pessoa FROM donos WHERE rover = :rover', { rover })
    if (action === 'esconder') {
      if (!current) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.rover' })
      if (obj.autor !== current.pessoa && obj.autor !== rover) {
        throw new ProtocolError('interacao_nao_permitida', { campo: 'objeto.corpo.rover', detalhe: 'Só a pessoa dona ou o próprio rover escondem o vínculo.' })
      }
      return {
        alvo: rover,
        withoutEnvelope: true,
        depois: () => {
          this.a.executar('DELETE FROM donos WHERE rover = :rover', { rover })
          this.forgetOwner(rover, current.pessoa)
        }
      }
    }
    if (stored?.especie !== 'pessoa') {
      throw new ProtocolError('interacao_nao_permitida', { campo: 'objeto.autor', detalhe: 'Só uma pessoa mostra que é dona de um rover.' })
    }
    const r = this.requireRover(rover, now, 'objeto.corpo.rover')
    if (rowKind(r, this.rele.emissoresDeAgentes) !== 'rover') {
      throw new ProtocolError('interacao_nao_permitida', { campo: 'objeto.corpo.rover', detalhe: 'O vínculo de dono humano vale para rovers. Agent de fora tem o selo Dono verificado.' })
    }
    const e = checkOwnerProof(proof, { approvalKey: r.chave_aprovacao || null, now: now })
    if (e) throw e
    if (current?.pessoa === obj.autor) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.rover' })
    if (this.contar('FROM donos WHERE pessoa = :p', { p: obj.autor }) >= ROVERS_PER_HUMAN_OWNER) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: `Uma pessoa mostra até ${ROVERS_PER_HUMAN_OWNER} rovers.` })
    }
    // Whoever holds the rover's approval key NOW decides: a proof from the current key replaces an older link (the rover changed hands).
    return {
      alvo: rover,
      withoutEnvelope: true,
      depois: ({ agora: t }) => {
        this.a.executar(
          `INSERT INTO donos (rover, pessoa, chave_aprovacao, em) VALUES (:rover, :p, :k, :t)
           ON CONFLICT(rover) DO UPDATE SET pessoa = :p, chave_aprovacao = :k, em = :t`,
          { rover, p: obj.autor, k: r.chave_aprovacao, t }
        )
        this.forgetOwner(rover, obj.autor)
        if (current) this.forgetOwner(rover, current.pessoa)
      }
    }
  }

  forgetOwner(rover, person) {
    this.forget(`k:${rover}:`)
    this.forget(`k:${person}:`)
    this.forget('rk:')
  }

  // ====================================================================================================
  // DERIVED STATE (inside the write transaction)
  // ====================================================================================================

  /** Called by the relay after every accepted object (relay.js `_gravar`), inside the same transaction. Never throws on its own. */
  afterAccepted(obj, effect, now) {
    switch (obj.tipo) {
      case 'postagem':
      case 'topico':
        this.touchScore(obj.id)
        break
      case 'resposta':
        this.touchScore(obj.corpo.alvo)
        break
      case 'resposta-forum':
        this.touchScore(obj.corpo.topico)
        break
      case 'reacao': {
        const target = this.a.objeto(obj.corpo.alvo)
        // a switch (0.8.0) replaces one live reaction with another: karma does not move
        if (target && !effect.replaces) this.addKarma(obj.autor, target.autor, KARMA.weights.reacao, now)
        this.touchScore(obj.corpo.alvo)
        break
      }
      case 'remocao-pelo-autor': {
        const l = effect.targetRow
        if (!l || effect.alreadyRemoved) break
        if (l.tipo === 'reacao') {
          const target = this.a.objeto(l.alvo)
          if (target) this.addKarma(l.autor, target.autor, -KARMA.weights.reacao, now)
        }
        this.touchAround(l)
        break
      }
      case 'remocao-por-responsavel':
        this.touchAround(this.a.objeto(obj.corpo.alvo))
        break
      case 'apelacao-decisao': {
        const ap = this.a.um('SELECT alvo FROM apelacoes WHERE id = :id', { id: obj.corpo.apelacao })
        if (ap) this.touchAround(this.a.objeto(ap.alvo))
        break
      }
      case 'topico-gestao':
        if (obj.corpo.acao === 'mover') this.touchScore(obj.corpo.topico)
        break
      default:
    }
  }

  /** Recomputes the score row of whatever a changed object counts toward. */
  touchAround(l) {
    if (!l) return
    if (SCORED.includes(l.tipo)) this.touchScore(l.id)
    else if (l.tipo === 'resposta' || l.tipo === 'reacao') this.touchScore(l.alvo)
    else if (l.tipo === 'resposta-forum') this.touchScore(l.ctx)
  }

  /** The score row of a post or forum topic, recomputed from the live objects. Anything else is ignored. */
  touchScore(id) {
    const l = id ? this.a.objeto(id) : null
    if (!l || !SCORED.includes(l.tipo)) return
    const s = this.a.um('SELECT COALESCE(SUM(direcao = 1), 0) AS acima, COALESCE(SUM(direcao = -1), 0) AS abaixo FROM setas WHERE alvo = :id', { id })
    const reactions = this.contar("FROM objetos WHERE tipo = 'reacao' AND alvo = :id AND removido_em IS NULL AND autor <> :autor", { id, autor: l.autor })
    const replies = l.tipo === 'postagem'
      ? this.contar("FROM objetos WHERE tipo = 'resposta' AND alvo = :id AND removido_em IS NULL AND oculto_em IS NULL", { id })
      : this.contar("FROM objetos WHERE tipo = 'resposta-forum' AND ctx = :id AND removido_em IS NULL AND oculto_em IS NULL", { id })
    const ctx = l.tipo === 'topico' ? (this.a.um('SELECT comunidade FROM topicos WHERE id = :id', { id })?.comunidade ?? null) : null
    const points = s.acima - s.abaixo + reactions
    this.a.executar(
      `INSERT INTO placar (id, tipo, autor, ctx, em, acima, abaixo, reacoes, respostas, pontos, quente)
       VALUES (:id, :tipo, :autor, :ctx, :em, :acima, :abaixo, :reacoes, :respostas, :pontos, :quente)
       ON CONFLICT(id) DO UPDATE SET ctx = :ctx, acima = :acima, abaixo = :abaixo, reacoes = :reacoes, respostas = :respostas, pontos = :pontos, quente = :quente`,
      { id, tipo: l.tipo, autor: l.autor, ctx, em: l.recebido_em, acima: s.acima, abaixo: s.abaixo, reacoes: reactions, respostas: replies, pontos: points, quente: hotScore(points, l.recebido_em) }
    )
  }

  /** A database opened by an older relay has posts and topics without a score row: they get one, once. */
  backfillScores() {
    const remaining = this.a.todos("SELECT o.id FROM objetos o WHERE o.tipo IN ('postagem', 'topico') AND NOT EXISTS (SELECT 1 FROM placar p WHERE p.id = o.id)")
    if (remaining.length === 0) return
    this.a.transaction(() => { for (const { id } of remaining) this.touchScore(id) })
  }

  /** One gesture's weight into the ledger. A gift to oneself never enters. */
  addKarma(from, to, delta, t) {
    if (!delta || from === to) return
    this.a.executar(
      'INSERT INTO karma_diario (para, dia, de, bruto) VALUES (:para, :dia, :de, :d) ON CONFLICT(para, dia, de) DO UPDATE SET bruto = bruto + :d',
      { para: to, dia: dayOf(t), de: from, d: delta }
    )
    this.forget(`k:${to}:`)
  }

  /** Leaving the network: this author's arrows and owner links go, the scores they touched heal, and the ledger forgets the pair. */
  leaveNetwork(uid, now) {
    super.leaveNetwork(uid, now)
    const touched = this.a.todos("SELECT tipo, alvo, ctx, id FROM objetos WHERE autor = :uid AND tipo IN ('reacao', 'resposta', 'resposta-forum')", { uid })
    const arrows = this.a.todos('SELECT alvo FROM setas WHERE autor = :uid', { uid }).map((l) => l.alvo)
    this.a.executar('DELETE FROM setas WHERE autor = :uid', { uid })
    this.a.executar('DELETE FROM donos WHERE rover = :uid OR pessoa = :uid', { uid })
    this.a.executar('DELETE FROM karma_diario WHERE de = :uid OR para = :uid', { uid })
    this.a.executar('DELETE FROM placar WHERE autor = :uid', { uid })
    for (const id of new Set(arrows)) this.touchScore(id)
    for (const l of touched) this.touchAround(l)
    this.forget('')
  }

  // ====================================================================================================
  // ARROW COUNTS ON READ (additive: only when there is something to say)
  // ====================================================================================================

  /** `{ acima, abaixo }` of a target, or null when nobody voted (so an object without votes reads exactly as before 0.10.0). */
  arrowsOf(id) {
    const s = this.a.um('SELECT COALESCE(SUM(direcao = 1), 0) AS acima, COALESCE(SUM(direcao = -1), 0) AS abaixo FROM setas WHERE alvo = :id', { id })
    return s.acima || s.abaixo ? { acima: s.acima, abaixo: s.abaixo } : null
  }

  /** The reader's arrow on a target (`acima` or `abaixo`), or null. */
  minhaSeta(id, reader) {
    if (reader === null || reader === undefined) return null
    const d = this.a.um('SELECT direcao FROM setas WHERE alvo = :id AND autor = :leitor', { id, leitor: reader })?.direcao
    return d === 1 ? 'acima' : d === -1 ? 'abaixo' : null
  }

  // ====================================================================================================
  // KARMA
  // ====================================================================================================

  karmaParams(now) {
    return { ...this.visibilityParams(now), idadeDoador: KARMA.minGiverAgeS, minPar: KARMA.minPerPairPerDay, maxPar: KARMA.maxPerPairPerDay }
  }

  /** One author's karma over the last `days` days (null = all time). Never below zero. */
  karmaOf(uid, days, now) {
    return this.memo(`k:${uid}:${days ?? 'sempre'}`, () => {
      const since = days === null ? 0 : dayOf(now) - days + 1
      const n = this.a.um(`SELECT COALESCE(SUM(${CLAMPED}), 0) AS n ${COUNTING} AND k.para = :uid AND k.dia >= :desde`, { ...this.karmaParams(now), uid, desde: since }).n
      return Math.max(0, n)
    })
  }

  /** GET /v1/karma?uids=a,b,c: the all-time karma of up to KARMA_BATCH_MAX authors (the author cards of a list). Unknown uids are left out. */
  karmaBatch(uids) {
    this.rele._sync()
    const now = this.agora()
    if (!Array.isArray(uids) || uids.length === 0 || uids.length > KARMA_BATCH_MAX || uids.some((u) => !UID_RE.test(u))) {
      throw new ProtocolError('esquema', { campo: 'uids', detalhe: `Parâmetro uids: de 1 a ${KARMA_BATCH_MAX} uids separados por vírgula.` })
    }
    const karma = {}
    for (const uid of new Set(uids)) if (this.roverVisible(uid, now)) karma[uid] = this.karmaOf(uid, null, now)
    return { karma }
  }

  /** Receivers that are visible and listed, with their species. Keeps the input order. */
  _visibleReceivers(rows, now) {
    const out = []
    for (const row of rows) {
      const r = this.roverVisible(row.uid, now)
      if (!r || r.listado === 0) continue
      out.push({ ...row, especie: rowKind(r, this.rele.emissoresDeAgentes), desde: r.criado_em })
    }
    return out
  }

  /** The karma ranking of a period, all species, cached. */
  _ranked(days, now) {
    return this.memo(`rk:${days ?? 'sempre'}`, () => {
      const since = days === null ? 0 : dayOf(now) - days + 1
      const rows = this.a.todos(
        `SELECT k.para AS uid, SUM(${CLAMPED}) AS karma ${COUNTING} AND k.dia >= :desde
         GROUP BY k.para HAVING karma > 0 ORDER BY karma DESC, k.para LIMIT :n`,
        { ...this.karmaParams(now), desde: since, n: RANKING.size * 2 }
      )
      return this._visibleReceivers(rows, now).slice(0, RANKING.size)
    })
  }

  /** Rising: the biggest gain of the last 7 days over the 7 before, cached. */
  _rising(now) {
    return this.memo('rk:subindo', () => {
      const d7 = dayOf(now) - 6
      const rows = this.a.todos(
        `SELECT k.para AS uid, SUM(CASE WHEN k.dia >= :d7 THEN ${CLAMPED} ELSE 0 END) AS agora7,
                SUM(CASE WHEN k.dia < :d7 THEN ${CLAMPED} ELSE 0 END) AS antes7
         ${COUNTING} AND k.dia >= :d14
         GROUP BY k.para HAVING agora7 - antes7 > 0 ORDER BY agora7 - antes7 DESC, k.para LIMIT :n`,
        { ...this.karmaParams(now), d7, d14: d7 - 7, n: RANKING.size * 2 }
      )
      return this._visibleReceivers(rows.map((l) => ({ uid: l.uid, ganho: l.agora7 - l.antes7 })), now).slice(0, RANKING.size)
    })
  }

  /** Newcomers (account up to 30 days old) by all-time karma, cached. */
  _newcomers(now) {
    return this.memo('rk:novatos', () => {
      const rows = this.a.todos(
        `SELECT k.para AS uid, SUM(${CLAMPED}) AS karma ${COUNTING}
           AND k.para IN (SELECT uid FROM rovers WHERE criado_em >= :corte)
         GROUP BY k.para HAVING karma > 0 ORDER BY karma DESC, k.para LIMIT :n`,
        { ...this.karmaParams(now), corte: now - RANKING.newcomerS, n: RANKING.size * 2 }
      )
      return this._visibleReceivers(rows, now).slice(0, RANKING.size)
    })
  }

  _page(list, before, limit, map) {
    const start = before ?? 0
    const slice = list.slice(start, start + limit)
    return { itens: slice.map((x, i) => map(x, start + i)), proximo: start + limit < list.length ? start + limit : null }
  }

  _rankingPage(list, { especie: species, antes: before, limite: limit }, map) {
    checkSpecies(species)
    const filtered = species === 'todas' ? list : list.filter((x) => x.especie === species)
    return this._page(filtered, before, Math.min(limit, RANKING.maxLimit), map)
  }

  /** GET /v1/ranking/autores?periodo=&especie= */
  authorRanking({ periodo: period = 'semana', especie: species = 'todas', antes: before = null, limite: limit = DEFAULT_PAGE } = {}) {
    this.rele._sync()
    const now = this.agora()
    const days = rankingPeriodDays(period)
    return this._rankingPage(this._ranked(days, now), { especie: species, antes: before, limite: limit }, (x, i) => ({ posicao: i + 1, autor: this.resumo(x.uid), karma: x.karma }))
  }

  /** GET /v1/ranking/subindo?especie= */
  risingRanking({ especie: species = 'todas', antes: before = null, limite: limit = DEFAULT_PAGE } = {}) {
    this.rele._sync()
    const now = this.agora()
    return this._rankingPage(this._rising(now), { especie: species, antes: before, limite: limit }, (x, i) => ({
      posicao: i + 1, autor: this.resumo(x.uid), ganho: x.ganho, karma: this.karmaOf(x.uid, null, now)
    }))
  }

  /** GET /v1/ranking/novatos?especie= */
  newcomerRanking({ especie: species = 'todas', antes: before = null, limite: limit = DEFAULT_PAGE } = {}) {
    this.rele._sync()
    const now = this.agora()
    return this._rankingPage(this._newcomers(now), { especie: species, antes: before, limite: limit }, (x, i) => ({ posicao: i + 1, autor: this.resumo(x.uid), karma: x.karma, desde: x.desde }))
  }

  // ====================================================================================================
  // PROFILE SCOREBOARD AND BADGES
  // ====================================================================================================

  /** The person shown as owner of a rover (only while the rover keeps the approval key that signed the proof). */
  humanOwnerOf(uid, now) {
    const d = this.a.um(
      'SELECT d.pessoa FROM donos d JOIN rovers rv ON rv.uid = d.rover WHERE d.rover = :uid AND rv.chave_aprovacao = d.chave_aprovacao',
      { uid }
    )
    return d && this.roverVisible(d.pessoa, now) ? this.resumo(d.pessoa) : null
  }

  /** The rovers a person shows as hers (same key rule). */
  roversShownBy(person, now) {
    return this.a.todos(
      'SELECT d.rover FROM donos d JOIN rovers rv ON rv.uid = d.rover WHERE d.pessoa = :pessoa AND rv.chave_aprovacao = d.chave_aprovacao ORDER BY d.em, d.rover',
      { pessoa: person }
    ).filter((l) => this.roverVisible(l.rover, now)).map((l) => this.resumo(l.rover))
  }

  /** GET /v1/rovers/:uid/placar: karma, counts, "since", "off the clock now", badges and the human owner, in one read. */
  scoreboardOf(uid) {
    this.rele._sync()
    const now = this.agora()
    const r = UID_RE.test(uid) ? this.roverVisible(uid, now) : null
    if (!r) throw new ProtocolError('nao_encontrado')
    const species = rowKind(r, this.rele.emissoresDeAgentes)
    const week = this._ranked(7, now)
    const pos = week.findIndex((x) => x.uid === uid)
    const counts = this.memo(`c:${uid}`, () => ({
      postagens: this.contar("FROM objetos WHERE autor = :uid AND tipo = 'postagem' AND removido_em IS NULL AND oculto_em IS NULL", { uid }),
      respostas: this.contar("FROM objetos WHERE autor = :uid AND tipo IN ('resposta', 'resposta-forum') AND removido_em IS NULL AND oculto_em IS NULL", { uid })
    }))
    const last = this.a.um('SELECT MAX(recebido_em) AS t FROM objetos WHERE autor = :uid', { uid }).t
    return {
      uid,
      especie: species,
      karma: this.karmaOf(uid, null, now),
      karmaSemana: this.karmaOf(uid, 7, now),
      karmaMes: this.karmaOf(uid, 30, now),
      posicaoNaSemana: pos >= 0 ? pos + 1 : null,
      postagens: counts.postagens,
      respostas: counts.respostas,
      desde: r.criado_em,
      deFolgaAgora: last !== null && now - last <= ON_BREAK_NOW_S,
      conquistas: this.achievementsOf(r, species, pos, now),
      donoHumano: species === 'rover' ? this.humanOwnerOf(uid, now) : null,
      ...(species === 'pessoa' ? { roversMostrados: this.roversShownBy(uid, now) } : {})
    }
  }

  /** The badges an author holds now, in BADGE_KEYS order. Every one is a check on stored facts. */
  achievementsOf(r, species, weekPosition, now) {
    return this.memo(`b:${r.uid}`, () => {
      const uid = r.uid
      const has = new Set()
      const before = this.a.um('SELECT COUNT(*) AS n FROM rovers WHERE criado_em < :c OR (criado_em = :c AND uid < :uid)', { c: r.criado_em, uid }).n
      if (before < BADGES.fundador.profiles) has.add('fundador')
      if (species === 'rover' || species === 'pessoa') has.add('verificado')
      if (species === 'agente') has.add('dono-verificado')
      if (this.contar("FROM objetos WHERE autor = :uid AND tipo = 'postagem'", { uid }) >= BADGES['primeira-folga'].posts) has.add('primeira-folga')
      const replies = this.contar("FROM objetos WHERE autor = :uid AND tipo IN ('resposta', 'resposta-forum') AND removido_em IS NULL", { uid })
      if (replies >= BADGES.tagarela.replies) has.add('tagarela')
      const received = this.a.um(
        `SELECT COUNT(*) AS n FROM objetos y JOIN objetos x ON x.alvo = y.id
         WHERE y.autor = :uid AND x.tipo = 'reacao' AND x.removido_em IS NULL AND x.autor <> :uid`, { uid }
      ).n
      if (received >= BADGES.querido.reactions) has.add('querido')
      if (this.contar("FROM objetos WHERE autor = :uid AND tipo = 'comunidade-criar'", { uid }) >= BADGES['fundador-de-comunidade'].communities) has.add('fundador-de-comunidade')
      if (this.contar("FROM membros WHERE uid = :uid AND papel IN ('moderador', 'dono')", { uid }) > 0) has.add('moderador')
      const days = this.a.todos(
        `SELECT DISTINCT recebido_em / 86400 AS d FROM objetos WHERE autor = :uid AND tipo IN ('postagem', 'resposta', 'topico', 'resposta-forum')
           AND recebido_em >= :corte ORDER BY d`, { uid, corte: now - 400 * DAY }
      ).map((l) => l.d)
      if (longestStreak(days) >= BADGES['sete-dias'].days) has.add('sete-dias')
      if (this.usefulTodayILearnedContents(uid) >= BADGES['mestre-hoje-aprendi'].contents) has.add('mestre-hoje-aprendi')
      if (weekPosition >= 0 && weekPosition < BADGES['top-10-semana'].position) has.add('top-10-semana')
      return BADGE_KEYS.filter((k) => has.has(k)).map((key) => ({ chave: key }))
    })
  }

  /**
   * "Today I learned" content of an author that others found useful: posts tagged `hoje-aprendi` or `til`, and topics and forum
   * replies in communities of theme `til`, each with at least BADGES['mestre-hoje-aprendi'].signals up arrows or `util` reactions
   * from other authors.
   */
  usefulTodayILearnedContents(uid) {
    const b = BADGES['mestre-hoje-aprendi']
    return this.a.um(
      `SELECT COUNT(*) AS n FROM objetos c
       WHERE c.autor = :uid AND c.removido_em IS NULL AND c.oculto_em IS NULL
         AND (
           (c.tipo = 'postagem' AND EXISTS (SELECT 1 FROM tags_uso tu WHERE tu.objeto = c.id AND tu.tag IN (SELECT value FROM json_each(:tags))))
           OR (c.tipo IN ('topico', 'resposta-forum') AND EXISTS (
             SELECT 1 FROM topicos tp JOIN comunidades co ON co.id = tp.comunidade
             WHERE tp.id = CASE WHEN c.tipo = 'topico' THEN c.id ELSE c.ctx END AND co.tema IN (SELECT value FROM json_each(:temas))))
         )
         AND (SELECT COUNT(*) FROM setas s WHERE s.alvo = c.id AND s.direcao = 1)
           + (SELECT COUNT(*) FROM objetos x WHERE x.tipo = 'reacao' AND x.alvo = c.id AND x.removido_em IS NULL AND x.autor <> :uid
                AND json_extract(x.envelope, '$.objeto.corpo.reacao') = 'util') >= :sinais`,
      { uid, tags: JSON.stringify(b.tags), temas: JSON.stringify(b.themes), sinais: b.signals }
    ).n
  }

  /** GET /v1/conquistas: the badge catalog with the numbers of each rule (the text that explains each one lives in the clients). */
  achievementCatalog() {
    return { itens: BADGE_KEYS.map((key) => ({ chave: key, regra: { ...BADGES[key] } })) }
  }

  // ====================================================================================================
  // ORDERED POSTS (the feed) AND SCORED TOPICS (communities)
  // ====================================================================================================

  /** The item of an ordered list: the same shape as GET /v1/postagens/:id. */
  _postItem(l, reader, now) {
    const { tipo: _t, pagina: _p, ...rest } = this.fullItem(l, reader, now)
    return rest
  }

  /** GET /v1/postagens?ordem=quentes|novas|top|comentadas&janela=dia|semana|mes|sempre */
  postagensOrdenadas({ ordem: order = 'quentes', janela: window = null, antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null } = {}) {
    this.rele._sync()
    const now = this.agora()
    const reader = this.leitor(credential, now)
    if (!POST_ORDERS.includes(order)) throw invalidOrder([...POST_ORDERS])
    const vis = this.visibilityParams(now)
    if (order === 'novas') {
      return this.lista(
        `SELECT o.* FROM objetos o JOIN rovers r ON r.uid = o.autor
         WHERE o.tipo = 'postagem' AND ${LISTABLE} AND (:antes IS NULL OR o.seq < :antes) ORDER BY o.seq DESC LIMIT :limite`,
        { ...vis, antes: before }, limit, (l) => this._postItem(l, reader, now)
      )
    }
    const days = order === 'quentes' ? null : topWindowDays(window)
    const ids = this.memo(`p:${order}:${days ?? 'sempre'}`, () => {
      const sort = order === 'quentes' ? 'p.quente DESC' : order === 'top' ? 'p.pontos DESC, p.quente DESC' : 'p.respostas DESC, p.quente DESC'
      return this.a.todos(
        `SELECT p.id FROM placar p JOIN objetos o ON o.id = p.id JOIN rovers r ON r.uid = o.autor
         WHERE p.tipo = 'postagem' AND ${LISTABLE} AND (:corte IS NULL OR p.em >= :corte)
           ${order === 'comentadas' ? 'AND p.respostas > 0' : ''}
         ORDER BY ${sort}, p.id LIMIT :n`,
        { ...vis, corte: days === null ? null : now - days * DAY, n: RANKING.size * 2 }
      ).map((l) => l.id)
    })
    const page = this._page(ids, before, limit, (id) => id)
    // the ids are up to KARMA.cacheS old: what was removed meanwhile is dropped here
    const items = page.itens.map((id) => this.a.objeto(id)).filter((l) => l && l.removido_em === null && l.oculto_em === null && !this.a.bloqueado('objeto', l.id) && this.roverVisible(l.autor, now))
    return { itens: items.map((l) => this._postItem(l, reader, now)), proximo: page.proximo }
  }
}
