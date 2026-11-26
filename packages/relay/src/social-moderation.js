// SPDX-License-Identifier: AGPL-3.0-or-later
// Moderation in 0.3: removal by whoever is responsible for a space, the public log, appeal and a rover leaving the network.
// Golden rule: NO report count hides or removes content. Only a person with a role decides.
import { ProtocolError, TIMES, canonicalize } from '../../protocol/src/index.js'
import { Write } from './social-write.js'

export class Moderation extends Write {
  /** A log row. A removal on a profile wall does not go in (`escopo: 'perfil'` belongs only to the wall owner). */
  recordModeration({ em: at, escopo: scope, contexto: context, acao: action, alvoTipo: targetType, alvo: target, autorDoAlvo: targetAuthor, motivo: reason, papel: role, por: by }) {
    return Number(this.a.executar(
      `INSERT INTO remocoes (em, escopo, contexto, acao, alvo_tipo, alvo, autor_do_alvo, motivo, papel, por)
       VALUES (:em, :escopo, :contexto, :acao, :alvoTipo, :alvo, :autorDoAlvo, :motivo, :papel, :por)`,
      { em: at, escopo: scope, contexto: context, acao: action, alvoTipo: targetType, alvo: target, autorDoAlvo: targetAuthor, motivo: reason, papel: role, por: by }
    ).lastInsertRowid)
  }

  // ====================================================================================================
  // REMOVAL BY A RESPONSIBLE PERSON
  // ====================================================================================================

  r_remocao_por_responsavel(obj) {
    const target = this.a.objeto(obj.corpo.alvo)
    if (!target || target.removido_em !== null) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.alvo' })
    const without = () => new ProtocolError('sem_permissao', { campo: 'objeto.corpo.alvo' })
    let scope
    let context
    let role
    switch (target.tipo) {
      case 'recado':
      case 'depoimento':
        if (target.alvo !== obj.autor) throw without()
        scope = 'perfil'
        context = null
        role = 'dono'
        break
      case 'topico':
      case 'resposta-forum': {
        const withId = this.ctxCommunity(target.ctx)
        const r = this.requireRole(withId, obj.autor, 'moderador', 'objeto.corpo.alvo')
        if (r.papel === 'moderador' && target.autor === r.com.dono) throw without()
        scope = 'comunidade'
        context = r.com.id
        role = r.papel
        break
      }
      case 'pagina-publicar': {
        const p = this.pagina(target.ctx)
        if (!p || p.dono !== obj.autor || target.autor === obj.autor) throw without()
        scope = 'pagina'
        context = p.id
        role = 'dono'
        break
      }
      default:
        throw without()
    }
    if (target.oculto_em !== null) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.alvo' })
    return {
      ctx: context,
      alvo: target.id,
      depois: ({ agora: now }) => {
        this.hide(target, obj.autor, now)
        if (scope !== 'perfil') {
          this.recordModeration({
            em: now, escopo: scope, contexto: context, acao: 'remocao', alvoTipo: target.tipo, alvo: target.id, autorDoAlvo: target.autor, motivo: obj.corpo.motivo, papel: role, por: obj.autor
          })
        }
        this.notify(target.autor, 'removido-por-responsavel', { origem: null, objeto: target.id, comunidade: scope === 'comunidade' ? context : null, pagina: scope === 'pagina' ? context : null }, now)
      }
    }
  }

  /** Hides: the content disappears from reads and search, but the envelope stays retained for the appeal. */
  hide(line, by, now) {
    this.a.executar('UPDATE objetos SET oculto_em = :agora, oculto_por = :por WHERE id = :id', { id: line.id, agora: now, por: by })
    this.clearDerived(line)
  }

  /** Undoes `ocultar` (appeal reversed). The envelope must still be retained. */
  restaurar(line) {
    if (line.envelope === null) return false
    this.a.executar('UPDATE objetos SET oculto_em = NULL, oculto_por = NULL WHERE id = :id', { id: line.id })
    const body = JSON.parse(line.envelope).objeto.corpo
    if (line.tipo === 'topico') {
      const t = this.topico(line.id)
      const tags = this.tagsOf(JSON.parse(t.tags), t.titulo, t.texto)
      this.index('topico', t.id, t.comunidade, t.titulo, `${t.texto} ${tags.join(' ')}`)
      this.recordTags(t.id, t.autor, t.comunidade, tags, line.criado_em)
    }
    if (line.tipo === 'pagina-publicar') this.recordTags(line.id, line.autor, null, this.tagsOf(body.tags, body.texto, body.titulo ?? ''), line.criado_em)
    return true
  }

  /** Deletes the read copies of content that went offline (search index and tags). */
  clearDerived(line) {
    switch (line.tipo) {
      case 'topico':
        this.unindex('topico', line.id)
        this.deleteTags(line.id)
        break
      case 'pagina-publicar':
      case 'postagem':
      case 'entrega':
        this.deleteTags(line.id)
        break
      default:
    }
  }

  /** Effects of `remocao-pelo-autor` on the derived state (the relay records the removal of the object itself). */
  onRemoveByAuthor(line, now) {
    this.clearDerived(line)
    if (line.tipo === 'topico') this.a.executar("UPDATE topicos SET titulo = '', texto = '', tags = '[]', enquete = NULL WHERE id = :id", { id: line.id })
    // if the deleted reply was the one that resolved, the "resolved" mark falls (for any other type the condition matches nothing)
    this.a.executar('UPDATE topicos SET resolvido_resposta = NULL, resolvido_por = NULL, resolvido_em = NULL WHERE resolvido_resposta = :id', { id: line.id })
    if (line.tipo === 'pagina-criar') this.closePage(line.id, line.autor, now)
  }

  closePage(id, by, now) {
    this.a.executar('UPDATE paginas SET encerrada_em = :agora WHERE id = :id', { id, agora: now })
    this.unindex('pagina', id)
    this.a.executar("UPDATE objetos SET oculto_em = :agora, oculto_por = :por WHERE ctx = :id AND oculto_em IS NULL AND removido_em IS NULL", { id, agora: now, por: by })
    this.a.executar("DELETE FROM tags_uso WHERE objeto IN (SELECT id FROM objetos WHERE ctx = :id AND tipo = 'pagina-publicar')", { id })
    this.a.executar('DELETE FROM pagina_seguidores WHERE pagina = :id', { id })
  }

  // ====================================================================================================
  // APPEAL
  // ====================================================================================================

  r_apelacao(obj, now) {
    const { tipo: type, alvo: target } = obj.corpo
    let record
    let decider
    let context
    if (type === 'remocao') {
      const line = this.a.objeto(target)
      const hidden = line && (line.oculto_em !== null || this.a.bloqueado('objeto', target))
      if (!line || line.autor !== obj.autor || !hidden) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.alvo' })
      record = this.a.um("SELECT * FROM remocoes WHERE alvo = :alvo AND acao = 'remocao' ORDER BY id DESC LIMIT 1", { alvo: target })
      // no record: it was the removal of a profile wall post (or the closing of a space), which has no appeal
      if (!record) throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.alvo' })
      context = record.contexto
      decider = record.papel === 'moderador' ? 'dono' : 'rele'
    } else {
      const b = this.a.um('SELECT * FROM banidos WHERE comunidade = :c AND uid = :uid', { c: target, uid: obj.autor })
      if (!b || !this.a.um('SELECT 1 AS n FROM comunidades WHERE id = :c AND encerrada_em IS NULL', { c: target })) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.alvo' })
      record = this.a.um("SELECT * FROM remocoes WHERE alvo = :uid AND contexto = :c AND acao = 'banimento' ORDER BY id DESC LIMIT 1", { uid: obj.autor, c: target })
      if (!record) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.alvo' })
      context = target
      decider = b.papel_de_quem_baniu === 'moderador' ? 'dono' : 'rele'
    }
    if (record.apelacao_id !== null) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.alvo' })
    if (now > record.em + TIMES.janelaDeApelacaoS) throw new ProtocolError('fora_da_janela', { campo: 'objeto.corpo.alvo' })
    return {
      ctx: context,
      alvo: target,
      depois: ({ agora: t }) => {
        this.a.executar(
          `INSERT INTO apelacoes (id, tipo, alvo, contexto, autor, decisor, envelope, em, estado, remocao_id)
           VALUES (:id, :tipo, :alvo, :contexto, :autor, :decisor, :envelope, :t, 'aberta', :remocao)`,
          { id: obj.id, tipo: type, alvo: target, contexto: context, autor: obj.autor, decisor: decider, envelope: canonicalize({ objeto: obj }), t, remocao: record.id }
        )
        this.a.executar("UPDATE remocoes SET apelacao_id = :id, apelacao_estado = 'aberta' WHERE id = :remocao", { id: obj.id, remocao: record.id })
        if (type === 'banimento') this.a.executar("UPDATE banidos SET apelacao = 'aberta' WHERE comunidade = :c AND uid = :uid", { c: target, uid: obj.autor })
        if (decider === 'dono' && context) {
          const using = this.a.um('SELECT dono FROM comunidades WHERE id = :c', { c: context })
          if (using) this.notify(using.dono, 'apelacao-recebida', { origem: obj.autor, objeto: obj.id, comunidade: context }, t)
        }
      }
    }
  }

  r_apelacao_decisao(obj) {
    const ap = this.a.um('SELECT * FROM apelacoes WHERE id = :id', { id: obj.corpo.apelacao })
    if (!ap) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.apelacao' })
    const using = ap.contexto ? this.a.um('SELECT dono FROM comunidades WHERE id = :c AND encerrada_em IS NULL', { c: ap.contexto }) : null
    if (ap.decisor !== 'dono' || !using || using.dono !== obj.autor) throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.apelacao' })
    if (ap.estado !== 'aberta') throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.apelacao' })
    return { ctx: ap.contexto, depois: ({ agora: now }) => this.decideAppeal(ap, obj.corpo.resultado, now) }
  }

  /** Applies the decision (by the owner per object, or by administration per route). */
  decideAppeal(ap, result, now) {
    this.a.executar('UPDATE apelacoes SET estado = :resultado, decidida_em = :agora WHERE id = :id', { id: ap.id, resultado: result, agora: now })
    this.a.executar('UPDATE remocoes SET apelacao_estado = :resultado WHERE apelacao_id = :id', { id: ap.id, resultado: result })
    if (ap.tipo === 'banimento') {
      if (result === 'revertida') this.a.executar('DELETE FROM banidos WHERE comunidade = :c AND uid = :uid', { c: ap.contexto, uid: ap.autor })
      else this.a.executar("UPDATE banidos SET apelacao = 'mantida' WHERE comunidade = :c AND uid = :uid", { c: ap.contexto, uid: ap.autor })
    } else if (result === 'revertida') {
      const line = this.a.objeto(ap.alvo)
      if (line) this.restaurar(line)
      // removal by the relay itself: reverting means unblocking the object
      this.a.executar("DELETE FROM bloqueios WHERE tipo = 'objeto' AND alvo = :alvo", { alvo: ap.alvo })
    }
    this.notify(ap.autor, 'apelacao-decidida', { origem: null, objeto: ap.id, comunidade: ap.contexto }, now)
  }

  /** Decision by the relay administration, for the appeal whose decider is `rele`. */
  decideRelayAppeal(id, result) {
    const ap = this.a.um('SELECT * FROM apelacoes WHERE id = :id', { id })
    if (!ap || ap.decisor !== 'rele') throw new ProtocolError('nao_encontrado')
    if (ap.estado !== 'aberta') throw new ProtocolError('ja_existe')
    this.a.transaction(() => this.decideAppeal(ap, result, this.agora()))
  }

  // ====================================================================================================
  // LEAVING THE NETWORK
  // ====================================================================================================

  /**
   * Removing the profile is leaving. Besides what the relay already deletes, every relation goes away, and ownership of what the rover
   * owned passes on (community: oldest moderator, then oldest member; page: oldest administrator). With no heir,
   * the space closes.
   */
  leaveNetwork(uid, now) {
    for (const t of this.a.todos('SELECT * FROM topicos WHERE autor = :uid', { uid })) {
      this.unindex('topico', t.id)
      this.a.executar("UPDATE topicos SET titulo = '', texto = '', tags = '[]', enquete = NULL WHERE id = :id", { id: t.id })
    }
    this.unindex('rover', uid)
    this.a.executar('DELETE FROM tags_uso WHERE autor = :uid', { uid })
    this.a.executar('DELETE FROM amizades WHERE de = :uid OR para = :uid', { uid })
    this.a.executar('DELETE FROM relacoes WHERE autor = :uid OR alvo = :uid', { uid })
    this.a.executar('DELETE FROM votos WHERE uid = :uid', { uid })
    this.a.executar('DELETE FROM pagina_seguidores WHERE uid = :uid', { uid })
    this.a.executar('DELETE FROM notificacoes WHERE dest = :uid', { uid })
    this.a.executar('UPDATE notificacoes SET origem = NULL WHERE origem = :uid', { uid })
    this.a.executar('DELETE FROM convites WHERE uid = :uid OR por = :uid', { uid })
    this.a.executar('DELETE FROM pedidos_de_entrada WHERE uid = :uid', { uid })
    this.a.executar('DELETE FROM banidos WHERE uid = :uid', { uid })
    for (const c of this.a.todos('SELECT id FROM comunidades WHERE dono = :uid AND encerrada_em IS NULL', { uid })) {
      const heir = this.a.um(
        "SELECT uid FROM membros WHERE comunidade = :c AND uid <> :uid ORDER BY CASE papel WHEN 'moderador' THEN 0 ELSE 1 END, desde, uid LIMIT 1",
        { c: c.id, uid }
      )
      if (!heir) { this.closeCommunity(c.id, uid, now); continue }
      this.a.executar("UPDATE membros SET papel = 'dono' WHERE comunidade = :c AND uid = :h", { c: c.id, h: heir.uid })
      this.a.executar('UPDATE comunidades SET dono = :h WHERE id = :c', { c: c.id, h: heir.uid })
      this.notify(heir.uid, 'posse-recebida', { origem: null, comunidade: c.id }, now)
    }
    this.a.executar('DELETE FROM membros WHERE uid = :uid', { uid })
    for (const p of this.a.todos('SELECT id FROM paginas WHERE dono = :uid AND encerrada_em IS NULL', { uid })) {
      const heir = this.a.um('SELECT uid FROM pagina_admins WHERE pagina = :p AND uid <> :uid ORDER BY desde, uid LIMIT 1', { p: p.id, uid })
      if (!heir) { this.closePage(p.id, uid, now); continue }
      this.a.executar('UPDATE paginas SET dono = :h WHERE id = :p', { p: p.id, h: heir.uid })
    }
    this.a.executar('DELETE FROM pagina_admins WHERE uid = :uid', { uid })
  }

  // ====================================================================================================
  // RETENTION
  // ====================================================================================================

  /** What passed the deadline goes away: retained envelope of hidden content, appeal text, the author of the log actions. */
  clearModeration(now) {
    const cutoff = now - TIMES.retencaoDeRemovidoS
    this.a.executar('UPDATE objetos SET envelope = NULL WHERE oculto_em IS NOT NULL AND oculto_em < :corte AND envelope IS NOT NULL', { corte: cutoff })
    this.a.executar('UPDATE apelacoes SET envelope = NULL WHERE em < :corte AND envelope IS NOT NULL', { corte: cutoff })
    this.a.executar('UPDATE remocoes SET por = NULL WHERE em < :corte AND por IS NOT NULL', { corte: cutoff })
    this.clearNotifications(now)
  }
}
