// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.11.0 (proposal 0013): editing what was published, in the reference relay. Announced as `edicao` in /v1/info.
//
// The original object is never touched: its id is the hash of its content. An `edicao` is one more signed object of the same
// author, kept whole; the LAST edit on air is what the publication says now, and every item that shows the publication carries it
// in `edicao` next to the original `envelope` (a client from before 0.11.0 ignores the field and shows the original text).
//
//   - only the author edits, and only what is on air;
//   - the limits are the ones the target had when it was published (protocol: checkEdit);
//   - at most EDIT_LIMITS.porAlvoPorHora edits of the same publication in one hour and versoesPorAlvo versions in all;
//   - the history is public to whoever can read the publication: GET /v1/objetos/:id/edicoes;
//   - the author takes one version out of the history by removing that `edicao` object (remocao-pelo-autor); removing the
//     publication takes its whole history; the operator blocks one version like any object.
//
// No table of its own: the edits live in `objetos` (tipo `edicao`, `alvo` the publication), under the index (tipo, alvo).
import { ProtocolError, ID_RE, limitError, extractMentions } from '../../protocol/src/index.js'
import { EDIT_TARGETS, EDIT_LIMITS, checkEdit, versionContent } from '../../protocol/src/edits.js'

// An edit that counts: kept, not removed, not hidden, not blocked by the operator. Alias `e`.
const LIVE_EDIT = `e.tipo = 'edicao' AND e.envelope IS NOT NULL AND e.removido_em IS NULL AND e.oculto_em IS NULL
  AND e.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')`

const sameContent = (a, b) => a.titulo === b.titulo && a.texto === b.texto && a.adulto === b.adulto && a.tags.length === b.tags.length && a.tags.every((t, i) => t === b.tags[i])

export class Edits {
  /** @param {import('./relay.js').Rele} rele */
  constructor(relay) {
    this.rele = relay
    this.a = relay.store
    this.social = relay.social
  }

  info() {
    return { alvos: [...EDIT_TARGETS], porAlvoPorHora: EDIT_LIMITS.porAlvoPorHora, versoesPorAlvo: EDIT_LIMITS.versoesPorAlvo, historicoPublico: true }
  }

  /** The type of the publication an `edicao` points to, for the release (an authorization that covers the target covers its edit). */
  targetType(obj) {
    const target = this.a.objeto(obj.corpo.alvo)
    if (!target) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
    return target.tipo
  }

  /** The last edit on air of a publication (the row of `objetos`), or null. */
  ultima(id) {
    return this.a.um(`SELECT e.* FROM objetos e WHERE e.alvo = :id AND ${LIVE_EDIT} ORDER BY e.seq DESC LIMIT 1`, { id })
  }

  /** What the publication says now: the content of the last edit on air, or of the original object. */
  currentContent(line) {
    const last = this.ultima(line.id)
    const source = last ?? line
    return source.envelope ? versionContent(JSON.parse(source.envelope).objeto) : null
  }

  /** Rules of the `edicao` type. Returns the effect relay.js stores (the envelope stays: an edit is content). */
  regras(obj, now) {
    const c = obj.corpo
    const target = this.a.objeto(c.alvo)
    if (!target || this.a.bloqueado('objeto', target.id)) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
    if (!EDIT_TARGETS.includes(target.tipo)) {
      throw new ProtocolError('esquema', { campo: 'objeto.corpo.alvo', detalhe: `Campo objeto.corpo.alvo: só se edita um destes: ${EDIT_TARGETS.join(', ')}.` })
    }
    if (target.autor !== obj.autor) throw new ProtocolError('nao_e_autor', { campo: 'objeto.corpo.alvo', detalhe: 'Só o autor edita o que publicou.' })
    if (target.removido_em !== null || target.oculto_em !== null || target.envelope === null) throw new ProtocolError('alvo_removido', { campo: 'objeto.corpo.alvo' })
    const f = checkEdit(target.tipo, c)
    if (f) throw new ProtocolError('esquema', { campo: f.caminho, detalhe: `Campo ${f.caminho}: ${f.mensagem}.` })

    // the forum keeps its own rules: the author still takes part in the community, and a locked topic is not rewritten
    let topic = null
    let using = null
    if (target.tipo === 'topico' || target.tipo === 'resposta-forum') {
      const r = this.social._topicToActOn(target.tipo === 'topico' ? target.id : target.ctx, obj.autor)
      topic = r.t
      using = r.com
      if (topic.trancado) throw new ProtocolError('trancado', { campo: 'objeto.corpo.alvo' })
    } else if (!this.social.readableSpace(target, obj.autor)) {
      throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
    }

    const current = this.currentContent(target)
    const newValue = versionContent(obj)
    if (sameContent(current, newValue)) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.texto', detalhe: 'A edição não muda nada.' })

    const atTime = this.a.um("SELECT COUNT(*) AS n, MIN(recebido_em) AS velho FROM objetos WHERE tipo = 'edicao' AND alvo = :id AND recebido_em > :desde", { id: target.id, desde: now - 3600 })
    if (atTime.n >= EDIT_LIMITS.porAlvoPorHora) {
      throw limitError('limite_de_taxa', { max: EDIT_LIMITS.porAlvoPorHora, janelaS: 3600, retryAfterS: atTime.velho + 3600 - now, deQue: 'edições da mesma publicação', campo: 'objeto.corpo.alvo' })
    }
    const versions = 1 + this.a.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'edicao' AND alvo = :id", { id: target.id }).n + (target.tipo === 'topico' ? topic.versoes - 1 - this._newTopicEdits(target.id) : 0)
    if (versions >= EDIT_LIMITS.versoesPorAlvo) {
      throw new ProtocolError('limite_de_estrutura', { campo: 'objeto.corpo.alvo', detalhe: `Uma publicação guarda no máximo ${EDIT_LIMITS.versoesPorAlvo} versões. Para mudar de novo, remova e publique outra.` })
    }

    return {
      alvo: target.id,
      // the edit lives in the space of what it edits, so who reads one reads the other
      ctx: target.tipo === 'topico' ? target.id : target.ctx,
      depois: ({ agora: t }) => {
        const text = `${newValue.titulo ?? ''}\n${newValue.texto}`
        const community = using?.id ?? null
        if (target.tipo === 'topico') {
          this.a.executar('UPDATE topicos SET titulo = :titulo, texto = :texto, tags = :tags, versoes = versoes + 1 WHERE id = :id', { id: target.id, titulo: newValue.titulo, texto: newValue.texto, tags: JSON.stringify(newValue.tags) })
          const tags = this.social.tagsOf(newValue.tags, newValue.titulo, newValue.texto)
          this.social.index('topico', target.id, community, newValue.titulo, `${newValue.texto} ${tags.join(' ')}`)
          this.social.recordTags(target.id, obj.autor, community, tags, t)
        } else if (target.tipo === 'postagem') {
          this.social.deleteTags(target.id)
          this.social.recordTags(target.id, obj.autor, null, this.social.tagsOf(newValue.tags, text), t)
        }
        // only who was not mentioned before hears about it
        const before = new Set(extractMentions(`${current.titulo ?? ''}\n${current.texto}`))
        const newItems = extractMentions(text).filter((h) => !before.has(h))
        if (newItems.length) this.social.mencoes(newItems.map((h) => `@${h}`).join(' '), { origem: obj.autor, objeto: target.id, comunidade: community }, t)
      }
    }
  }

  /** How many of the versions counted in `topicos.versoes` came from `edicao` objects (the others came from `topico-editar`). */
  _newTopicEdits(id) {
    return this.a.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'edicao' AND alvo = :id", { id }).n
  }

  /**
   * The author removed something. A publication takes its whole history with it (every edit loses its envelope). A removed
   * `edicao` leaves the history; when it was the last one, the publication goes back to saying what the version before said.
   */
  onRemove(targetRow, now) {
    if (!targetRow) return
    if (EDIT_TARGETS.includes(targetRow.tipo)) {
      this.a.executar("UPDATE objetos SET envelope = NULL, removido_em = COALESCE(removido_em, :agora) WHERE tipo = 'edicao' AND alvo = :id", { id: targetRow.id, agora: now })
      return
    }
    if (targetRow.tipo !== 'edicao') return
    const target = this.a.objeto(targetRow.alvo)
    if (!target || target.envelope === null) return
    // (the removed edit already lost its envelope: `currentContent` reads what is left)
    const nowSays = this.currentContent(target)
    if (target.tipo === 'topico' && nowSays) {
      const using = this.social.topico(target.id)?.comunidade ?? null
      this.a.executar('UPDATE topicos SET titulo = :titulo, texto = :texto, tags = :tags WHERE id = :id', { id: target.id, titulo: nowSays.titulo, texto: nowSays.texto, tags: JSON.stringify(nowSays.tags) })
      const tags = this.social.tagsOf(nowSays.tags, nowSays.titulo, nowSays.texto)
      this.social.index('topico', target.id, using, nowSays.titulo, `${nowSays.texto} ${tags.join(' ')}`)
      this.social.recordTags(target.id, target.autor, using, tags, now)
    } else if (target.tipo === 'postagem' && nowSays) {
      this.social.deleteTags(target.id)
      this.social.recordTags(target.id, target.autor, null, this.social.tagsOf(nowSays.tags, `${nowSays.titulo ?? ''}\n${nowSays.texto}`), now)
    }
  }

  // ====================================================================================================
  // READ
  // ====================================================================================================

  /**
   * The extra field of an item that can be edited: `edicao`, only when the publication was edited. It carries the content as it
   * reads now, the id and the instant of the last edit, and how many versions there are (the original counts as the first).
   */
  itemExtra(line) {
    if (!EDIT_TARGETS.includes(line.tipo)) return {}
    const last = this.ultima(line.id)
    if (!last) return {}
    const versions = 1 + this.a.um(`SELECT COUNT(*) AS n FROM objetos e WHERE e.alvo = :id AND ${LIVE_EDIT}`, { id: line.id }).n
    return { edicao: { id: last.id, em: last.criado_em, versoes: versions, ...versionContent(JSON.parse(last.envelope).objeto) } }
  }

  /**
   * The public history of a publication: the original and every edit on air, oldest first, each one as it was signed. Whoever can
   * read the publication reads its history; anything else is `nao_encontrado` or `removido`, as for the publication itself.
   */
  historico(id, { credencial: credential = null } = {}) {
    this.rele._sync()
    const now = this.rele.relogio()
    const reader = this.social.leitor(credential, now)
    const target = ID_RE.test(id) ? this.a.objeto(id) : null
    if (!target || !EDIT_TARGETS.includes(target.tipo) || this.a.bloqueado('objeto', id) || !this.social.roverVisible(target.autor, now) || !this.social.readableSpace(target, reader)) {
      throw new ProtocolError('nao_encontrado')
    }
    if (target.removido_em !== null || target.oculto_em !== null || target.envelope === null) throw new ProtocolError('removido')
    // a forum topic may also have edits of the older kind (`topico-editar`, 0.3): they are versions too, in the order they came
    const editions = this.a.todos(
      `SELECT e.id, e.tipo, e.envelope, e.criado_em FROM objetos e
       WHERE ((e.alvo = :id AND ${LIVE_EDIT}) OR (e.tipo = 'topico-editar' AND e.ctx = :id AND e.envelope IS NOT NULL AND e.removido_em IS NULL))
       ORDER BY e.seq`,
      { id }
    )
    const version = (l, i) => {
      const envelope = JSON.parse(l.envelope)
      return { versao: i + 1, id: l.id, criadoEm: l.criado_em, ...versionContent(envelope.objeto), envelope }
    }
    return { alvo: id, tipo: target.tipo, autor: this.social.resumo(target.autor), itens: [target, ...editions].map(version) }
  }
}
