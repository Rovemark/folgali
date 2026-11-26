// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.11.0 (proposal 0013): events in the reference relay. The rules of the four event types and the routes that read them.
//
//   - an event lives on its own (anyone reads it) or inside a community (who reads the community reads the event; who creates it is
//     a member);
//   - only the organizer edits and cancels; a cancelled event does not come back and takes no more answers;
//   - an answer (vou, talvez, nao-vou) is one per reader and event, the new one replaces the earlier; with a capacity, "vou" is
//     refused when the event is full; answers close when the event is over;
//   - the answers are PUBLIC: who reads the event reads who is going.
//
// The tables are created on first use and only ever added to: a database from before 0.11.0 gains them empty.
import { ProtocolError, ID_RE, DEFAULT_PAGE, UID_RE } from '../../protocol/src/index.js'
import { EVENT_LIMITS, EVENT_WHENS, RSVP_ANSWERS, eventEnd } from '../../protocol/src/events.js'
import { ROVER_VISIBLE } from './store.js'

const EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS eventos (
  id TEXT PRIMARY KEY,
  autor TEXT NOT NULL,
  comunidade TEXT,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  inicio INTEGER NOT NULL,
  fim INTEGER,
  termina INTEGER NOT NULL,
  fuso TEXT NOT NULL,
  online INTEGER NOT NULL,
  lugar TEXT,
  capa TEXT,
  vagas INTEGER,
  adulto INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'ativo',
  criado_em INTEGER NOT NULL,
  editado_em INTEGER,
  cancelado_em INTEGER,
  versoes INTEGER NOT NULL DEFAULT 1,
  versao_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS eventos_inicio ON eventos(inicio, id);
CREATE INDEX IF NOT EXISTS eventos_termina ON eventos(termina, id);
CREATE INDEX IF NOT EXISTS eventos_comunidade ON eventos(comunidade, inicio);
CREATE INDEX IF NOT EXISTS eventos_autor ON eventos(autor, inicio);
CREATE TABLE IF NOT EXISTS presencas (
  evento TEXT NOT NULL,
  uid TEXT NOT NULL,
  resposta TEXT NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (evento, uid)
);
CREATE INDEX IF NOT EXISTS presencas_uid ON presencas(uid, evento);
CREATE INDEX IF NOT EXISTS presencas_evento ON presencas(evento, resposta, em);
`

// An event a reader may be shown in a list: its object is on air, the operator did not block it and the organizer is visible.
// Uses the aliases `e` (eventos), `o` (the creation object) and `r` (the organizer).
const LIVE_EVENT = `
  o.envelope IS NOT NULL AND o.removido_em IS NULL AND o.oculto_em IS NULL
  AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
  AND ${ROVER_VISIBLE}`
const FROM_EVENTS = 'FROM eventos e JOIN objetos o ON o.id = e.id JOIN rovers r ON r.uid = e.autor'

export class Events {
  /** @param {import('./relay.js').Rele} rele */
  constructor(relay) {
    this.rele = relay
    this.a = relay.store
    this.social = relay.social
    this.a.db.exec(EVENTS_SCHEMA)
  }

  agora() { return this.rele.relogio() }

  info() {
    return {
      respostas: [...RSVP_ANSWERS],
      tituloCaracteres: EVENT_LIMITS.titulo.max,
      descricaoCaracteres: EVENT_LIMITS.descricao.max,
      lugarCaracteres: EVENT_LIMITS.lugar.max,
      vagasMax: EVENT_LIMITS.vagas.max,
      antecedenciaMaxS: EVENT_LIMITS.antecedenciaMaxS,
      duracaoMaxS: EVENT_LIMITS.duracaoMaxS,
      duracaoPadraoS: EVENT_LIMITS.duracaoPadraoS,
      abertosPorOrganizador: EVENT_LIMITS.abertosPorOrganizador,
      edicoesPorEvento: EVENT_LIMITS.edicoesPorEvento
    }
  }

  // ====================================================================================================
  // WRITE
  // ====================================================================================================

  /** The rules of an event type. Returns the effect relay.js stores. */
  regras(obj, now) {
    switch (obj.tipo) {
      case 'evento-criar': return this._create(obj, now)
      case 'evento-editar': return this._edit(obj, now)
      case 'evento-cancelar': return this._cancel(obj, now)
      default: return this._respond(obj, now)
    }
  }

  _columns(c) {
    return {
      titulo: c.titulo, descricao: c.descricao, inicio: c.inicio, fim: c.fim, termina: eventEnd(c), fuso: c.fuso, online: c.online ? 1 : 0,
      lugar: c.lugar, capa: c.capa ? JSON.stringify(c.capa) : null, vagas: c.vagas, adulto: c.adulto === true ? 1 : 0
    }
  }

  _create(obj, now) {
    const c = obj.corpo
    let using = null
    if (c.comunidade !== null) ({ com: using } = this.social.requireRole(c.comunidade, obj.autor, 'membro'))
    const open = this.a.um(
      `SELECT COUNT(*) AS n ${FROM_EVENTS} WHERE e.autor = :autor AND e.estado = 'ativo' AND e.termina > :agora AND o.removido_em IS NULL`,
      { autor: obj.autor, agora: now }
    ).n
    if (open >= EVENT_LIMITS.abertosPorOrganizador) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: `Um organizador tem no máximo ${EVENT_LIMITS.abertosPorOrganizador} eventos em aberto. Cancele um ou espere um deles acontecer.` })
    }
    return {
      ctx: using?.id ?? null,
      depois: ({ agora: t }) => {
        this.a.executar(
          `INSERT INTO eventos (id, autor, comunidade, titulo, descricao, inicio, fim, termina, fuso, online, lugar, capa, vagas, adulto, criado_em, versao_id)
           VALUES (:id, :autor, :comunidade, :titulo, :descricao, :inicio, :fim, :termina, :fuso, :online, :lugar, :capa, :vagas, :adulto, :criadoEm, :id)`,
          { id: obj.id, autor: obj.autor, comunidade: using?.id ?? null, criadoEm: obj.criadoEm, ...this._columns(c) }
        )
        // who organizes is going
        this.a.executar("INSERT INTO presencas (evento, uid, resposta, em) VALUES (:id, :uid, 'vou', :t)", { id: obj.id, uid: obj.autor, t })
        this.social.mencoes(`${c.titulo}\n${c.descricao}`, { origem: obj.autor, objeto: obj.id, comunidade: using?.id ?? null }, t)
      }
    }
  }

  /** The event, on air, for its organizer to act on. */
  _fromOrganizer(id, author, now) {
    const e = this._row(id)
    const o = e ? this.a.objeto(id) : null
    if (!e || this.a.bloqueado('objeto', id)) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.evento' })
    if (o.removido_em !== null || o.oculto_em !== null) throw new ProtocolError('alvo_removido', { campo: 'objeto.corpo.evento' })
    if (e.autor !== author) throw new ProtocolError('nao_e_autor', { campo: 'objeto.corpo.evento', detalhe: 'Só quem organiza muda o evento.' })
    if (e.estado !== 'ativo') throw new ProtocolError('evento_encerrado', { campo: 'objeto.corpo.evento', detalhe: 'O evento foi cancelado.' })
    if (now >= e.termina) throw new ProtocolError('evento_encerrado', { campo: 'objeto.corpo.evento', detalhe: 'O evento já aconteceu.' })
    return e
  }

  _edit(obj, now) {
    const c = obj.corpo
    const e = this._fromOrganizer(c.evento, obj.autor, now)
    if (e.versoes - 1 >= EVENT_LIMITS.edicoesPorEvento) {
      throw new ProtocolError('limite_de_estrutura', { campo: 'objeto.corpo.evento', detalhe: `Um evento aceita no máximo ${EVENT_LIMITS.edicoesPorEvento} edições.` })
    }
    if (c.inicio !== e.inicio && c.inicio < now) throw new ProtocolError('esquema', { campo: 'objeto.corpo.inicio', detalhe: 'Campo objeto.corpo.inicio: um evento não é movido para o passado.' })
    const going = this._counts(e.id).vou
    if (c.vagas !== null && c.vagas < going) {
      throw new ProtocolError('limite_de_estrutura', { campo: 'objeto.corpo.vagas', detalhe: `Já são ${going} confirmados: as vagas não ficam abaixo disso.` })
    }
    const changedWhenOrWhere = c.inicio !== e.inicio || c.fim !== e.fim || c.lugar !== e.lugar || (c.online ? 1 : 0) !== e.online
    return {
      alvo: e.id,
      ctx: e.comunidade,
      depois: ({ agora: t }) => {
        const col = this._columns(c)
        this.a.executar(
          `UPDATE eventos SET titulo = :titulo, descricao = :descricao, inicio = :inicio, fim = :fim, termina = :termina, fuso = :fuso, online = :online, lugar = :lugar,
             capa = :capa, vagas = :vagas, adulto = :adulto, editado_em = :t, versoes = versoes + 1, versao_id = :versao WHERE id = :id`,
          { id: e.id, t, versao: obj.id, ...col }
        )
        // who said they are going (or maybe) hears that the when or the where changed
        if (changedWhenOrWhere) this._notifyParticipants(e, 'evento-editado', t)
      }
    }
  }

  _cancel(obj, now) {
    const e = this._fromOrganizer(obj.corpo.evento, obj.autor, now)
    return {
      alvo: e.id,
      ctx: e.comunidade,
      withoutEnvelope: true,
      depois: ({ agora: t }) => {
        this.a.executar("UPDATE eventos SET estado = 'cancelado', cancelado_em = :t WHERE id = :id", { id: e.id, t })
        this._notifyParticipants(e, 'evento-cancelado', t)
      }
    }
  }

  _notifyParticipants(e, type, now) {
    const who = this.a.todos("SELECT uid FROM presencas WHERE evento = :id AND resposta IN ('vou', 'talvez') AND uid <> :autor ORDER BY em LIMIT 500", { id: e.id, autor: e.autor })
    for (const { uid } of who) this.social.notify(uid, type, { origem: e.autor, objeto: e.id, comunidade: e.comunidade }, now)
  }

  _respond(obj, now) {
    const { evento: event, resposta: reply } = obj.corpo
    const e = this._row(event)
    const o = e ? this.a.objeto(event) : null
    const using = e?.comunidade ? this.social.comunidade(e.comunidade) : null
    // an event the author cannot read does not exist for the author
    if (!e || this.a.bloqueado('objeto', event) || !this.social.roverVisible(e.autor, now) || (e.comunidade && (!using || !this.social.canReadCommunity(using, obj.autor)))) {
      throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.evento' })
    }
    if (o.removido_em !== null || o.oculto_em !== null) throw new ProtocolError('alvo_removido', { campo: 'objeto.corpo.evento' })
    this.social.requireWithoutBlock(obj.autor, e.autor, 'objeto.corpo.evento')
    if (e.estado !== 'ativo') throw new ProtocolError('evento_encerrado', { campo: 'objeto.corpo.evento', detalhe: 'O evento foi cancelado.' })
    if (now >= e.termina) throw new ProtocolError('evento_encerrado', { campo: 'objeto.corpo.evento', detalhe: 'O evento já aconteceu.' })
    const previous = this.a.um('SELECT resposta FROM presencas WHERE evento = :evento AND uid = :uid', { evento: event, uid: obj.autor })?.resposta ?? null
    if (previous === reply) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.resposta' })
    if (reply === 'vou' && e.vagas !== null && this._counts(e.id).vou >= e.vagas) {
      throw new ProtocolError('evento_lotado', { campo: 'objeto.corpo.evento', detalhe: `As ${e.vagas} vagas estão preenchidas. Responda "talvez" para acompanhar.` })
    }
    return {
      alvo: e.id,
      ctx: e.comunidade,
      withoutEnvelope: true,
      depois: ({ agora: t }) => {
        this.a.executar(
          'INSERT INTO presencas (evento, uid, resposta, em) VALUES (:evento, :uid, :resposta, :t) ON CONFLICT(evento, uid) DO UPDATE SET resposta = excluded.resposta, em = excluded.em',
          { evento: event, uid: obj.autor, resposta: reply, t }
        )
      }
    }
  }

  /** The author removed the event: it leaves the lists and its answers go with it. */
  onRemove(targetRow) {
    if (targetRow?.tipo !== 'evento-criar') return
    this.a.executar('DELETE FROM presencas WHERE evento = :id', { id: targetRow.id })
    this.a.executar("UPDATE eventos SET titulo = '', descricao = '', lugar = NULL, capa = NULL, estado = 'cancelado' WHERE id = :id", { id: targetRow.id })
    this.a.executar("UPDATE objetos SET envelope = NULL, removido_em = COALESCE(removido_em, (SELECT removido_em FROM objetos WHERE id = :id)) WHERE tipo = 'evento-editar' AND alvo = :id", { id: targetRow.id })
  }

  /** Someone left the network: their answers leave with them (their events are removed with the rest of what they wrote). */
  leaveNetwork(uid) {
    this.a.executar('DELETE FROM presencas WHERE uid = :uid', { uid })
    this.a.executar("DELETE FROM presencas WHERE evento IN (SELECT id FROM eventos WHERE autor = :uid)", { uid })
    this.a.executar("UPDATE eventos SET titulo = '', descricao = '', lugar = NULL, capa = NULL, estado = 'cancelado' WHERE autor = :uid", { uid })
  }

  // ====================================================================================================
  // READ
  // ====================================================================================================

  _row(id) { return typeof id === 'string' && ID_RE.test(id) ? this.a.um('SELECT * FROM eventos WHERE id = :id', { id }) : null }

  _counts(id) {
    const n = { vou: 0, talvez: 0, 'nao-vou': 0 }
    for (const l of this.a.todos('SELECT resposta, COUNT(*) AS n FROM presencas WHERE evento = :id GROUP BY resposta', { id })) n[l.resposta] = l.n
    return n
  }

  /** The event for a reader, or the refusal: `nao_encontrado` when it is not theirs to read, `removido` when it left the air. */
  _readable(id, reader, now) {
    const e = this._row(id)
    const o = e ? this.a.objeto(id) : null
    const using = e?.comunidade ? this.social.comunidade(e.comunidade) : null
    if (!e || this.a.bloqueado('objeto', id) || !this.social.roverVisible(e.autor, now) || (e.comunidade && (!using || !this.social.canReadCommunity(using, reader)))) {
      throw new ProtocolError('nao_encontrado')
    }
    if (o.removido_em !== null || o.oculto_em !== null) throw new ProtocolError('removido')
    return { e, com: using }
  }

  /** The card of an event: everything a list shows. */
  _card(e, reader, now) {
    const n = this._counts(e.id)
    const using = e.comunidade ? this.social.comunidade(e.comunidade) : null
    const mine = reader ? this.a.um('SELECT resposta FROM presencas WHERE evento = :id AND uid = :uid', { id: e.id, uid: reader })?.resposta ?? null : null
    return {
      id: e.id,
      organizador: this.social.resumo(e.autor),
      comunidade: using ? { id: using.id, nome: using.nome } : null,
      titulo: e.titulo,
      descricao: e.descricao,
      inicio: e.inicio,
      fim: e.fim,
      fuso: e.fuso,
      online: e.online === 1,
      lugar: e.lugar,
      capa: e.capa ? JSON.parse(e.capa) : null,
      vagas: e.vagas,
      vagasRestantes: e.vagas === null ? null : Math.max(0, e.vagas - n.vou),
      estado: e.estado,
      encerrado: e.estado !== 'ativo' || now >= e.termina,
      criadoEm: e.criado_em,
      editado: e.versoes > 1,
      ...(e.editado_em ? { editadoEm: e.editado_em } : {}),
      ...(e.cancelado_em ? { canceladoEm: e.cancelado_em } : {}),
      ...(e.adulto === 1 ? { adulto: true } : {}),
      contagens: { vou: n.vou, talvez: n.talvez, naoVou: n['nao-vou'] },
      minhaPresenca: mine,
    }
  }

  /**
   * Lists events a reader may see. `quando`: `proximos` (not over yet, the nearest first), `semana` (starting in the next 7 days)
   * or `passados` (over, the most recent first). `comunidade` and `de` (the organizer) narrow it; `vai` lists what a uid answered
   * "vou" or "talvez" to. Events of a closed community only show to its members. A cancelled event stays in the list, marked.
   */
  listar({ quando: when = 'proximos', comunidade: community = null, de: from = null, vai: goes = null, antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null } = {}) {
    this.rele._sync()
    const now = this.agora()
    if (!EVENT_WHENS.includes(when)) throw new ProtocolError('esquema', { campo: 'quando', detalhe: `Parâmetro quando: um destes: ${EVENT_WHENS.join(', ')}.` })
    const reader = this.social.leitor(credential, now)
    const filters = [LIVE_EVENT]
    const params = { agora: now, ...this.rele._visibilityParams(now) }
    if (community !== null) {
      const using = ID_RE.test(community) ? this.social.comunidade(community) : null
      if (!using || !this.social.canReadCommunity(using, reader)) throw new ProtocolError('nao_encontrado')
      filters.push('e.comunidade = :comunidade')
      params.comunidade = using.id
    } else {
      // outside one community: what is public, and the closed communities the reader is a member of
      filters.push(`(e.comunidade IS NULL OR EXISTS (SELECT 1 FROM comunidades c WHERE c.id = e.comunidade AND (c.acesso <> 'fechada'
        OR EXISTS (SELECT 1 FROM membros m WHERE m.comunidade = c.id AND m.uid = :leitor))))`)
      params.leitor = reader
    }
    for (const [name, value, sql] of [['de', from, 'e.autor = :de'], ['vai', goes, `EXISTS (SELECT 1 FROM presencas p WHERE p.evento = e.id AND p.uid = :vai AND p.resposta IN ('vou', 'talvez'))`]]) {
      if (value === null) continue
      if (!UID_RE.test(value) || !this.social.roverVisible(value, now)) throw new ProtocolError('nao_encontrado')
      filters.push(sql)
      params[name] = value
    }
    if (when === 'passados') filters.push('e.termina <= :agora')
    else filters.push('e.termina > :agora')
    if (when === 'semana') {
      filters.push('e.inicio < :ate')
      params.ate = now + 7 * 86400
    }
    const order = when === 'passados' ? 'e.inicio DESC, e.id DESC' : 'e.inicio ASC, e.id ASC'
    return this.social.listByOffset(`SELECT e.* ${FROM_EVENTS} WHERE ${filters.join(' AND ')} ORDER BY ${order}`, params, before, limit, (e) => this._card(e, reader, now))
  }

  /** One event, with its current signed version (the creation object or the last edit). */
  detalhe(id, { credencial: credential = null } = {}) {
    this.rele._sync()
    const now = this.agora()
    const reader = this.social.leitor(credential, now)
    const { e } = this._readable(id, reader, now)
    const version = this.a.objeto(e.versao_id)
    return { ...this._card(e, reader, now), versoes: e.versoes, envelope: version?.envelope ? JSON.parse(version.envelope) : null }
  }

  /** Who answered, the most recent first. Public to whoever reads the event. */
  presencas(id, { resposta: reply = 'vou', antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null } = {}) {
    this.rele._sync()
    const now = this.agora()
    if (!RSVP_ANSWERS.includes(reply)) throw new ProtocolError('esquema', { campo: 'resposta', detalhe: `Parâmetro resposta: um destes: ${RSVP_ANSWERS.join(', ')}.` })
    const { e } = this._readable(id, this.social.leitor(credential, now), now)
    return this.social.listByOffset(
      `SELECT p.uid, p.em FROM presencas p JOIN rovers r ON r.uid = p.uid WHERE p.evento = :id AND p.resposta = :resposta AND ${ROVER_VISIBLE} ORDER BY p.em DESC, p.uid`,
      { id: e.id, resposta: reply, ...this.rele._visibilityParams(now) }, before, limit, (l) => ({ ...this.social.resumo(l.uid), em: l.em })
    )
  }
}
