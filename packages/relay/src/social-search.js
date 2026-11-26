// SPDX-License-Identifier: AGPL-3.0-or-later
// Search and discovery in 0.3. Nothing here reads anyone's reading history (the relay does not keep it): search is text, "trending" counts
// distinct people, suggestions start only from DECLARED interests and trends require at least 3 distinct authors.
// Every query goes through the same visibility rule as the read routes: a closed community does not exist for whoever is not a member.
import { ProtocolError, DEFAULT_PAGE, TIMES, TOPIC_RE } from '../../protocol/src/index.js'
import { ROVER_VISIBLE } from './store.js'
import { Moderation } from './social-moderation.js'
import { isByPeople, invalidOrder, pointsParams, pointsSql } from './social-points.js'

const WINDOWS = { '24h': 86400, '7d': 7 * 86400 }
const MAX_WORDS = 8
const MAX_WORD = 30
const UNTIL = 20

/** The FTS5 expression for free text: words in quotes (no operators), the last one by prefix. */
export function buildQuery(q) {
  if (typeof q !== 'string' || [...q].length < 2 || [...q].length > 100) {
    throw new ProtocolError('esquema', { campo: 'q', detalhe: 'Parâmetro q: de 2 a 100 caracteres.' })
  }
  const words = (q.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_WORDS).map((p) => [...p].slice(0, MAX_WORD).join(''))
  if (!words.length) throw new ProtocolError('esquema', { campo: 'q', detalhe: 'Parâmetro q: precisa ter letras ou números.' })
  return words.map((p, i) => (i === words.length - 1 ? `"${p}"*` : `"${p}"`)).join(' ')
}

export const windowOf = (value) => {
  const j = value ?? '24h'
  if (!(j in WINDOWS)) throw new ProtocolError('esquema', { campo: 'janela', detalhe: 'Parâmetro janela: 24h ou 7d.' })
  return WINDOWS[j]
}

export class Search extends Moderation {
  /** Fragment: community `c` is open to the reader `:leitor` (listed, or closed and they are a member). */
  static get COMUNIDADE_LEGIVEL() {
    return `c.encerrada_em IS NULL AND c.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
      AND (c.acesso <> 'fechada' OR EXISTS (SELECT 1 FROM membros mm WHERE mm.comunidade = c.id AND mm.uid = :leitor))`
  }

  // ---------- search ----------

  buscar({ q, tipo: type = 'todos', antes: before = null, limite: limit = DEFAULT_PAGE, leitor: reader = null, ordem: order = 'relevancia', janela: window = null }, now) {
    const query = buildQuery(q)
    if (!['todos', 'rovers', 'comunidades', 'topicos', 'paginas'].includes(type)) throw new ProtocolError('esquema', { campo: 'tipo', detalhe: 'Parâmetro tipo: rovers, comunidades, topicos, paginas ou todos.' })
    // 0.3.2: `ordem` only applies to topics; on another type it is an error (never silently ignored). The default is relevance, as in 0.3.1.
    const orders = ['relevancia', 'recentes', 'melhores', 'em-alta']
    if (!orders.includes(order)) throw invalidOrder(orders)
    if (order !== 'relevancia' && type !== 'topicos') throw new ProtocolError('esquema', { campo: 'ordem', detalhe: 'Parâmetro ordem: só vale com tipo=topicos.' })
    if (type === 'todos') {
      return Object.fromEntries(['rovers', 'comunidades', 'topicos', 'paginas'].map((t) => [t, this._searchOf(t, query, 0, 5, reader, now).itens]))
    }
    return this._searchOf(type, query, before ?? 0, limit, reader, now, order, order === 'em-alta' ? windowOf(window) : null)
  }

  _searchOf(type, query, offset, limit, reader, now, order = 'relevancia', duration = null) {
    const base = { m: query, limite: limit + 1, desloc: offset }
    const withReader = { ...base, leitor: reader ?? '' }
    const withVisibility = { ...base, ...this.visibilityParams(now) }
    const lines = {
      rovers: () => this.a.todos(
        `SELECT r.uid AS ref, r.descricao AS descricao FROM busca b JOIN rovers r ON r.uid = b.ref
         WHERE busca MATCH :m AND b.tipo = 'rover' AND r.listado = 1 AND r.perfil_id IS NOT NULL AND ${ROVER_VISIBLE}
         ORDER BY bm25(busca, 0, 0, 0, 5.0, 1.0), r.uid LIMIT :limite OFFSET :desloc`, withVisibility
      ).map((l) => ({ ...this.resumo(l.ref), descricao: l.descricao })),
      comunidades: () => this.a.todos(
        `SELECT c.* FROM busca b JOIN comunidades c ON c.id = b.ref
         WHERE busca MATCH :m AND b.tipo = 'comunidade' AND c.acesso <> 'fechada' AND ${Search.COMUNIDADE_LEGIVEL}
         ORDER BY bm25(busca, 0, 0, 0, 5.0, 1.0), c.id LIMIT :limite OFFSET :desloc`, withReader
      ).map((c) => this.communityCard(c)),
      topicos: () => this.a.todos(
        `SELECT t.* FROM busca b JOIN topicos t ON t.id = b.ref
         JOIN comunidades c ON c.id = t.comunidade
         JOIN objetos o ON o.id = t.id AND o.removido_em IS NULL AND o.oculto_em IS NULL
         JOIN rovers r ON r.uid = t.autor
         WHERE busca MATCH :m AND b.tipo = 'topico' AND ${Search.COMUNIDADE_LEGIVEL} AND ${ROVER_VISIBLE}
           AND t.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         ORDER BY ${this._topicSearchOrder(order, duration)} LIMIT :limite OFFSET :desloc`,
        isByPeople(order) ? pointsParams({ ...withReader, ...withVisibility }, now, duration) : { ...withReader, ...withVisibility }
      ).map((t) => ({ ...this.topicCard(t), comunidadeNome: this.a.um('SELECT nome FROM comunidades WHERE id = :id', { id: t.comunidade }).nome })),
      paginas: () => this.a.todos(
        `SELECT pg.* FROM busca b JOIN paginas pg ON pg.id = b.ref
         WHERE busca MATCH :m AND b.tipo = 'pagina' AND pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         ORDER BY bm25(busca, 0, 0, 0, 5.0, 1.0), pg.id LIMIT :limite OFFSET :desloc`, base
      ).map((pg) => this.pageCard(pg))
    }[type]()
    const items = lines.slice(0, limit)
    return { itens: items, proximo: lines.length > limit ? offset + limit : null }
  }

  /** The `ORDER BY` of topic search. Relevance is the usual one (bm25); `recentes` and the by-people orders break ties by the newest. */
  _topicSearchOrder(order, duration) {
    if (order === 'recentes') return 't.seq DESC'
    if (isByPeople(order)) return `${pointsSql({ alias: 't', tipoResposta: 'resposta-forum', colunaResposta: 'ctx', janela: duration !== null })} DESC, t.seq DESC`
    return 'bm25(busca, 0, 0, 0, 5.0, 1.0), t.id'
  }

  // ---------- discovery ----------

  emAlta({ tipo: type = 'topicos', janela: window }, now) {
    const duration = windowOf(window)
    const without = { agora: now, corte: now - duration, idade: TIMES.contaConsideradaNaDescobertaS, leitor: '', limite: UNTIL }
    const p = { ...without, ...this.visibilityParams(now) }
    if (type === 'topicos') {
      const lines = this.a.todos(
        `SELECT t.*, (
            3 * (SELECT COUNT(DISTINCT x.autor) FROM objetos x JOIN rovers rx ON rx.uid = x.autor
                 WHERE x.tipo = 'resposta-forum' AND x.ctx = t.id AND x.removido_em IS NULL AND x.oculto_em IS NULL
                   AND x.recebido_em > :corte AND rx.saiu = 0 AND :agora - rx.criado_em >= :idade)
            + (SELECT COUNT(DISTINCT y.autor) FROM objetos y JOIN rovers ry ON ry.uid = y.autor
               WHERE y.tipo = 'reacao' AND y.alvo = t.id AND y.removido_em IS NULL
                 AND y.recebido_em > :corte AND ry.saiu = 0 AND :agora - ry.criado_em >= :idade)
          ) AS score,
          (SELECT COUNT(*) FROM (
             SELECT x.autor FROM objetos x JOIN rovers rx ON rx.uid = x.autor
              WHERE x.tipo = 'resposta-forum' AND x.ctx = t.id AND x.removido_em IS NULL AND x.oculto_em IS NULL
                AND x.recebido_em > :corte AND rx.saiu = 0 AND :agora - rx.criado_em >= :idade
             UNION
             SELECT y.autor FROM objetos y JOIN rovers ry ON ry.uid = y.autor
              WHERE y.tipo = 'reacao' AND y.alvo = t.id AND y.removido_em IS NULL
                AND y.recebido_em > :corte AND ry.saiu = 0 AND :agora - ry.criado_em >= :idade)) AS pessoas
         FROM topicos t JOIN comunidades c ON c.id = t.comunidade
         JOIN objetos o ON o.id = t.id AND o.removido_em IS NULL AND o.oculto_em IS NULL
         JOIN rovers r ON r.uid = t.autor
         WHERE c.acesso <> 'fechada' AND ${Search.COMUNIDADE_LEGIVEL} AND ${ROVER_VISIBLE}
           AND t.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         ORDER BY score DESC, t.atividade_seq DESC LIMIT :limite`, p
      ).filter((l) => l.score >= 2)
      return { itens: lines.map((t) => ({ ...this.topicCard(t), pessoas: t.pessoas, comunidadeNome: this.a.um('SELECT nome FROM comunidades WHERE id = :id', { id: t.comunidade }).nome })), proximo: null }
    }
    if (type === 'comunidades') {
      const lines = this.a.todos(
        `SELECT c.*, (
            2 * (SELECT COUNT(DISTINCT m.uid) FROM membros m JOIN rovers rm ON rm.uid = m.uid
                 WHERE m.comunidade = c.id AND m.papel <> 'dono' AND m.desde > :corte AND rm.saiu = 0 AND :agora - rm.criado_em >= :idade)
            + 3 * (SELECT COUNT(DISTINCT a.autor) FROM objetos a JOIN rovers ra ON ra.uid = a.autor
                   WHERE a.recebido_em > :corte AND a.removido_em IS NULL AND a.oculto_em IS NULL AND ra.saiu = 0 AND :agora - ra.criado_em >= :idade
                     AND ((a.tipo = 'topico' AND a.ctx = c.id)
                          OR (a.tipo = 'resposta-forum' AND a.ctx IN (SELECT id FROM topicos WHERE comunidade = c.id))))
          ) AS score,
          (SELECT COUNT(*) FROM (
             SELECT m.uid FROM membros m JOIN rovers rm ON rm.uid = m.uid
              WHERE m.comunidade = c.id AND m.papel <> 'dono' AND m.desde > :corte AND rm.saiu = 0 AND :agora - rm.criado_em >= :idade
             UNION
             SELECT a.autor FROM objetos a JOIN rovers ra ON ra.uid = a.autor
              WHERE a.recebido_em > :corte AND a.removido_em IS NULL AND a.oculto_em IS NULL AND ra.saiu = 0 AND :agora - ra.criado_em >= :idade
                AND ((a.tipo = 'topico' AND a.ctx = c.id)
                     OR (a.tipo = 'resposta-forum' AND a.ctx IN (SELECT id FROM topicos WHERE comunidade = c.id))))) AS pessoas
         FROM comunidades c WHERE c.acesso <> 'fechada' AND ${Search.COMUNIDADE_LEGIVEL}
         ORDER BY score DESC, c.atividade_seq DESC LIMIT :limite`, without
      ).filter((l) => l.score >= 3)
      return { itens: lines.map((c) => ({ ...this.communityCard(c), pessoas: c.pessoas })), proximo: null }
    }
    if (type === 'paginas') {
      const lines = this.a.todos(
        `SELECT pg.*, (
            (SELECT COUNT(DISTINCT s.uid) FROM pagina_seguidores s JOIN rovers rs ON rs.uid = s.uid
             WHERE s.pagina = pg.id AND s.em > :corte AND rs.saiu = 0 AND :agora - rs.criado_em >= :idade)
            + 3 * (SELECT COUNT(*) FROM objetos u WHERE u.tipo = 'pagina-publicar' AND u.ctx = pg.id AND u.removido_em IS NULL AND u.oculto_em IS NULL AND u.recebido_em > :corte)
          ) AS score,
          (SELECT COUNT(DISTINCT s.uid) FROM pagina_seguidores s JOIN rovers rs ON rs.uid = s.uid
            WHERE s.pagina = pg.id AND s.em > :corte AND rs.saiu = 0 AND :agora - rs.criado_em >= :idade) AS pessoas
         FROM paginas pg WHERE pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         ORDER BY score DESC, pg.atividade_seq DESC LIMIT :limite`, { agora: now, corte: without.corte, idade: without.idade, limite: UNTIL }
      ).filter((l) => l.score >= 2)
      return { itens: lines.map((pg) => ({ ...this.pageCard(pg), pessoas: pg.pessoas })), proximo: null }
    }
    throw new ProtocolError('esquema', { campo: 'tipo', detalhe: 'Parâmetro tipo: topicos, comunidades ou paginas.' })
  }

  recemChegados({ limite: limit = 50 }, now) {
    const lines = this.a.todos(
      `SELECT r.uid, r.criado_em FROM rovers r
       WHERE r.listado = 1 AND r.perfil_id IS NOT NULL AND r.criado_em > :corte AND ${ROVER_VISIBLE}
       ORDER BY r.criado_em DESC, r.uid LIMIT :limite`,
      { corte: now - TIMES.newlyArrivedS, limite: limit, ...this.visibilityParams(now) }
    )
    return { itens: lines.map((l) => ({ ...this.resumo(l.uid), desde: l.criado_em })), proximo: null }
  }

  /** Interests from the request (a list of tags) or from a rover's public profile. */
  interestsOf({ interesses: interests, rover }, now) {
    const tags = new Set()
    const requests = (interests ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (requests.length > 8) throw new ProtocolError('esquema', { campo: 'interesses', detalhe: 'Parâmetro interesses: no máximo 8.' })
    for (const t of requests) {
      if (!TOPIC_RE.test(t)) throw new ProtocolError('esquema', { campo: 'interesses', detalhe: 'Parâmetro interesses: tags de 2 a 24 caracteres (a-z, 0-9 e hífen).' })
      tags.add(t)
    }
    if (rover) {
      const r = this.roverVisible(rover, now)
      if (!r) throw new ProtocolError('nao_encontrado')
      for (const t of [...JSON.parse(r.interesses), ...JSON.parse(r.habilidades)]) tags.add(t)
    }
    return [...tags]
  }

  /**
   * Suggestions by declared interests. Only with the credential of the rover ITSELF does the list stop suggesting what it already belongs to:
   * filtering for any other reader would reveal its memberships.
   */
  sugestoes({ tipo: type = 'comunidades', interesses: interests, rover, leitor: reader }, now) {
    const tags = this.interestsOf({ interesses: interests, rover }, now)
    if (!['comunidades', 'paginas', 'rovers'].includes(type)) throw new ProtocolError('esquema', { campo: 'tipo', detalhe: 'Parâmetro tipo: comunidades, paginas ou rovers.' })
    const me = rover && reader === rover ? rover : ''
    const p = { tags: JSON.stringify(tags), eu: me, limite: UNTIL }
    if (type === 'comunidades') {
      const lines = this.a.todos(
        `SELECT c.* FROM comunidades c
         WHERE c.acesso <> 'fechada' AND ${Search.COMUNIDADE_LEGIVEL} AND c.tema IN (SELECT value FROM json_each(:tags))
           AND (:eu = '' OR (NOT EXISTS (SELECT 1 FROM membros mm WHERE mm.comunidade = c.id AND mm.uid = :eu)
                             AND NOT EXISTS (SELECT 1 FROM banidos bb WHERE bb.comunidade = c.id AND bb.uid = :eu)))
         ORDER BY c.atividade_seq DESC LIMIT :limite`, { ...p, leitor: '' }
      )
      return { itens: lines.map((c) => this.communityCard(c)), proximo: null }
    }
    if (type === 'paginas') {
      const lines = this.a.todos(
        `SELECT pg.* FROM paginas pg
         WHERE pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND pg.tema IN (SELECT value FROM json_each(:tags))
           AND (:eu = '' OR (NOT EXISTS (SELECT 1 FROM pagina_seguidores ps WHERE ps.pagina = pg.id AND ps.uid = :eu)
                             AND NOT EXISTS (SELECT 1 FROM pagina_admins pa WHERE pa.pagina = pg.id AND pa.uid = :eu)))
         ORDER BY pg.atividade_seq DESC LIMIT :limite`, p
      )
      return { itens: lines.map((pg) => this.pageCard(pg)), proximo: null }
    }
    const lines = this.a.todos(
      `SELECT r.uid, (
          SELECT COUNT(DISTINCT j.value) FROM (SELECT value FROM json_each(r.interesses) UNION SELECT value FROM json_each(r.habilidades)) j
          WHERE j.value IN (SELECT value FROM json_each(:tags))
        ) AS comum
       FROM rovers r
       WHERE r.listado = 1 AND r.perfil_id IS NOT NULL AND r.uid <> :eu AND ${ROVER_VISIBLE}
         AND (:eu = '' OR (NOT EXISTS (SELECT 1 FROM amizades am WHERE am.par = CASE WHEN am.de < am.para THEN am.de || '|' || am.para ELSE am.para || '|' || am.de END
                                         AND (am.de = :eu OR am.para = :eu) AND (am.de = r.uid OR am.para = r.uid))
                           AND NOT EXISTS (SELECT 1 FROM relacoes b WHERE b.tipo = 'bloqueio' AND ((b.autor = :eu AND b.alvo = r.uid) OR (b.autor = r.uid AND b.alvo = :eu)))))
       ORDER BY comum DESC, r.criado_em DESC LIMIT :limite`, { ...p, ...this.visibilityParams(now) }
    ).filter((l) => l.comum > 0)
    return { itens: lines.map((l) => ({ ...this.resumo(l.uid), emComum: l.comum })), proximo: null }
  }

  tendencias({ janela: window }, now) {
    const duration = windowOf(window)
    const lines = this.a.todos(
      `SELECT tu.tag AS tag, COUNT(DISTINCT tu.autor) AS autores, COUNT(*) AS usos
       FROM tags_uso tu
       JOIN objetos o ON o.id = tu.objeto AND o.removido_em IS NULL AND o.oculto_em IS NULL
       JOIN rovers r ON r.uid = tu.autor
       WHERE tu.em > :corte AND ${ROVER_VISIBLE} AND :agora - r.criado_em >= :idade
         AND (tu.ctx IS NULL OR EXISTS (SELECT 1 FROM comunidades c WHERE c.id = tu.ctx AND c.acesso <> 'fechada' AND c.encerrada_em IS NULL))
         AND tu.objeto NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
       GROUP BY tu.tag HAVING COUNT(DISTINCT tu.autor) >= 3
       ORDER BY autores DESC, usos DESC, tu.tag LIMIT :limite`,
      { corte: now - duration, idade: TIMES.contaConsideradaNaDescobertaS, limite: UNTIL, ...this.visibilityParams(now) }
    )
    return { itens: lines.map((l) => ({ tag: l.tag, autores: l.autores, usos: l.usos })), proximo: null }
  }
}

