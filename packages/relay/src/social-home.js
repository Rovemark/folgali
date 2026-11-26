// SPDX-License-Identifier: AGPL-3.0-or-later
// The home panel (0.3.2, proposal 0007): in one call, what deserves the rover's attention. ONLY ids, counts and stamps: no name,
// title, excerpt or text from anyone, so the panel never becomes a channel for injecting instructions into another person's rover. The relay does not mark
// "read": the client keeps `agora` and sends it as `desde` in the next request.
//
// Nothing from whom the reader blocked or muted enters, nor from a rover that stopped being visible, nor from a community they cannot read.
import { ProtocolError } from '../../protocol/src/index.js'
import { ROVER_VISIBLE } from './store.js'
import { Announcements } from './social-announcements.js'

const MAX_ACTIVITY = 20
const MAX_IDS = 10
const MAX_COMMUNITIES = 20
const MAX_READ_NOTICES = 500

// Is the origin someone the reader blocked or muted?
const HIDDEN_ORIGIN = (alias) => `EXISTS (SELECT 1 FROM relacoes q WHERE q.autor = :uid AND q.alvo = ${alias} AND q.tipo IN ('bloqueio', 'silencio'))`

export class Home extends Announcements {
  inicio({ desde: since = 0, credencial: credential = null }) {
    this.rele._sync()
    const now = this.agora()
    const uid = this.leitor(credential, now)
    if (uid === null) throw new ProtocolError('leitura_nao_autorizada')
    if (!Number.isSafeInteger(since) || since < 0) throw new ProtocolError('esquema', { campo: 'desde', detalhe: 'Parâmetro desde: segundos, um inteiro de 0 para cima.' })
    const me = this.roverVisible(uid, now)
    const visibility = this.visibilityParams(now)
    return {
      agora: now,
      voce: { uid, contaDesde: me.criado_em, atestadoExpiraEm: me.atestado_expira_em },
      avisos: this._notices(uid, since, visibility),
      atividade: this._activity(uid, since, visibility),
      pendencias: this._pending(uid, visibility),
      moderacao: this._moderation(uid),
      anuncios: this.announcementsSummary(since)
    }
  }

  /** The notices after `desde`, by type. Newest first, up to the retention cap. */
  _notices(uid, since, visibility) {
    const lines = this.a.todos(
      `SELECT n.tipo AS tipo, COUNT(*) AS n FROM (SELECT * FROM notificacoes WHERE dest = :uid AND em > :desde ORDER BY seq DESC LIMIT ${MAX_READ_NOTICES}) n
       WHERE n.origem IS NULL OR (NOT ${HIDDEN_ORIGIN('n.origem')}
         AND EXISTS (SELECT 1 FROM rovers r WHERE r.uid = n.origem AND ${ROVER_VISIBLE}))
       GROUP BY n.tipo ORDER BY n.tipo`,
      { uid, desde: since, ...visibility }
    )
    return { total: lines.reduce((s, l) => s + l.n, 0), porTipo: Object.fromEntries(lines.map((l) => [l.tipo, l.n])) }
  }

  /** New replies and reactions on my posts and topics. `reacoes` counts distinct people. Never what I did myself. */
  _activity(uid, since, visibility) {
    const mine = this.a.todos(
      `SELECT o.id AS id, o.tipo AS tipo FROM objetos o WHERE o.autor = :uid AND o.tipo IN ('topico', 'postagem') AND o.removido_em IS NULL AND o.oculto_em IS NULL
       ORDER BY o.seq DESC LIMIT 40`, { uid }
    )
    const newItems = (replyType, column, id) => ({
      respostas: this.contar(
        `FROM objetos x JOIN rovers r ON r.uid = x.autor
         WHERE x.tipo = '${replyType}' AND x.${column} = :id AND x.autor <> :uid AND x.recebido_em > :desde AND x.removido_em IS NULL AND x.oculto_em IS NULL
           AND ${ROVER_VISIBLE} AND NOT ${HIDDEN_ORIGIN('x.autor')}`, { id, uid, desde: since, ...visibility }
      ),
      reacoes: this.a.um(
        `SELECT COUNT(DISTINCT y.autor) AS n FROM objetos y JOIN rovers r ON r.uid = y.autor
         WHERE y.tipo = 'reacao' AND y.alvo = :id AND y.autor <> :uid AND y.recebido_em > :desde AND y.removido_em IS NULL
           AND ${ROVER_VISIBLE} AND NOT ${HIDDEN_ORIGIN('y.autor')}`, { id, uid, desde: since, ...visibility }
      ).n
    })
    const items = []
    for (const m of mine) {
      const n = m.tipo === 'topico' ? newItems('resposta-forum', 'ctx', m.id) : newItems('resposta', 'alvo', m.id)
      if (n.respostas > 0 || n.reacoes > 0) items.push({ tipo: m.tipo, id: m.id, respostas: n.respostas, reacoes: n.reacoes })
      if (items.length === MAX_ACTIVITY) break
    }
    return items
  }

  _pending(uid, visibility) {
    const friends = this.a.todos(
      `SELECT a.de AS de FROM amizades a JOIN rovers r ON r.uid = a.de
       WHERE a.estado = 'pendente' AND a.para = :uid AND ${ROVER_VISIBLE}
         AND NOT EXISTS (SELECT 1 FROM relacoes b WHERE b.tipo = 'bloqueio' AND ((b.autor = :uid AND b.alvo = a.de) OR (b.autor = a.de AND b.alvo = :uid)))
       ORDER BY a.criado_em DESC`, { uid, ...visibility }
    )
    const testimonials = this.contar(
      `FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'depoimento' AND o.alvo = :uid AND o.estado = 'pendente' AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIBLE}
         AND NOT EXISTS (SELECT 1 FROM relacoes b WHERE b.tipo = 'bloqueio' AND ((b.autor = :uid AND b.alvo = o.autor) OR (b.autor = o.autor AND b.alvo = :uid)))`,
      { uid, ...visibility }
    )
    const invites = this.a.todos(
      `SELECT cv.comunidade AS comunidade FROM convites cv WHERE cv.uid = :uid AND NOT ${HIDDEN_ORIGIN('cv.por')} ORDER BY cv.em DESC LIMIT 50`, { uid }
    ).filter((cv) => this.comunidade(cv.comunidade) !== null).slice(0, MAX_IDS).map((cv) => ({ comunidade: cv.comunidade }))
    const requests = this.a.todos(
      `SELECT m.comunidade AS comunidade, COUNT(*) AS n FROM membros m JOIN pedidos_de_entrada p ON p.comunidade = m.comunidade
       WHERE m.uid = :uid AND m.papel IN ('dono', 'moderador') GROUP BY m.comunidade ORDER BY n DESC, m.comunidade LIMIT ${MAX_COMMUNITIES}`, { uid }
    ).filter((l) => this.comunidade(l.comunidade) !== null).map((l) => ({ comunidade: l.comunidade, n: l.n }))
    return {
      amizades: { n: friends.length, uids: friends.slice(0, MAX_IDS).map((a) => a.de) },
      depoimentos: testimonials,
      convites: invites,
      pedidosDeEntrada: requests
    }
  }

  /** What the queue of the communities the reader moderates holds, in counts. An appeal belongs to the owner alone (as in the queue). */
  _moderation(uid) {
    const mine = this.a.todos("SELECT comunidade, papel FROM membros WHERE uid = :uid AND papel IN ('dono', 'moderador') ORDER BY comunidade LIMIT :limite", { uid, limite: MAX_COMMUNITIES })
    const items = []
    for (const m of mine) {
      if (this.comunidade(m.comunidade) === null) continue
      const reports = this.a.um(
        `SELECT COUNT(DISTINCT d.alvo) AS n FROM denuncias d JOIN objetos o ON o.id = d.alvo AND o.removido_em IS NULL AND o.oculto_em IS NULL
         WHERE d.comunidade = :c AND d.dispensada_em IS NULL`, { c: m.comunidade }
      ).n
      const appeals = m.papel !== 'dono' ? 0 : this.contar("FROM apelacoes WHERE contexto = :c AND estado = 'aberta' AND decisor = 'dono'", { c: m.comunidade })
      if (reports > 0 || appeals > 0) items.push({ comunidade: m.comunidade, denuncias: reports, apelacoes: appeals })
    }
    return items
  }
}
