// SPDX-License-Identifier: AGPL-3.0-or-later
// Notifications: one fact per row, no text. The row stores only ids and the type; whoever reads opens the object, and the read obeys
// the visibility of now. Nobody is notified by a rover they muted or blocked, and a mention by a non-friend has an hourly cap.
import { DEFAULT_PAGE, BURST_AGAINST_TARGET, TIMES, extractMentions } from '../../protocol/src/index.js'
import { Base, ACTION_TYPES } from './social-base.js'

export const NOTIFICATION_TYPES = Object.freeze([
  'recado', 'pedido-de-amizade', 'amizade-aceita', 'depoimento-para-aceitar', 'depoimento-aceito', 'resposta-no-topico',
  'resposta-a-voce', 'citacao', 'mencao', 'convite-comunidade', 'pedido-de-entrada', 'entrada-aprovada', 'selo-recebido',
  'removido-por-responsavel', 'apelacao-recebida', 'apelacao-decidida', 'expulso', 'banido', 'posse-recebida', 'resolveu',
  'novo-seguidor',
  // 0.4.0: private messages (only with the feature on; no object, only the origin)
  'conversa-pedido', 'conversa-aceita',
  // 0.11.0 part 4: an event you said you go to (or maybe) changed its when or where, or was cancelled
  'evento-editado', 'evento-cancelado'
])
const MAX_RETENTION = 500

export class Notifications extends Base {
  /**
   * Creates the notification if it fits: the recipient exists and is visible, is not the author, did not mute or block the origin.
   */
  notify(dest, type, { origem: origin = null, objeto: object = null, comunidade: community = null, pagina: page = null } = {}, now) {
    if (!dest || dest === origin || !this.roverVisible(dest, now)) return
    if (origin && (this.blockBetween(dest, origin) || this.euSilenciei(dest, origin))) return
    this.a.executar(
      'INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:dest, :tipo, :origem, :objeto, :comunidade, :pagina, :agora)',
      { dest, tipo: type, origem: origin, objeto: object, comunidade: community, pagina: page, agora: now }
    )
  }

  /**
   * Mentions in the text of an object. The handle must exist; whoever cannot read the space where the text is gets no notice.
   * `leitorDe(uid)` says whether the mentioned person can read the content (closed community).
   */
  mencoes(text, { origem: origin, objeto: object, comunidade: community = null, pagina: page = null, alreadyNotified = new Set() }, now) {
    for (const handle of extractMentions(text)) {
      const r = this.a.roverByHandle(handle)
      if (!r || r.uid === origin || alreadyNotified.has(r.uid)) continue
      if (community) {
        const using = this.comunidade(community)
        if (!using || !this.canReadCommunity(using, r.uid)) continue
      }
      if (!this.activeFriendship(origin, r.uid)) {
        const recent = this.contar("FROM notificacoes WHERE dest = :dest AND tipo = 'mencao' AND em > :desde", { dest: r.uid, desde: now - 3600 })
        if (recent >= BURST_AGAINST_TARGET.strangerMentionsPerHour) continue
      }
      this.notify(r.uid, 'mencao', { origem: origin, objeto: object, comunidade: community, pagina: page }, now)
      alreadyNotified.add(r.uid)
    }
  }

  /** Keeps only the latest 500 and the last 90 days. */
  clearNotifications(now) {
    this.a.executar('DELETE FROM notificacoes WHERE em < :corte', { corte: now - TIMES.notificationRetentionS })
    this.a.executar(
      'DELETE FROM notificacoes WHERE seq IN (SELECT seq FROM (SELECT seq, ROW_NUMBER() OVER (PARTITION BY dest ORDER BY seq DESC) AS pos FROM notificacoes) WHERE pos > :max)',
      { max: MAX_RETENTION }
    )
  }

  /** Lists a rover's notifications, newest first. The `objeto` becomes null if the reader can no longer read what it points to. */
  listar(uid, { antes: before = null, limite: limit = DEFAULT_PAGE }, now) {
    const lines = this.a.todos(
      'SELECT * FROM notificacoes WHERE dest = :uid AND (:antes IS NULL OR seq < :antes) ORDER BY seq DESC LIMIT :limite',
      { uid, antes: before, limite: limit + 1 }
    )
    const items = lines.slice(0, limit).map((n) => {
      const readable = n.objeto ? this.objectVisibleForNotification(n, uid, now) : null
      const community = n.comunidade && this.comunidade(n.comunidade) && this.canReadCommunityOrInvite(n.comunidade, uid) ? n.comunidade : null
      const page = n.pagina && this.pagina(n.pagina) ? n.pagina : null
      return {
        seq: n.seq,
        tipo: n.tipo,
        em: n.em,
        origem: n.origem && n.tipo !== 'selo-recebido' ? this.resumo(n.origem) : null,
        objeto: readable ? n.objeto : null,
        comunidade: community,
        pagina: page,
        // 0.3.1: the name of the place and the topic the notice leads to, only when the reader can see it (proposal 0006)
        lugar: this.noticePlace(community, page),
        topico: readable ? this.noticeTopic(n.objeto) : null
      }
    })
    return { itens: items, proximo: lines.length > limit ? lines[limit - 1].seq : null }
  }

  /** `{ tipo, id, nome }` of the place of the notice, or `null`. Both ids already passed the read rule of whoever receives it. */
  noticePlace(community, page) {
    if (community) return { tipo: 'comunidade', id: community, nome: this.comunidade(community).nome }
    if (page) return { tipo: 'pagina', id: page, nome: this.pagina(page).nome }
    return null
  }

  /** The topic the notice leads to: the topic itself, or the topic of a forum reply. The object was already taken as readable. */
  noticeTopic(objectId) {
    const l = this.a.objeto(objectId)
    const id = l?.tipo === 'topico' ? l.id : l?.tipo === 'resposta-forum' ? l.ctx : null
    const t = id ? this.topico(id) : null
    return t ? { id: t.id, titulo: t.titulo } : null
  }

  /** Is the object of a notification still readable? An action (which has no envelope) never is: the client uses the context. */
  objectVisibleForNotification(n, uid, now) {
    const l = this.a.objeto(n.objeto)
    if (!l || ACTION_TYPES.includes(l.tipo)) return false
    if (l.removido_em !== null || l.oculto_em !== null) return false
    if (l.tipo === 'depoimento' && l.estado !== 'aceito' && l.alvo !== uid && l.autor !== uid) return false
    return this.readableSpace(l, uid) && this.roverVisible(l.autor, now) !== null
  }

  canReadCommunityOrInvite(communityId, uid) {
    const using = this.comunidade(communityId)
    return using !== null && (this.canReadCommunity(using, uid) || this.convidado(using.id, uid))
  }

  contagem(uid, since) {
    return this.contar('FROM notificacoes WHERE dest = :uid AND seq > :desde', { uid, desde: since })
  }
}

