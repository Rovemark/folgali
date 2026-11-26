// SPDX-License-Identifier: AGPL-3.0-or-later
// The WRITE RULES of the social types of 0.3. Each type has an `r_<type>` method that checks the state (target exists, role,
// block, structural limits) and returns an EFFECT:
//
//   { alvo, ctx, sub, estado, withoutEnvelope, resultado, depois({ seq, agora }) }
//
// `depois` runs inside the write transaction, after the INSERT of the object, and is where the derived state changes and the notifications go out.
// Nothing here writes before `depois`: a refusal never leaves a trace.
import {
  STRUCTURE, ProtocolError, MIN_AGE_S, RAID, BURST_AGAINST_TARGET, TIMES, nameKey, waitInWords, extractMentions
} from '../../protocol/src/index.js'
import { ACTION_TYPES, pairOf } from './social-base.js'
import { closePairConversations } from './messages.js'
import { Index } from './social-index.js'


export class Write extends Index {
  // ====================================================================================================
  // CHEAP GATES
  // ====================================================================================================

  /** Minimum account age for what weighs (creating a community or page, testimonial, badge). */
  checkAge(obj, stored, now) {
    const min = MIN_AGE_S[obj.tipo]
    if (!min) return // (a rover's first object, the profile, has no minimum age and no stored account)
    const age = now - stored.criado_em
    if (age < min) throw new ProtocolError('conta_nova', { detalhe: `Este tipo pede conta com ${waitInWords(min)} de idade.`, retryAfterS: min - age })
  }

  /** Burst caps against a target (they count only accepted objects), after the normal rate caps. */
  extraRate(obj, effect, now) {
    // n >= cap implies the oldest in the window is still inside it, so the wait is always at least 1 second
    const refuse = (detail, retryAfterS) => { throw new ProtocolError('limite_de_taxa', { detalhe: detail, retryAfterS }) }
    const day = now - 86400
    if (obj.tipo === 'recado') {
      const target = obj.corpo.alvo
      const byPair = this.a.um("SELECT COUNT(*) AS n, MIN(recebido_em) AS velho FROM objetos WHERE tipo = 'recado' AND autor = :autor AND alvo = :alvo AND recebido_em > :dia", { autor: obj.autor, alvo: target, dia: day })
      if (byPair.n >= BURST_AGAINST_TARGET.notesPerPairPerDay) refuse(`Limite de ${BURST_AGAINST_TARGET.notesPerPairPerDay} recados por dia para o mesmo mural.`, byPair.velho + 86400 - now)
      if (!effect.amigos) {
        const strangers = this.a.um(
          `SELECT COUNT(*) AS n, MIN(o.recebido_em) AS velho FROM objetos o WHERE o.tipo = 'recado' AND o.alvo = :alvo AND o.recebido_em > :dia
             AND NOT EXISTS (SELECT 1 FROM amizades am WHERE am.estado = 'ativa'
               AND am.par = CASE WHEN o.autor < o.alvo THEN o.autor || '|' || o.alvo ELSE o.alvo || '|' || o.autor END)`,
          { alvo: target, dia: day }
        )
        if (strangers.n >= BURST_AGAINST_TARGET.strangerNotesPerWallPerDay) refuse('Este mural já recebeu recados demais de quem não é amigo hoje.', strangers.velho + 86400 - now)
      }
    }
    if (obj.tipo === 'selo') {
      const r = this.a.um("SELECT COUNT(*) AS n, MIN(recebido_em) AS velho FROM objetos WHERE tipo = 'selo' AND alvo = :alvo AND recebido_em > :dia", { alvo: obj.corpo.alvo, dia: day })
      if (r.n >= BURST_AGAINST_TARGET.receivedBadgesPerDay) refuse('Este rover já recebeu selos demais hoje.', r.velho + 86400 - now)
    }
    if (obj.tipo === 'resposta-forum' && this.accountAge(obj.autor, now) < TIMES.contaConsideradaNaDescobertaS) {
      // The cap per new account (20% of normal) already comes from the age factor. Here is the cap of ALL new accounts together on the same topic:
      // a burst of many accounts does not get through just because each one is small.
      const all = this.a.um(
        `SELECT COUNT(*) AS n, MIN(o.recebido_em) AS velho FROM objetos o JOIN rovers r ON r.uid = o.autor
         WHERE o.tipo = 'resposta-forum' AND o.ctx = :topico AND o.recebido_em > :hora AND :agora - r.criado_em < :idade`,
        { topico: obj.corpo.topico, hora: now - 3600, agora: now, idade: TIMES.contaConsideradaNaDescobertaS }
      )
      if (all.n >= BURST_AGAINST_TARGET.newAccountTopicRepliesPerHour) refuse('Este tópico já recebeu respostas demais de contas novas na última hora.', all.velho + 3600 - now)
    }
  }

  // ====================================================================================================
  // DISPATCH
  // ====================================================================================================

  /** Rules of a social type. The old types stay in relay.js. */
  regras(obj, now, stored) {
    const f = this[`r_${obj.tipo.replaceAll('-', '_')}`]
    const effect = f.call(this, obj, now, stored)
    effect.withoutEnvelope ??= ACTION_TYPES.includes(obj.tipo)
    return effect
  }

  // ====================================================================================================
  // ROVER PAGE
  // ====================================================================================================

  r_estado(obj) {
    return {
      withoutEnvelope: true,
      depois: ({ agora: now }) => this.a.executar('UPDATE rovers SET estado = :estado, estado_em = :agora WHERE uid = :uid', { estado: obj.corpo.estado, agora: now, uid: obj.autor })
    }
  }

  r_recado(obj, now) {
    const target = this.requireRover(obj.corpo.alvo, now)
    this.requireWithoutBlock(obj.autor, target.uid)
    const friends = this.activeFriendship(obj.autor, target.uid) !== null
    if (target.recados === 'ninguem' || (target.recados === 'amigos' && !friends)) throw new ProtocolError('interacao_nao_permitida', { campo: 'objeto.corpo.alvo' })
    return {
      alvo: target.uid,
      ctx: target.uid,
      amigos: friends,
      depois: ({ agora: t }) => {
        this.notify(target.uid, 'recado', { origem: obj.autor, objeto: obj.id }, t)
        this.mencoes(obj.corpo.texto, { origem: obj.autor, objeto: obj.id }, t)
      }
    }
  }

  r_amizade(obj, now) {
    const { alvo: targetUid, acao: action } = obj.corpo
    const target = this.requireRover(targetUid, now)
    this.requireWithoutBlock(obj.autor, target.uid)
    const pair = pairOf(obj.autor, target.uid)
    const line = this.amizade(obj.autor, target.uid)
    const friendsOf = (uid) => this.contar("FROM amizades WHERE estado = 'ativa' AND (de = :uid OR para = :uid)", { uid })
    const requireSpace = () => {
      if (friendsOf(obj.autor) >= STRUCTURE.amigos || friendsOf(target.uid) >= STRUCTURE.amigos) throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.amigos} amigos.` })
    }
    const activate = (from, to, t) => this.a.executar(
      "INSERT INTO amizades (par, de, para, estado, criado_em, atualizado_em) VALUES (:par, :de, :para, 'ativa', :t, :t) ON CONFLICT(par) DO UPDATE SET de = :de, para = :para, estado = 'ativa', atualizado_em = :t",
      { par: pair, de: from, para: to, t }
    )
    switch (action) {
      case 'pedir': {
        if (line?.estado === 'ativa') throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.alvo' })
        if (line?.estado === 'pendente' && line.de === obj.autor) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.alvo' })
        if (line?.estado === 'recusada' && line.atualizado_em + TIMES.friendRequestRefusalS > now) {
          throw new ProtocolError('limite_de_taxa', { detalhe: 'O pedido foi recusado há pouco tempo.', retryAfterS: line.atualizado_em + TIMES.friendRequestRefusalS - now })
        }
        requireSpace()
        if (line?.estado === 'pendente') {
          // the other had already asked: both want it, so the friendship is born active
          return {
            resultado: 'ativa',
            depois: ({ agora: t }) => {
              activate(line.de, line.para, t)
              this.notify(line.de, 'amizade-aceita', { origem: obj.autor, objeto: obj.id }, t)
            }
          }
        }
        if (this.contar("FROM amizades WHERE estado = 'pendente' AND de = :uid", { uid: obj.autor }) >= STRUCTURE.sentFriendRequests) {
          throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.sentFriendRequests} pedidos enviados pendentes.` })
        }
        if (this.contar("FROM amizades WHERE estado = 'pendente' AND para = :uid", { uid: target.uid }) >= STRUCTURE.receivedFriendRequests) {
          throw new ProtocolError('limite_de_estrutura', { detalhe: 'Este rover já tem pedidos pendentes demais.' })
        }
        return {
          resultado: 'pendente',
          depois: ({ agora: t }) => {
            this.a.executar(
              "INSERT INTO amizades (par, de, para, estado, criado_em, atualizado_em) VALUES (:par, :de, :para, 'pendente', :t, :t) ON CONFLICT(par) DO UPDATE SET de = :de, para = :para, estado = 'pendente', criado_em = :t, atualizado_em = :t",
              { par: pair, de: obj.autor, para: target.uid, t }
            )
            this.notify(target.uid, 'pedido-de-amizade', { origem: obj.autor, objeto: obj.id }, t)
          }
        }
      }
      case 'aceitar':
      case 'recusar': {
        if (line?.estado !== 'pendente' || line.para !== obj.autor) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.alvo' })
        if (action === 'aceitar') {
          requireSpace()
          return {
            resultado: 'ativa',
            depois: ({ agora: t }) => {
              this.a.executar("UPDATE amizades SET estado = 'ativa', atualizado_em = :t WHERE par = :par", { par: pair, t })
              this.notify(line.de, 'amizade-aceita', { origem: obj.autor, objeto: obj.id }, t)
            }
          }
        }
        return {
          resultado: 'nenhuma',
          depois: ({ agora: t }) => this.a.executar("UPDATE amizades SET estado = 'recusada', atualizado_em = :t WHERE par = :par", { par: pair, t })
        }
      }
      default: {
        // undo: an active friendship (either side) or a request sent by me (cancel)
        const applies = line && (line.estado === 'ativa' || (line.estado === 'pendente' && line.de === obj.autor))
        if (!applies) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.alvo' })
        return {
          resultado: 'nenhuma',
          depois: ({ agora: t }) => {
            this.a.executar('DELETE FROM amizades WHERE par = :par', { par: pair })
            closePairConversations(this.a, obj.autor, target.uid, t) // 0.4.0: without a friendship there is no conversation
          }
        }
      }
    }
  }

  r_depoimento(obj, now) {
    const target = this.requireRover(obj.corpo.alvo, now)
    this.requireWithoutBlock(obj.autor, target.uid)
    const am = this.activeFriendship(obj.autor, target.uid)
    if (!am || am.atualizado_em + TIMES.friendshipForTestimonialS > now) {
      throw new ProtocolError('interacao_nao_permitida', { campo: 'objeto.corpo.alvo', detalhe: 'Só um amigo de pelo menos 3 dias escreve depoimento.' })
    }
    const live = this.a.um("SELECT 1 AS n FROM objetos WHERE tipo = 'depoimento' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL AND estado IN ('pendente', 'aceito')", { autor: obj.autor, alvo: target.uid })
    if (live) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.alvo' })
    const refused = this.a.um("SELECT MAX(estado_em) AS em FROM objetos WHERE tipo = 'depoimento' AND autor = :autor AND alvo = :alvo AND estado = 'recusado'", { autor: obj.autor, alvo: target.uid })
    if (refused?.em && refused.em + TIMES.testimonialAfterRefusalS > now) {
      throw new ProtocolError('limite_de_taxa', { detalhe: 'O último depoimento para este rover foi recusado há pouco tempo.', retryAfterS: refused.em + TIMES.testimonialAfterRefusalS - now })
    }
    if (this.contar("FROM objetos WHERE tipo = 'depoimento' AND alvo = :alvo AND estado = 'pendente' AND removido_em IS NULL", { alvo: target.uid }) >= STRUCTURE.pendingTestimonials) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: 'Este rover já tem depoimentos pendentes demais.' })
    }
    return {
      alvo: target.uid,
      ctx: target.uid,
      estado: 'pendente',
      depois: ({ agora: t }) => this.notify(target.uid, 'depoimento-para-aceitar', { origem: obj.autor, objeto: obj.id }, t)
    }
  }

  r_depoimento_decisao(obj, now) {
    const dep = this.a.objeto(obj.corpo.depoimento)
    if (!dep || dep.tipo !== 'depoimento' || dep.removido_em !== null) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.depoimento' })
    if (dep.alvo !== obj.autor) throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.depoimento' })
    const newValue = obj.corpo.decisao === 'aceitar' ? 'aceito' : 'recusado'
    if (dep.estado === newValue) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.decisao' })
    return {
      resultado: newValue,
      depois: ({ agora: t }) => {
        this.a.executar('UPDATE objetos SET estado = :novo, estado_em = :t WHERE id = :id', { novo: newValue, t, id: dep.id })
        if (newValue === 'aceito') this.notify(dep.autor, 'depoimento-aceito', { origem: obj.autor, objeto: dep.id }, t)
      }
    }
  }

  r_selo(obj, now) {
    const target = this.requireRover(obj.corpo.alvo, now)
    this.requireWithoutBlock(obj.autor, target.uid)
    const am = this.activeFriendship(obj.autor, target.uid)
    if (!am || am.atualizado_em + TIMES.friendshipForBadgeS > now) {
      throw new ProtocolError('interacao_nao_permitida', { campo: 'objeto.corpo.alvo', detalhe: 'Só um amigo de pelo menos 7 dias dá selo.' })
    }
    if (this.a.um("SELECT 1 AS n FROM objetos WHERE tipo = 'selo' AND autor = :autor AND alvo = :alvo AND sub = :selo AND removido_em IS NULL", { autor: obj.autor, alvo: target.uid, selo: obj.corpo.selo })) {
      throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.selo' })
    }
    return {
      alvo: target.uid,
      ctx: target.uid,
      sub: obj.corpo.selo,
      depois: ({ agora: t }) => this.notify(target.uid, 'selo-recebido', { origem: null, objeto: obj.id }, t)
    }
  }

  r_relacao(obj, now) {
    const { alvo: targetUid, acao: action } = obj.corpo
    const target = this.requireRover(targetUid, now)
    const type = action === 'bloquear' || action === 'desbloquear' ? 'bloqueio' : 'silencio'
    const exists = this.a.um('SELECT 1 AS n FROM relacoes WHERE autor = :autor AND alvo = :alvo AND tipo = :tipo', { autor: obj.autor, alvo: target.uid, tipo: type }) !== null
    const undoing = action === 'desbloquear' || action === 'dessilenciar'
    if (undoing && !exists) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.alvo' })
    if (!undoing && exists) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.alvo' })
    if (!undoing) {
      if (this.contar('FROM relacoes WHERE autor = :autor AND tipo = :tipo', { autor: obj.autor, tipo: type }) >= STRUCTURE.relationsPerType) {
        throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.relationsPerType}.` })
      }
    }
    return {
      depois: ({ agora: t }) => {
        if (undoing) return this.a.executar('DELETE FROM relacoes WHERE autor = :autor AND alvo = :alvo AND tipo = :tipo', { autor: obj.autor, alvo: target.uid, tipo: type })
        this.a.executar('INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:autor, :alvo, :tipo, :t)', { autor: obj.autor, alvo: target.uid, tipo: type, t })
        if (type === 'silencio') return undefined
        // Blocking undoes the friendship and requests, the follows in both directions and hides the pending testimonials between the two.
        const x = obj.autor
        const y = target.uid
        this.a.executar('DELETE FROM amizades WHERE par = :par', { par: pairOf(x, y) })
        closePairConversations(this.a, x, y, t) // 0.4.0: blocking ends the conversation between the two
        this.a.executar(
          "UPDATE objetos SET envelope = NULL, removido_em = :t WHERE tipo = 'seguir' AND removido_em IS NULL AND ((autor = :x AND alvo = :y) OR (autor = :y AND alvo = :x))",
          { t, x, y }
        )
        this.a.executar(
          "UPDATE objetos SET estado = 'recusado', estado_em = :t WHERE tipo = 'depoimento' AND estado = 'pendente' AND removido_em IS NULL AND ((autor = :x AND alvo = :y) OR (autor = :y AND alvo = :x))",
          { t, x, y }
        )
        return undefined
      }
    }
  }

  r_entrega(obj, now) {
    if (this.contar("FROM objetos WHERE tipo = 'entrega' AND autor = :autor AND removido_em IS NULL", { autor: obj.autor }) >= STRUCTURE.deliveriesPerRover) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.deliveriesPerRover} entregas.` })
    }
    return {
      ctx: obj.autor,
      depois: ({ agora: t }) => this.recordTags(obj.id, obj.autor, null, this.tagsOf(obj.corpo.tags, obj.corpo.descricao, obj.corpo.resultado), t)
    }
  }

  // ====================================================================================================
  // COMMUNITIES
  // ====================================================================================================

  /** The name of a listed community is unique among the live listed ones (case, accents and punctuation do not distinguish). */
  _nameFree(name, access, except = null) {
    if (access === 'fechada') return
    const key = nameKey(name)
    const other = this.a.um("SELECT id FROM comunidades WHERE chave_nome = :chave AND acesso <> 'fechada' AND encerrada_em IS NULL AND id <> :exceto", { chave: key, exceto: except ?? '' })
    if (other) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.nome' })
  }

  r_comunidade_criar(obj) {
    const c = obj.corpo
    if (this.contar('FROM comunidades WHERE dono = :uid AND encerrada_em IS NULL', { uid: obj.autor }) >= STRUCTURE.communitiesAsOwner) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.communitiesAsOwner} comunidades como dono.` })
    }
    this._requireCommunitySlot(obj.autor)
    this._nameFree(c.nome, c.acesso)
    return {
      ctx: obj.id,
      depois: ({ seq, agora: now }) => {
        this.a.executar(
          `INSERT INTO comunidades (id, dono, nome, chave_nome, descricao, regras, tema, acesso, categorias, criada_em, seq, atividade_em, atividade_seq, versao_id, adulto)
           VALUES (:id, :dono, :nome, :chave, :descricao, :regras, :tema, :acesso, :categorias, :agora, :seq, :agora, :seq, :id, :adulto)`,
          { id: obj.id, dono: obj.autor, nome: c.nome, chave: nameKey(c.nome), descricao: c.descricao, regras: c.regras, tema: c.tema, acesso: c.acesso, categorias: JSON.stringify(c.categorias), agora: now, seq, adulto: c.adulto === true ? 1 : 0 }
        )
        this.a.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:id, :uid, 'dono', :agora)", { id: obj.id, uid: obj.autor, agora: now })
        this.index('comunidade', obj.id, obj.id, c.nome, `${c.descricao} ${c.tema}`)
      }
    }
  }

  _requireCommunitySlot(uid) {
    if (this.contar('FROM membros WHERE uid = :uid', { uid }) >= STRUCTURE.communitiesAsMember) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.communitiesAsMember} comunidades.` })
    }
  }

  r_comunidade_atualizar(obj) {
    const c = obj.corpo
    const { com: using, papel: role } = this.requireRole(c.comunidade, obj.autor, 'moderador')
    if (c.acesso !== using.acesso && role !== 'dono') throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.acesso' })
    this._nameFree(c.nome, c.acesso, using.id)
    return {
      ctx: using.id,
      alvo: using.id,
      depois: () => {
        this.a.executar(
          'UPDATE comunidades SET nome = :nome, chave_nome = :chave, descricao = :descricao, regras = :regras, tema = :tema, acesso = :acesso, categorias = :categorias, versao_id = :versao, adulto = :adulto WHERE id = :id',
          { id: using.id, nome: c.nome, chave: nameKey(c.nome), descricao: c.descricao, regras: c.regras, tema: c.tema, acesso: c.acesso, categorias: JSON.stringify(c.categorias), versao: obj.id, adulto: c.adulto === true ? 1 : 0 }
        )
        this.index('comunidade', using.id, using.id, c.nome, `${c.descricao} ${c.tema}`)
      }
    }
  }

  r_comunidade_adesao(obj, now) {
    const { comunidade: id, acao: action } = obj.corpo
    const simpleEffect = (result, after) => ({ ctx: id, resultado: result, depois: after })
    switch (action) {
      case 'entrar': {
        const using = this.comunidade(id)
        if (!using || using.acesso === 'fechada') throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.comunidade' })
        if (this.banido(id, obj.autor)) throw new ProtocolError('banido', { campo: 'objeto.corpo.comunidade' })
        if (this.papel(id, obj.autor) || this.a.um('SELECT 1 AS n FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor })) {
          throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.comunidade' })
        }
        this._requireCommunitySlot(obj.autor)
        const inRaid = using.acesso === 'aberta' &&
          this.contar("FROM membros WHERE comunidade = :id AND papel <> 'dono' AND desde > :desde", { id, desde: now - TIMES.raidWindowS }) >= RAID.joinsPerHour
        if (using.acesso === 'aberta' && !inRaid) {
          return simpleEffect('membro', ({ agora: t }) => this.a.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:id, :uid, 'membro', :t)", { id, uid: obj.autor, t }))
        }
        if (this.contar('FROM pedidos_de_entrada WHERE uid = :uid', { uid: obj.autor }) >= STRUCTURE.joinRequestsPerRover ||
            this.contar('FROM pedidos_de_entrada WHERE comunidade = :id', { id }) >= STRUCTURE.joinRequestsPerCommunity) {
          throw new ProtocolError('limite_de_estrutura', { detalhe: 'Há pedidos de entrada pendentes demais.' })
        }
        return simpleEffect('pendente', ({ agora: t }) => {
          this.a.executar('INSERT INTO pedidos_de_entrada (comunidade, uid, em) VALUES (:id, :uid, :t)', { id, uid: obj.autor, t })
          for (const resp of this.responsible(id)) this.notify(resp, 'pedido-de-entrada', { origem: obj.autor, objeto: obj.id, comunidade: id }, t)
        })
      }
      case 'sair': {
        const { papel: role } = this.requireRole(id, obj.autor, 'membro')
        if (role === 'dono') throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.comunidade', detalhe: 'O dono transfere a posse antes de sair.' })
        return simpleEffect('fora', () => this.a.executar('DELETE FROM membros WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor }))
      }
      case 'aceitar-convite': {
        const using = this.comunidade(id)
        if (!using || !this.convidado(id, obj.autor)) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.comunidade' })
        // (whoever was banned lost the invite at once, so there is no banned one here; already being a member can happen: they joined through `entrar`)
        if (this.papel(id, obj.autor)) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.comunidade' })
        this._requireCommunitySlot(obj.autor)
        return simpleEffect('membro', ({ agora: t }) => {
          this.a.executar('DELETE FROM convites WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor })
          this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor })
          this.a.executar("INSERT OR IGNORE INTO membros (comunidade, uid, papel, desde) VALUES (:id, :uid, 'membro', :t)", { id, uid: obj.autor, t })
        })
      }
      case 'recusar-convite':
        if (!this.convidado(id, obj.autor)) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.comunidade' })
        return simpleEffect('fora', () => this.a.executar('DELETE FROM convites WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor }))
      default: {
        if (!this.a.um('SELECT 1 AS n FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor })) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.comunidade' })
        return simpleEffect('fora', () => this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor }))
      }
    }
  }

  r_comunidade_gestao(obj, now) {
    const { comunidade: id, alvo: target, acao: action, motivo: reason } = obj.corpo
    const { papel: role } = this.requireRole(id, obj.autor, 'moderador')
    const isMe = (p) => role === p
    const targetRole = this.papel(id, target)
    const field = 'objeto.corpo.alvo'
    const effect = (result, after) => ({ ctx: id, resultado: result, depois: after })
    const remove = (uid) => {
      this.a.executar('DELETE FROM membros WHERE comunidade = :id AND uid = :uid', { id, uid })
      this.a.executar('DELETE FROM convites WHERE comunidade = :id AND uid = :uid', { id, uid })
      this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :uid', { id, uid })
    }
    const register = (t, publicAction, targetType = null) => this.recordModeration({
      em: t, escopo: 'comunidade', contexto: id, acao: publicAction, alvoTipo: targetType, alvo: target, autorDoAlvo: target, motivo: reason, papel: role, por: obj.autor
    })
    switch (action) {
      case 'convidar': {
        this.requireRover(target, now)
        this.requireWithoutBlock(obj.autor, target)
        if (targetRole) throw new ProtocolError('ja_existe', { campo: field })
        if (this.banido(id, target)) throw new ProtocolError('banido', { campo: field })
        if (this.convidado(id, target)) throw new ProtocolError('ja_existe', { campo: field })
        if (this.contar('FROM convites WHERE comunidade = :id', { id }) >= STRUCTURE.invitesPerCommunity ||
            this.contar('FROM convites WHERE uid = :uid', { uid: target }) >= STRUCTURE.receivedInvites) {
          throw new ProtocolError('limite_de_estrutura', { detalhe: 'Há convites pendentes demais.' })
        }
        return effect(undefined, ({ agora: t }) => {
          this.a.executar('INSERT INTO convites (comunidade, uid, por, em) VALUES (:id, :alvo, :por, :t)', { id, alvo: target, por: obj.autor, t })
          this.notify(target, 'convite-comunidade', { origem: obj.autor, objeto: obj.id, comunidade: id }, t)
        })
      }
      case 'cancelar-convite':
        if (!this.convidado(id, target)) throw new ProtocolError('nao_encontrado', { campo: field })
        return effect(undefined, () => this.a.executar('DELETE FROM convites WHERE comunidade = :id AND uid = :alvo', { id, alvo: target }))
      case 'aprovar-pedido': {
        if (!this.a.um('SELECT 1 AS n FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :alvo', { id, alvo: target })) throw new ProtocolError('nao_encontrado', { campo: field })
        this._requireCommunitySlot(target)
        return effect('membro', ({ agora: t }) => {
          this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :alvo', { id, alvo: target })
          this.a.executar("INSERT OR IGNORE INTO membros (comunidade, uid, papel, desde) VALUES (:id, :alvo, 'membro', :t)", { id, alvo: target, t })
          this.notify(target, 'entrada-aprovada', { origem: obj.autor, objeto: obj.id, comunidade: id }, t)
        })
      }
      case 'recusar-pedido':
        if (!this.a.um('SELECT 1 AS n FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :alvo', { id, alvo: target })) throw new ProtocolError('nao_encontrado', { campo: field })
        return effect('fora', () => this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :alvo', { id, alvo: target }))
      case 'expulsar': {
        if (!targetRole) throw new ProtocolError('nao_encontrado', { campo: field })
        if (targetRole === 'dono' || (isMe('moderador') && targetRole !== 'membro')) throw new ProtocolError('sem_permissao', { campo: field })
        return effect('fora', ({ agora: t }) => {
          remove(target)
          register(t, 'expulsao')
          this.notify(target, 'expulso', { origem: null, objeto: obj.id, comunidade: id }, t)
        })
      }
      case 'banir': {
        this.requireRover(target, now)
        if (this.banido(id, target)) throw new ProtocolError('ja_existe', { campo: field })
        if (targetRole === 'dono' || (isMe('moderador') && targetRole && targetRole !== 'membro')) throw new ProtocolError('sem_permissao', { campo: field })
        return effect('fora', ({ agora: t }) => {
          remove(target)
          this.a.executar(
            'INSERT INTO banidos (comunidade, uid, por, papel_de_quem_baniu, motivo, em) VALUES (:id, :alvo, :por, :papel, :motivo, :t)',
            { id, alvo: target, por: obj.autor, papel: role, motivo: reason, t }
          )
          register(t, 'banimento')
          this.notify(target, 'banido', { origem: null, objeto: obj.id, comunidade: id }, t)
        })
      }
      case 'desbanir':
        if (!this.banido(id, target)) throw new ProtocolError('nao_encontrado', { campo: field })
        return effect('fora', () => this.a.executar('DELETE FROM banidos WHERE comunidade = :id AND uid = :alvo', { id, alvo: target }))
      case 'promover': {
        if (!isMe('dono')) throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.acao' })
        if (!targetRole) throw new ProtocolError('nao_encontrado', { campo: field })
        if (targetRole !== 'membro') throw new ProtocolError('ja_existe', { campo: field })
        if (this.contar("FROM membros WHERE comunidade = :id AND papel = 'moderador'", { id }) >= STRUCTURE.moderatorsPerCommunity) {
          throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.moderatorsPerCommunity} moderadores.` })
        }
        return effect(undefined, () => this.a.executar("UPDATE membros SET papel = 'moderador' WHERE comunidade = :id AND uid = :alvo", { id, alvo: target }))
      }
      default: {
        if (!isMe('dono')) throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.acao' })
        if (!targetRole) throw new ProtocolError('nao_encontrado', { campo: field })
        if (targetRole !== 'moderador') throw new ProtocolError('ja_existe', { campo: field })
        return effect(undefined, () => this.a.executar("UPDATE membros SET papel = 'membro' WHERE comunidade = :id AND uid = :alvo", { id, alvo: target }))
      }
    }
  }

  r_comunidade_posse(obj, now) {
    const { comunidade: id, acao: action, novoDono: newOwner } = obj.corpo
    const { com: using } = this.requireRole(id, obj.autor, 'dono')
    if (action === 'transferir') {
      if (!this.papel(id, newOwner)) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.novoDono' })
      this.requireRover(newOwner, now, 'objeto.corpo.novoDono')
      return {
        ctx: id,
        depois: ({ agora: t }) => {
          const wouldFitAsModerator = this.contar("FROM membros WHERE comunidade = :id AND papel = 'moderador'", { id }) < STRUCTURE.moderatorsPerCommunity
          this.a.executar("UPDATE membros SET papel = 'dono' WHERE comunidade = :id AND uid = :novo", { id, novo: newOwner })
          this.a.executar('UPDATE membros SET papel = :papel WHERE comunidade = :id AND uid = :antigo', { id, antigo: obj.autor, papel: wouldFitAsModerator ? 'moderador' : 'membro' })
          this.a.executar('UPDATE comunidades SET dono = :novo WHERE id = :id', { id, novo: newOwner })
          this.notify(newOwner, 'posse-recebida', { origem: obj.autor, objeto: obj.id, comunidade: id }, t)
        }
      }
    }
    return { ctx: id, depois: ({ agora: t }) => this.closeCommunity(using.id, obj.autor, t) }
  }

  /** Close: it disappears from every read; the content is hidden and deleted after 30 days (see `limpar`). */
  closeCommunity(id, by, now) {
    this.a.executar('UPDATE comunidades SET encerrada_em = :agora WHERE id = :id', { id, agora: now })
    this.a.executar(
      'UPDATE objetos SET oculto_em = :agora, oculto_por = :por WHERE oculto_em IS NULL AND removido_em IS NULL AND (ctx = :id OR ctx IN (SELECT id FROM topicos WHERE comunidade = :id))',
      { id, agora: now, por: by }
    )
    this.unindex('comunidade', id)
    this.a.executar("DELETE FROM busca WHERE tipo = 'topico' AND ctx = :id", { id })
    this.a.executar('DELETE FROM tags_uso WHERE ctx = :id', { id })
    this.a.executar('DELETE FROM convites WHERE comunidade = :id', { id })
    this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id', { id })
  }

  // ====================================================================================================
  // FORUM
  // ====================================================================================================

  _requireGracePeriod(using, uid, seconds, now) {
    const m = this.a.um('SELECT papel, desde FROM membros WHERE comunidade = :c AND uid = :uid', { c: using.id, uid })
    if (m.desde + seconds > now) throw new ProtocolError('em_carencia', { retryAfterS: m.desde + seconds - now })
  }

  r_topico(obj, now) {
    const c = obj.corpo
    const { com: using, papel: role } = this.requireRole(c.comunidade, obj.autor, 'membro')
    if (role === 'membro') this._requireGracePeriod(using, obj.autor, TIMES.graceForTopicS, now)
    if (c.categoria !== null && !JSON.parse(using.categorias).includes(c.categoria)) {
      throw new ProtocolError('esquema', { campo: 'objeto.corpo.categoria', detalhe: 'Campo objeto.corpo.categoria: não existe nesta comunidade.' })
    }
    const tags = this.tagsOf(c.tags, c.titulo, c.texto)
    return {
      ctx: using.id,
      depois: ({ seq, agora: t }) => {
        this.a.executar(
          `INSERT INTO topicos (id, comunidade, categoria, autor, titulo, texto, tags, seq, criado_em, atividade_seq, atividade_em, enquete)
           VALUES (:id, :comunidade, :categoria, :autor, :titulo, :texto, :tags, :seq, :criadoEm, :seq, :t, :enquete)`,
          {
            id: obj.id, comunidade: using.id, categoria: c.categoria, autor: obj.autor, titulo: c.titulo, texto: c.texto, tags: JSON.stringify(c.tags),
            seq, criadoEm: obj.criadoEm, t, enquete: c.enquete ? JSON.stringify(c.enquete) : null
          }
        )
        this.a.executar('UPDATE comunidades SET atividade_em = :t, atividade_seq = :seq WHERE id = :id', { id: using.id, t, seq })
        this.index('topico', obj.id, using.id, c.titulo, `${c.texto} ${tags.join(' ')}`)
        this.recordTags(obj.id, obj.autor, using.id, tags, t)
        this.mencoes(`${c.titulo}\n${c.texto}`, { origem: obj.autor, objeto: obj.id, comunidade: using.id }, t)
      }
    }
  }

  /** The topic, live, in a place where the author takes part. */
  _topicToActOn(id, author, min = 'membro') {
    const t = this.topico(id)
    if (!t) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.topico' })
    const { com: using, papel: role } = this.requireRole(t.comunidade, author, min, 'objeto.corpo.topico')
    const o = this.a.objeto(id)
    if (o.removido_em !== null || o.oculto_em !== null || this.a.bloqueado('objeto', id)) throw new ProtocolError('alvo_removido', { campo: 'objeto.corpo.topico' })
    return { t, com: using, papel: role }
  }

  r_topico_editar(obj, now) {
    const c = obj.corpo
    const { t, com: using } = this._topicToActOn(c.topico, obj.autor)
    if (t.autor !== obj.autor) throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.topico' })
    if (t.trancado) throw new ProtocolError('trancado', { campo: 'objeto.corpo.topico' })
    if (now > t.criado_em + TIMES.janelaDeEdicaoDoTopicoS) throw new ProtocolError('fora_da_janela', { campo: 'objeto.corpo.topico' })
    if (t.versoes - 1 >= STRUCTURE.topicEdits) throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.topicEdits} edições.` })
    const tags = this.tagsOf(c.tags, c.titulo, c.texto)
    return {
      alvo: t.id,
      ctx: t.id,
      depois: ({ agora: t2 }) => {
        this.a.executar('UPDATE topicos SET titulo = :titulo, texto = :texto, tags = :tags, versoes = versoes + 1 WHERE id = :id', { id: t.id, titulo: c.titulo, texto: c.texto, tags: JSON.stringify(c.tags) })
        this.index('topico', t.id, using.id, c.titulo, `${c.texto} ${tags.join(' ')}`)
        this.recordTags(t.id, obj.autor, using.id, tags, t2)
        const before = new Set(extractMentions(`${t.titulo}\n${t.texto}`))
        const newItems = extractMentions(`${c.titulo}\n${c.texto}`).filter((h) => !before.has(h))
        if (newItems.length) this.mencoes(newItems.map((h) => `@${h}`).join(' '), { origem: obj.autor, objeto: t.id, comunidade: using.id }, t2)
      }
    }
  }

  r_resposta_forum(obj, now) {
    const c = obj.corpo
    const { t, com: using, papel: role } = this._topicToActOn(c.topico, obj.autor)
    if (t.trancado && role === 'membro') throw new ProtocolError('trancado', { campo: 'objeto.corpo.topico' })
    if (role === 'membro') this._requireGracePeriod(using, obj.autor, TIMES.graceForReplyS, now)
    const reply = (id, field) => {
      const l = id ? this.a.objeto(id) : null
      if (!l || l.tipo !== 'resposta-forum' || l.ctx !== t.id || l.removido_em !== null || l.oculto_em !== null) throw new ProtocolError('alvo_desconhecido', { campo: field })
      return l
    }
    let parent = null
    if (c.em !== null) {
      parent = reply(c.em, 'objeto.corpo.em')
      if (parent.alvo !== t.id) throw new ProtocolError('resposta_funda', { campo: 'objeto.corpo.em' })
    }
    const quoted = c.cita !== null ? reply(c.cita, 'objeto.corpo.cita') : null
    this.requireWithoutBlock(obj.autor, t.autor, 'objeto.corpo.topico')
    if (parent) this.requireWithoutBlock(obj.autor, parent.autor, 'objeto.corpo.em')
    if (quoted) this.requireWithoutBlock(obj.autor, quoted.autor, 'objeto.corpo.cita')
    return {
      alvo: parent ? parent.id : t.id,
      ctx: t.id,
      depois: ({ seq, agora: t2 }) => {
        this.a.executar('UPDATE topicos SET atividade_seq = :seq, atividade_em = :t WHERE id = :id', { id: t.id, seq, t: t2 })
        this.a.executar('UPDATE comunidades SET atividade_seq = :seq, atividade_em = :t WHERE id = :id', { id: using.id, seq, t: t2 })
        const info = { origem: obj.autor, objeto: obj.id, comunidade: using.id }
        const notified = new Set()
        const notice = (dest, type) => {
          if (!dest || notified.has(dest) || !this.canReadCommunity(using, dest)) return
          this.notify(dest, type, info, t2)
          notified.add(dest)
        }
        notice(parent?.autor, 'resposta-a-voce')
        notice(quoted?.autor, 'citacao')
        notice(t.autor, 'resposta-no-topico')
        this.mencoes(c.texto, { ...info, alreadyNotified: notified }, t2)
      }
    }
  }

  /**
   * 0.3.1 (proposal 0006): the moderator takes the open reports on a target out of that community's queue. It does not delete content and does not
   * free whoever reported to report again (the row stays). A new report, from another person, reopens the case.
   */
  r_denuncia_dispensar(obj) {
    const { comunidade: id, alvo: target } = obj.corpo
    const { papel: role } = this.requireRole(id, obj.autor, 'moderador')
    const field = 'objeto.corpo.alvo'
    const line = this.a.objeto(target)
    const open = this.contar('FROM denuncias WHERE alvo = :alvo AND comunidade = :c AND dispensada_em IS NULL', { alvo: target, c: id })
    if (!line || open === 0) throw new ProtocolError('nao_encontrado', { campo: field })
    return {
      ctx: id,
      depois: ({ agora: t }) => {
        this.a.executar('UPDATE denuncias SET dispensada_em = :t WHERE alvo = :alvo AND comunidade = :c AND dispensada_em IS NULL', { t, alvo: target, c: id })
        this.recordModeration({ em: t, escopo: 'comunidade', contexto: id, acao: 'dispensa', alvoTipo: line.tipo, alvo: target, autorDoAlvo: line.autor, motivo: 'dispensada', papel: role, por: obj.autor })
      }
    }
  }

  r_topico_gestao(obj) {
    const c = obj.corpo
    const { t, com: using, papel: originRole } = this._topicToActOn(c.topico, obj.autor, 'moderador')
    const field = 'objeto.corpo.acao'
    switch (c.acao) {
      case 'fixar':
        if (t.fixado) throw new ProtocolError('ja_existe', { campo: field })
        if (this.contar('FROM topicos WHERE comunidade = :c AND fixado = 1', { c: using.id }) >= STRUCTURE.pinnedPerCommunity) {
          throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.pinnedPerCommunity} fixados.` })
        }
        return { ctx: t.id, depois: () => this.a.executar('UPDATE topicos SET fixado = 1 WHERE id = :id', { id: t.id }) }
      case 'desafixar':
        if (!t.fixado) throw new ProtocolError('ja_existe', { campo: field })
        return { ctx: t.id, depois: () => this.a.executar('UPDATE topicos SET fixado = 0 WHERE id = :id', { id: t.id }) }
      case 'trancar':
        if (t.trancado) throw new ProtocolError('ja_existe', { campo: field })
        return { ctx: t.id, depois: () => this.a.executar('UPDATE topicos SET trancado = 1 WHERE id = :id', { id: t.id }) }
      case 'destrancar':
        if (!t.trancado) throw new ProtocolError('ja_existe', { campo: field })
        return { ctx: t.id, depois: () => this.a.executar('UPDATE topicos SET trancado = 0 WHERE id = :id', { id: t.id }) }
      default: {
        const { com: destination } = this.requireRole(c.comunidade, obj.autor, 'moderador', 'objeto.corpo.comunidade')
        if (destination.id === using.id && c.categoria === t.categoria) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.comunidade' })
        if (c.categoria !== null && !JSON.parse(destination.categorias).includes(c.categoria)) {
          throw new ProtocolError('esquema', { campo: 'objeto.corpo.categoria', detalhe: 'Campo objeto.corpo.categoria: não existe na comunidade de destino.' })
        }
        if (using.acesso === 'fechada' && destination.acesso !== 'fechada' && originRole !== 'dono') {
          throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.comunidade', detalhe: 'Só o dono da comunidade fechada a torna pública movendo um tópico dela.' })
        }
        return {
          ctx: t.id,
          depois: () => {
            this.a.executar("UPDATE topicos SET comunidade = :destino, categoria = :categoria, fixado = 0, etiquetas = '[]', status = NULL WHERE id = :id", { id: t.id, destino: destination.id, categoria: c.categoria })
            this.a.executar('UPDATE objetos SET ctx = :destino WHERE id = :id', { id: t.id, destino: destination.id })
            this.a.executar('UPDATE tags_uso SET ctx = :destino WHERE objeto = :id', { id: t.id, destino: destination.id })
            this.a.executar("UPDATE busca SET ctx = :destino WHERE tipo = 'topico' AND ref = :id", { id: t.id, destino: destination.id })
          }
        }
      }
    }
  }

  // ---------- 0.3.2: vocabulary and marks (proposal 0007) ----------

  /**
   * The owner or a moderator defines, all at once, the closed vocabulary of the community (it replaces the previous one). The labels and keys were already
   * checked by the schema: a closed list of characters, no free field. Here only what depends on state: the role and the categories.
   */
  r_comunidade_vocabulario(obj) {
    const c = obj.corpo
    const { com: using } = this.requireRole(c.comunidade, obj.autor, 'moderador')
    const categories = JSON.parse(using.categorias)
    c.status.forEach((s, i) => {
      if (s.categorias === null) return
      for (const cat of s.categorias) {
        if (!categories.includes(cat)) {
          throw new ProtocolError('esquema', { campo: `objeto.corpo.status[${i}].categorias`, detalhe: `Campo objeto.corpo.status[${i}].categorias: ${JSON.stringify(cat)} não é categoria da comunidade.` })
        }
      }
    })
    return {
      ctx: using.id,
      depois: () => {
        const empty = c.etiquetas.length === 0 && c.status.length === 0
        const vocab = { etiquetas: c.etiquetas, status: c.status }
        this.a.executar('UPDATE comunidades SET vocabulario = :v WHERE id = :id', { v: empty ? null : JSON.stringify(vocab), id: using.id })
        this._clearLeftoverMarks(using.id)
      }
    }
  }

  /** After changing the vocabulary, removes from the topics the keys that stopped being valid: reads never point to what does not exist. */
  _clearLeftoverMarks(communityId) {
    const using = this.a.um('SELECT * FROM comunidades WHERE id = :id', { id: communityId })
    const vocab = this.vocabularyOf(using)
    const labels = new Set(vocab.etiquetas.map((e) => e.chave))
    const marked = this.a.todos("SELECT id, categoria, etiquetas, status FROM topicos WHERE comunidade = :c AND (etiquetas <> '[]' OR status IS NOT NULL)", { c: communityId })
    for (const t of marked) {
      const before = JSON.parse(t.etiquetas)
      const after = before.filter((k) => labels.has(k))
      const status = t.status !== null && this.statusAppliesToTopic(vocab, t.status, t.categoria) ? t.status : null
      if (after.length !== before.length || status !== t.status) {
        this.a.executar('UPDATE topicos SET etiquetas = :e, status = :s WHERE id = :id', { e: JSON.stringify(after), s: status, id: t.id })
      }
    }
  }

  /**
   * The marks of a topic (up to 3 labels and a status), defined all at once. The author marks their OWN topic, and only while it is not
   * locked; the owner and moderator mark any topic of the community. A key outside the vocabulary is refused.
   */
  r_topico_marca(obj) {
    const c = obj.corpo
    const { t, com: using, papel: role } = this._topicToActOn(c.topico, obj.autor)
    if (t.autor !== obj.autor && role === 'membro') throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.topico' })
    if (t.trancado && role === 'membro') throw new ProtocolError('trancado', { campo: 'objeto.corpo.topico' })
    const vocab = this.vocabularyOf(using)
    const keys = new Set(vocab.etiquetas.map((e) => e.chave))
    for (const k of c.etiquetas) {
      if (!keys.has(k)) throw new ProtocolError('esquema', { campo: 'objeto.corpo.etiquetas', detalhe: `Campo objeto.corpo.etiquetas: ${JSON.stringify(k)} não existe no vocabulário da comunidade.` })
    }
    if (c.status !== null && !this.statusAppliesToTopic(vocab, c.status, t.categoria)) {
      throw new ProtocolError('esquema', { campo: 'objeto.corpo.status', detalhe: `Campo objeto.corpo.status: ${JSON.stringify(c.status)} não vale para este tópico.` })
    }
    const current = JSON.parse(t.etiquetas)
    const equal = c.status === t.status && c.etiquetas.length === current.length && c.etiquetas.every((k) => current.includes(k))
    if (equal) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.topico' })
    return {
      ctx: t.id,
      depois: () => this.a.executar('UPDATE topicos SET etiquetas = :e, status = :s WHERE id = :id', { e: JSON.stringify(c.etiquetas), s: c.status, id: t.id })
    }
  }

  r_topico_resolvido(obj) {
    const c = obj.corpo
    const { t, papel: role } = this._topicToActOn(c.topico, obj.autor)
    if (t.autor !== obj.autor && role === 'membro') throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.topico' })
    let resp = null
    if (c.resposta !== null) {
      resp = this.a.objeto(c.resposta)
      if (!resp || resp.tipo !== 'resposta-forum' || resp.ctx !== t.id || resp.removido_em !== null || resp.oculto_em !== null) {
        throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.resposta' })
      }
    }
    return {
      ctx: t.id,
      depois: ({ agora: t2 }) => {
        this.a.executar(
          'UPDATE topicos SET resolvido_resposta = :resposta, resolvido_por = :por, resolvido_em = :t WHERE id = :id',
          { id: t.id, resposta: resp?.id ?? null, por: resp ? obj.autor : null, t: resp ? t2 : null }
        )
        if (resp) this.notify(resp.autor, 'resolveu', { origem: obj.autor, objeto: resp.id, comunidade: t.comunidade }, t2)
      }
    }
  }

  r_voto(obj, now) {
    const c = obj.corpo
    const { t, com: using } = this._topicToActOn(c.topico, obj.autor)
    const poll = t.enquete ? JSON.parse(t.enquete) : null
    if (!poll) throw new ProtocolError('esquema', { campo: 'objeto.corpo.topico', detalhe: 'Campo objeto.corpo.topico: este tópico não tem enquete.' })
    if (c.opcao >= poll.opcoes.length) throw new ProtocolError('esquema', { campo: 'objeto.corpo.opcao', detalhe: 'Campo objeto.corpo.opcao: a enquete não tem essa opção.' })
    if (now >= poll.encerraEm) throw new ProtocolError('enquete_encerrada', { campo: 'objeto.corpo.topico' })
    this._requireGracePeriod(using, obj.autor, TIMES.graceForVoteS, now)
    if (this.a.um('SELECT 1 AS n FROM votos WHERE topico = :t AND uid = :uid', { t: t.id, uid: obj.autor })) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.topico' })
    return {
      ctx: t.id,
      sub: String(c.opcao),
      depois: ({ agora: t2 }) => this.a.executar('INSERT INTO votos (topico, uid, opcao, em) VALUES (:t, :uid, :opcao, :t2)', { t: t.id, uid: obj.autor, opcao: c.opcao, t2 })
    }
  }

  // ====================================================================================================
  // PAGES
  // ====================================================================================================

  _pageNameFree(name, except = null) {
    const other = this.a.um('SELECT id FROM paginas WHERE chave_nome = :chave AND encerrada_em IS NULL AND id <> :exceto', { chave: nameKey(name), exceto: except ?? '' })
    if (other) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.nome' })
  }

  r_pagina_criar(obj) {
    const c = obj.corpo
    if (this.contar('FROM paginas WHERE dono = :uid AND encerrada_em IS NULL', { uid: obj.autor }) >= STRUCTURE.pagesAsOwner) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.pagesAsOwner} páginas como dono.` })
    }
    this._pageNameFree(c.nome)
    return {
      ctx: obj.id,
      depois: ({ seq, agora: now }) => {
        this.a.executar(
          `INSERT INTO paginas (id, dono, nome, chave_nome, descricao, tema, criada_em, seq, atividade_em, atividade_seq, versao_id)
           VALUES (:id, :dono, :nome, :chave, :descricao, :tema, :agora, :seq, :agora, :seq, :id)`,
          { id: obj.id, dono: obj.autor, nome: c.nome, chave: nameKey(c.nome), descricao: c.descricao, tema: c.tema, agora: now, seq }
        )
        this.a.executar('INSERT INTO pagina_admins (pagina, uid, desde) VALUES (:id, :uid, :agora)', { id: obj.id, uid: obj.autor, agora: now })
        this.index('pagina', obj.id, obj.id, c.nome, `${c.descricao} ${c.tema}`)
      }
    }
  }

  /** The live page the author administers (owner or administrator). `nao_encontrado` if the page does not exist. */
  _pageToAdminister(id, author, ownerOnly = false) {
    const p = this.pagina(id)
    if (!p) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.pagina' })
    const role = this.roleOnPage(id, author)
    if (!role || (ownerOnly && role !== 'dono')) throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.pagina' })
    return p
  }

  r_pagina_atualizar(obj) {
    const c = obj.corpo
    const p = this._pageToAdminister(c.pagina, obj.autor)
    this._pageNameFree(c.nome, p.id)
    return {
      alvo: p.id,
      ctx: p.id,
      depois: () => {
        this.a.executar(
          'UPDATE paginas SET nome = :nome, chave_nome = :chave, descricao = :descricao, tema = :tema, versao_id = :versao WHERE id = :id',
          { id: p.id, nome: c.nome, chave: nameKey(c.nome), descricao: c.descricao, tema: c.tema, versao: obj.id }
        )
        this.index('pagina', p.id, p.id, c.nome, `${c.descricao} ${c.tema}`)
      }
    }
  }

  r_pagina_publicar(obj) {
    const c = obj.corpo
    const p = this._pageToAdminister(c.pagina, obj.autor)
    return {
      ctx: p.id,
      depois: ({ seq, agora: now }) => {
        this.a.executar('UPDATE paginas SET atividade_seq = :seq, atividade_em = :agora WHERE id = :id', { id: p.id, seq, agora: now })
        this.recordTags(obj.id, obj.autor, null, this.tagsOf(c.tags, c.texto, c.titulo ?? ''), now)
        this.mencoes(`${c.titulo ?? ''}\n${c.texto}`, { origem: obj.autor, objeto: obj.id, pagina: p.id }, now)
      }
    }
  }

  r_pagina_seguir(obj) {
    const { pagina: id, acao: action } = obj.corpo
    const p = this.pagina(id)
    if (!p) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.pagina' })
    const follows = this.a.um('SELECT 1 AS n FROM pagina_seguidores WHERE pagina = :id AND uid = :uid', { id, uid: obj.autor }) !== null
    if (action === 'deixar') {
      if (!follows) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.pagina' })
      return { ctx: id, depois: () => this.a.executar('DELETE FROM pagina_seguidores WHERE pagina = :id AND uid = :uid', { id, uid: obj.autor }) }
    }
    if (follows) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.pagina' })
    if (this.contar('FROM pagina_seguidores WHERE uid = :uid', { uid: obj.autor }) >= STRUCTURE.followedPages) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.followedPages} páginas seguidas.` })
    }
    return {
      ctx: id,
      depois: ({ agora: now }) => {
        this.a.executar('INSERT INTO pagina_seguidores (pagina, uid, em) VALUES (:id, :uid, :agora)', { id, uid: obj.autor, agora: now })
        // The follower is only revealed to the owner if their graph is public.
        const follower = this.a.rover(obj.autor)
        if (follower && this.rele._policyOf(follower).grafo === 'publico') this.notify(p.dono, 'novo-seguidor', { origem: obj.autor, pagina: id }, now)
      }
    }
  }

  r_pagina_gestao(obj, now) {
    const { pagina: id, alvo: target, acao: action } = obj.corpo
    const p = this._pageToAdminister(id, obj.autor, true)
    const isAdmin = this.a.um('SELECT 1 AS n FROM pagina_admins WHERE pagina = :id AND uid = :alvo', { id, alvo: target }) !== null
    if (action === 'adicionar-admin') {
      this.requireRover(target, now)
      this.requireWithoutBlock(obj.autor, target)
      if (isAdmin) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.alvo' })
      if (this.contar('FROM pagina_admins WHERE pagina = :id', { id }) >= STRUCTURE.adminsPerPage) {
        throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${STRUCTURE.adminsPerPage} administradores.` })
      }
      return { ctx: id, depois: ({ agora: t }) => this.a.executar('INSERT INTO pagina_admins (pagina, uid, desde) VALUES (:id, :alvo, :t)', { id, alvo: target, t }) }
    }
    if (!isAdmin || target === p.dono) throw new ProtocolError('nao_encontrado', { campo: 'objeto.corpo.alvo' })
    return { ctx: id, depois: () => this.a.executar('DELETE FROM pagina_admins WHERE pagina = :id AND uid = :alvo', { id, alvo: target }) }
  }
}

