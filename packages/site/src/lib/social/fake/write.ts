// The WRITE side of the social fake client: free gestures (`executar`), creation of the text objects
// after approval (`criar`) and the draft queue. Each rule comes from the tables of
// docs/API-SOCIAL-NETWORK.md (sections 4, 8 and 10) and from the pure functions in src/lib/domain. The author is a
// parameter (Lumi, when it comes through the bridge; any rover in tests and in the seed), so the rules
// apply to everyone and not only to the owner of the browser.

import {
  parseSocial, approveSocial as approvePure, blocksSocial, editSocial as editPure, refuseSocial as declinePure, SOCIAL_SCHEMA,
  type Fields, type DraftTarget, type SocialDraft, type SocialApprovalResult, type SocialType,
} from '../../domain/social-approval'
import { applyDecision, canWriteAnother } from '../../domain/testimonial'
import { summary as hash } from '../../domain/hash'
import { canAppeal, whoDecidesAppeal, validateManagement } from '../../domain/moderation'
import {
  canEditTopic, canMoveTopic, canInCommunity, canOnPage, canOnProfile, type Denial, type OwnerRelation, type Verdict,
} from '../../domain/permissions'
import { extractMentions } from '../../domain/social-text'
import { NetworkError, type ReactionType } from '../../types'
import type { SocialAct, ActResult } from '../social-client'
import { SOCIAL_REPORT_REASONS, type ModerationReason, type NotificationType } from '../types'
import { withoutAccent, iso } from './base'
import { DAY, HOUR, type CommunityS, type ReplyS, type TopicS } from './internal'
import { Read } from './read'

const denies = (v: Verdict | { ok: false; motivo: string } | { ok: true }): void => {
  if (!v.ok) throw new NetworkError(v.motivo as Denial, 'a regra não permite')
}
const keyName = (s: string) => withoutAccent(s).replace(/[^a-z0-9]/g, '')
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

export class Write extends Read {
  // ---- rule helpers ------------------------------------------------------------------------------

  protected relationWith(author: string, target: string): OwnerRelation {
    return {
      proprio: author === target,
      amigo: this.isFriend(author, target),
      friendForDays: this.friendForDays(author, target),
      accountAgeDays: this.accountAgeDays(author),
      bloqueio: this.bloqueio(author, target),
      recados: this.rover(target).recados,
    }
  }
  protected targetRover(uid: string): void {
    this.rover(uid)
  }
  protected topicOf(id: string, author: string): { t: TopicS; c: CommunityS } {
    const t = this.top(id)
    const c = this.dbCommunities.get(t.comunidade)
    if (!c || c.encerrada || !canInCommunity('ler', this.quem(c, author), c.acesso).ok) throw new NetworkError('nao-encontrado', 'tópico não encontrado')
    return { t, c }
  }
  protected roleRecord(c: CommunityS, author: string): 'dono' | 'moderador' {
    return c.dono === author ? 'dono' : 'moderador'
  }
  protected registrar(r: { escopo: 'comunidade' | 'pagina' | 'rele'; contexto: string | null; acao: 'remocao' | 'expulsao' | 'banimento' | 'dispensa'; alvoTipo: string | null; alvo: string; motivo: ModerationReason | 'dispensada'; por: 'dono' | 'moderador' | 'administrador' | 'rele'; appealId?: string }) {
    const x = { id: this.newId(), em: this.now(), ...r }
    this.registro.push(x)
    return x
  }
  protected notifyMentions(text: string, author: string, o: { objeto: string; comunidade?: string | null; pagina?: string | null }, alreadyNotified: Set<string>): void {
    const c = o.comunidade ? this.dbCommunities.get(o.comunidade) : undefined
    for (const h of extractMentions(text)) {
      const r = [...this.rovers.values()].find((x) => x.handle === h)
      if (!r || alreadyNotified.has(r.uid) || r.uid === author) continue
      if (c && !canInCommunity('ler', this.quem(c, r.uid), c.acesso).ok) continue
      alreadyNotified.add(r.uid)
      this.notify(r.uid, 'mencao', { origem: author, ...o })
    }
  }

  // ---- gestos livres -------------------------------------------------------------------------------------

  /** Lumi acts (the app bridge). */
  async agir(act: SocialAct): Promise<ActResult> {
    return this.executar(this.eu, act)
  }

  executar(author: string, act: SocialAct): ActResult {
    switch (act.tipo) {
      case 'estado':
        this.rover(author).estado = { estado: act.estado, em: iso(this.now()) }
        return {}
      case 'amizade':
        return this.friendshipAct(author, act.alvo, act.acao)
      case 'relacao':
        return this.relationAct(author, act.alvo, act.acao)
      case 'selo':
        return this.badgeAct(author, act.alvo, act.selo)
      case 'depoimento-decisao':
        return this.decideTestimonial(author, act.depoimento, act.decisao)
      case 'comunidade-adesao':
        return this.joinAct(author, act.comunidade, act.acao)
      case 'comunidade-gestao':
        return this.managementAct(author, act)
      case 'topico-gestao':
        return this.topicManagement(author, act)
      case 'topico-resolvido':
        return this.resolveAct(author, act.topico, act.resposta)
      case 'voto':
        return this.voteAct(author, act.topico, act.opcao)
      case 'pagina-seguir':
        return this.pageFollow(author, act.pagina, act.acao)
      case 'pagina-gestao':
        return this.pageManagement(author, act.pagina, act.alvo, act.acao)
      case 'remocao-por-responsavel':
        return this.removeByResponsible(author, act.alvo, act.motivo)
      case 'remocao-pelo-autor':
        return this.removeByAuthorSocial(author, act.alvo)
      case 'apelacao-decisao':
        return this.decideAppeal(author, act.apelacao, act.resultado)
      case 'denuncia':
        return this.reportAct(author, act.alvo, act.motivo)
      case 'denuncia-dispensar':
        return this.dismissReport(author, act.comunidade, act.alvo)
      case 'conversa-decidir':
      case 'conversa-apagar':
      case 'mensagem-denuncia':
        return this.messageAct(author, act)
    }
  }

  // ---- 0.4.0: private messages. The rules live in ./messages.ts (the layer above); here only the hook. ----------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- hook: the messages layer (./messages.ts) overrides
  protected messageAct(_author: string, _act: Extract<SocialAct, { tipo: 'conversa-decidir' | 'conversa-apagar' | 'mensagem-denuncia' }>): ActResult {
    throw new NetworkError('versao-nao-suportada', 'este relé não tem mensagens privadas')
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- hook: the messages layer (./messages.ts) overrides
  protected createFromMessage(_author: string, _type: 'conversa-pedir' | 'mensagem', _fields: Fields, _id: string): string {
    throw new NetworkError('versao-nao-suportada', 'este relé não tem mensagens privadas')
  }

  // ---- friendship and relations --------------------------------------------------------------------------------------

  protected friendshipAct(author: string, target: string, action: 'pedir' | 'aceitar' | 'recusar' | 'desfazer'): ActResult {
    this.targetRover(target)
    if (author === target) throw new NetworkError('invalido', 'um rover não faz amizade consigo')
    const request = (from: string, to: string) => this.pedidos.findIndex((p) => p.de === from && p.para === to)
    if (this.bloqueio(author, target) && action !== 'desfazer') throw new NetworkError('interacao-nao-permitida', 'não é possível interagir')
    const t = this.now()
    if (action === 'pedir') {
      if (this.isFriend(author, target) || request(author, target) >= 0) throw new NetworkError('ja-existe', 'já são amigos ou já pediu')
      if (this.declined.some((r) => ((r.de === author && r.para === target) || (r.de === target && r.para === author)) && t - r.em < 7 * DAY)) throw new NetworkError('limite', 'houve recusa há menos de 7 dias')
      if (this.friendsOf(author).length >= 500) throw new NetworkError('limite-de-estrutura', 'limite de amigos')
      if (this.pedidos.filter((p) => p.de === author).length >= 50) throw new NetworkError('limite-de-estrutura', 'pedidos enviados demais')
      if (this.pedidos.filter((p) => p.para === target).length >= 100) throw new NetworkError('limite-de-estrutura', 'o alvo tem pedidos demais')
      const back = request(target, author)
      if (back >= 0) {
        this.pedidos.splice(back, 1)
        this.amizades.push({ a: target, b: author, desde: t })
        this.notify(target, 'amizade-aceita', { origem: author })
        return { resultado: 'ativa' }
      }
      this.pedidos.push({ de: author, para: target, em: t })
      this.notify(target, 'pedido-de-amizade', { origem: author })
      return { resultado: 'pendente' }
    }
    if (action === 'aceitar' || action === 'recusar') {
      const i = request(target, author)
      if (i < 0) throw new NetworkError('nao-encontrado', 'não há pedido')
      this.pedidos.splice(i, 1)
      if (action === 'recusar') {
        this.declined.push({ de: target, para: author, em: t })
        return { resultado: 'nenhuma' }
      }
      this.amizades.push({ a: target, b: author, desde: t })
      this.notify(target, 'amizade-aceita', { origem: author })
      return { resultado: 'ativa' }
    }
    const am = this.amizade(author, target)
    if (am) {
      this.amizades.splice(this.amizades.indexOf(am), 1)
      return { resultado: 'nenhuma' }
    }
    const i = request(author, target)
    if (i < 0) throw new NetworkError('nao-encontrado', 'nada a desfazer')
    this.pedidos.splice(i, 1)
    return { resultado: 'nenhuma' }
  }

  protected relationAct(author: string, target: string, action: 'bloquear' | 'desbloquear' | 'silenciar' | 'dessilenciar'): ActResult {
    this.targetRover(target)
    if (author === target) throw new NetworkError('invalido', 'um rover não age sobre si')
    const k = this.chave(author, target)
    const current = this.dbRelations.get(k)?.relacao
    const wants = action === 'bloquear' ? 'bloqueio' : action === 'silenciar' ? 'silencio' : null
    if (wants) {
      if (current === wants) throw new NetworkError('ja-existe', 'já está assim')
      const total = [...this.dbRelations.entries()].filter(([c, v]) => c.startsWith(`${author}>`) && v.relacao === wants).length
      if (total >= 1000) throw new NetworkError('limite-de-estrutura', 'limite de relações')
      this.dbRelations.set(k, { relacao: wants, desde: this.now() })
      if (wants === 'bloqueio') {
        // undoes friendship, requests and follow in both directions, and hides the pending testimonials between the two
        const am = this.amizade(author, target)
        if (am) this.amizades.splice(this.amizades.indexOf(am), 1)
        for (let i = this.pedidos.length - 1; i >= 0; i--) {
          const p = this.pedidos[i]
          if ((p.de === author && p.para === target) || (p.de === target && p.para === author)) this.pedidos.splice(i, 1)
        }
        this.hooks.undoFollow(author, target)
        this.hooks.undoFollow(target, author)
        for (const d of this.dbTestimonials) if (d.estado === 'pendente' && ((d.autor === target && d.alvo === author) || (d.autor === author && d.alvo === target))) d.estado = 'recusado'
      }
      return {}
    }
    const type = action === 'desbloquear' ? 'bloqueio' : 'silencio'
    if (current !== type) throw new NetworkError('ja-existe', 'já está assim')
    this.dbRelations.delete(k)
    return {}
  }

  protected badgeAct(author: string, target: string, badge: import('../types').BadgeType): ActResult {
    this.targetRover(target)
    denies(canOnProfile('selo', this.relationWith(author, target)))
    if (this.dbBadges.some((s) => !s.apagado && s.donor === author && s.alvo === target && s.selo === badge)) throw new NetworkError('ja-existe', 'esse selo já foi dado')
    if (this.dbBadges.filter((s) => s.alvo === target && this.now() - s.em < DAY).length >= 10) throw new NetworkError('limite', 'selos demais por dia')
    this.dbBadges.push({ id: this.newId(), donor: author, alvo: target, selo: badge, em: this.now() })
    this.notify(target, 'selo-recebido', { origem: null })
    return {}
  }

  protected decideTestimonial(author: string, id: string, decision: 'aceitar' | 'recusar'): ActResult {
    const d = this.dbTestimonials.find((x) => x.id === id && !x.apagado)
    if (!d) throw new NetworkError('nao-encontrado', 'depoimento não encontrado')
    if (d.alvo !== author) throw new NetworkError('sem-permissao', 'só o dono do perfil decide')
    const newValue = applyDecision(d.estado, decision)
    if (newValue === null) throw new NetworkError('ja-existe', 'o depoimento já está assim')
    d.estado = newValue
    if (newValue === 'aceito') {
      d.aceitoEm = this.now()
      this.notify(d.autor, 'depoimento-aceito', { origem: author, objeto: d.id })
    } else d.declinedAt = this.now()
    return { resultado: newValue }
  }

  // ---- comunidades -------------------------------------------------------------------------------------------------

  protected joinAct(author: string, id: string, action: 'entrar' | 'sair' | 'aceitar-convite' | 'recusar-convite' | 'cancelar-pedido'): ActResult {
    const c = this.com(id)
    const invite = c.convites.findIndex((x) => x.uid === author)
    const q = this.quem(c, author)
    // a closed one only exists for whoever was invited or is already a member
    if (c.acesso === 'fechada' && q.papel === null && invite < 0) throw new NetworkError('nao-encontrado', 'comunidade não encontrada')
    const t = this.now()
    const joined = () => {
      c.membros.set(author, { papel: 'membro', desde: t })
      c.entries.push(t)
    }
    const howMany = () => [...this.dbCommunities.values()].filter((x) => !x.encerrada && x.membros.has(author)).length
    switch (action) {
      case 'entrar': {
        denies(canInCommunity(c.acesso === 'moderada' ? 'pedir-entrada' : 'entrar', q, c.acesso))
        if (howMany() >= 200) throw new NetworkError('limite-de-estrutura', 'comunidades demais')
        const raid = c.entries.filter((e) => t - e < HOUR).length > 30
        if (c.acesso === 'aberta' && !raid) {
          joined()
          return { resultado: 'membro' }
        }
        if (c.pedidos.some((p) => p.uid === author)) throw new NetworkError('ja-existe', 'já pediu')
        if ([...this.dbCommunities.values()].reduce((n, x) => n + x.pedidos.filter((p) => p.uid === author).length, 0) >= 20) throw new NetworkError('limite-de-estrutura', 'pedidos demais')
        if (c.pedidos.length >= 500) throw new NetworkError('limite-de-estrutura', 'pedidos demais na comunidade')
        c.pedidos.push({ uid: author, em: t })
        for (const [u, m] of c.membros) if (m.papel !== 'membro') this.notify(u, 'pedido-de-entrada', { origem: author, comunidade: c.id })
        return { resultado: 'pendente' }
      }
      case 'sair':
        denies(canInCommunity('sair', q, c.acesso))
        c.membros.delete(author)
        return { resultado: 'fora' }
      case 'aceitar-convite':
        if (invite < 0) throw new NetworkError('nao-encontrado', 'não há convite')
        if (q.banido) throw new NetworkError('banido', 'banido')
        c.convites.splice(invite, 1)
        joined()
        return { resultado: 'membro' }
      case 'recusar-convite':
        if (invite < 0) throw new NetworkError('nao-encontrado', 'não há convite')
        c.convites.splice(invite, 1)
        return { resultado: 'fora' }
      case 'cancelar-pedido': {
        const i = c.pedidos.findIndex((p) => p.uid === author)
        if (i < 0) throw new NetworkError('nao-encontrado', 'não há pedido')
        c.pedidos.splice(i, 1)
        return { resultado: 'fora' }
      }
    }
  }

  protected managementAct(author: string, a: Extract<SocialAct, { tipo: 'comunidade-gestao' }>): ActResult {
    if (validateManagement(a.acao, a.motivo) !== null) throw new NetworkError('invalido', 'motivo inválido para esta ação')
    if (a.alvo === author) throw new NetworkError('invalido', 'um rover não age sobre si')
    const c = this.com(a.comunidade)
    const q = this.quem(c, author)
    // whoever cannot even read the community does not know it exists
    if (!canInCommunity('ler', q, c.acesso).ok) throw new NetworkError('nao-encontrado', 'comunidade não encontrada')
    this.targetRover(a.alvo)
    const targetRole = this.papel(c, a.alvo)
    if (targetRole === 'dono') throw new NetworkError('sem-permissao', 'ninguém age sobre o dono')
    if (this.bloqueio(author, a.alvo) && a.acao === 'convidar') throw new NetworkError('interacao-nao-permitida', 'não é possível interagir')
    const t = this.now()
    const by = this.roleRecord(c, author)
    const whoRole = { alvoPapel: targetRole }
    switch (a.acao) {
      case 'convidar':
        denies(canInCommunity('convidar', q, c.acesso))
        if (targetRole !== null) throw new NetworkError('ja-existe', 'já é membro')
        if (this.banido(c, a.alvo)) throw new NetworkError('banido', 'o rover está banido')
        if (c.convites.some((x) => x.uid === a.alvo)) throw new NetworkError('ja-existe', 'já foi convidado')
        if (c.convites.length >= 100 || [...this.dbCommunities.values()].reduce((n, x) => n + x.convites.filter((v) => v.uid === a.alvo).length, 0) >= 50) throw new NetworkError('limite-de-estrutura', 'convites demais')
        c.convites.push({ uid: a.alvo, por: author, em: t })
        this.notify(a.alvo, 'convite-comunidade', { origem: author, comunidade: c.id })
        return {}
      case 'cancelar-convite': {
        denies(canInCommunity('convidar', q, c.acesso))
        const i = c.convites.findIndex((x) => x.uid === a.alvo)
        if (i < 0) throw new NetworkError('nao-encontrado', 'não há convite')
        c.convites.splice(i, 1)
        return {}
      }
      case 'aprovar-pedido':
      case 'recusar-pedido': {
        denies(canInCommunity('decidir-pedido', q, c.acesso))
        const i = c.pedidos.findIndex((x) => x.uid === a.alvo)
        if (i < 0) throw new NetworkError('nao-encontrado', 'não há pedido')
        c.pedidos.splice(i, 1)
        if (a.acao === 'recusar-pedido') return { resultado: 'fora' }
        c.membros.set(a.alvo, { papel: 'membro', desde: t })
        c.entries.push(t)
        this.notify(a.alvo, 'entrada-aprovada', { origem: author, comunidade: c.id })
        return { resultado: 'membro' }
      }
      case 'expulsar':
        denies(canInCommunity('expulsar', q, c.acesso, whoRole))
        if (targetRole === null) throw new NetworkError('nao-encontrado', 'não é membro')
        c.membros.delete(a.alvo)
        this.registrar({ escopo: 'comunidade', contexto: c.id, acao: 'expulsao', alvoTipo: null, alvo: a.alvo, motivo: a.motivo!, por: by })
        this.notify(a.alvo, 'expulso', { origem: null, comunidade: c.id })
        return { resultado: 'fora' }
      case 'banir': {
        denies(canInCommunity('banir', q, c.acesso, whoRole))
        if (this.banido(c, a.alvo)) throw new NetworkError('ja-existe', 'já está banido')
        c.membros.delete(a.alvo)
        c.convites = c.convites.filter((x) => x.uid !== a.alvo)
        c.pedidos = c.pedidos.filter((x) => x.uid !== a.alvo)
        c.banidos.push({ uid: a.alvo, motivo: a.motivo!, por: by === 'dono' ? 'dono' : 'moderador', em: t })
        this.registrar({ escopo: 'comunidade', contexto: c.id, acao: 'banimento', alvoTipo: null, alvo: a.alvo, motivo: a.motivo!, por: by })
        this.notify(a.alvo, 'banido', { origem: null, comunidade: c.id })
        return { resultado: 'fora' }
      }
      case 'desbanir': {
        denies(canInCommunity('desbanir', q, c.acesso))
        const i = c.banidos.findIndex((b) => b.uid === a.alvo)
        if (i < 0) throw new NetworkError('nao-encontrado', 'não está banido')
        c.banidos.splice(i, 1)
        return {}
      }
      case 'promover': {
        denies(canInCommunity('promover', q, c.acesso))
        if (targetRole === null) throw new NetworkError('nao-e-membro', 'o rover não é membro')
        if (targetRole === 'moderador') throw new NetworkError('ja-existe', 'já é moderador')
        if ([...c.membros.values()].filter((m) => m.papel === 'moderador').length >= 10) throw new NetworkError('limite-de-estrutura', 'moderadores demais')
        c.membros.get(a.alvo)!.papel = 'moderador'
        return {}
      }
      case 'rebaixar':
        denies(canInCommunity('rebaixar', q, c.acesso))
        if (targetRole !== 'moderador') throw new NetworkError('nao-encontrado', 'não é moderador')
        c.membros.get(a.alvo)!.papel = 'membro'
        return {}
    }
  }

  protected topicManagement(author: string, a: Extract<SocialAct, { tipo: 'topico-gestao' }>): ActResult {
    const { t, c } = this.topicOf(a.topico, author)
    const q = this.quem(c, author)
    if (a.acao === 'mover') {
      const dest = this.com(a.comunidade ?? '')
      const qd = this.quem(dest, author)
      if (!canInCommunity('ler', qd, dest.acesso).ok) throw new NetworkError('nao-encontrado', 'comunidade não encontrada')
      denies(canMoveTopic({ papel: q.papel, acesso: c.acesso }, { papel: qd.papel, acesso: dest.acesso }))
      if (a.categoria !== null && !dest.categorias.includes(a.categoria)) throw new NetworkError('invalido', 'a categoria não existe no destino')
      t.comunidade = dest.id
      t.categoria = a.categoria
      t.fixado = false
      return {}
    }
    denies(canInCommunity(a.acao === 'fixar' || a.acao === 'desafixar' ? 'fixar' : 'trancar', q, c.acesso))
    if (a.acao === 'fixar') {
      if (!t.fixado && [...this.dbTopics.values()].filter((x) => x.comunidade === c.id && x.fixado && !x.removido && !x.apagado).length >= 3) throw new NetworkError('limite-de-estrutura', 'só 3 fixados')
      t.fixado = true
    } else if (a.acao === 'desafixar') t.fixado = false
    else t.trancado = a.acao === 'trancar'
    return {}
  }

  protected resolveAct(author: string, topic: string, reply: string | null): ActResult {
    const { t, c } = this.topicOf(topic, author)
    denies(canInCommunity('resolver', this.quem(c, author), c.acesso, { meuTopico: t.autor === author }))
    if (reply === null) {
      t.resolvidoPor = null
      return {}
    }
    const r = this.dbReplies.get(reply)
    if (!r || r.topico !== t.id || r.removida || r.apagada) throw new NetworkError('nao-encontrado', 'resposta não encontrada')
    t.resolvidoPor = { resposta: reply, por: author, em: this.now() }
    this.notify(r.autor, 'resolveu', { origem: author, objeto: r.id, comunidade: c.id })
    return {}
  }

  protected voteAct(author: string, topic: string, option: number): ActResult {
    const { t, c } = this.topicOf(topic, author)
    denies(canInCommunity('votar', this.quem(c, author), c.acesso))
    const e = t.enquete
    if (!e) throw new NetworkError('nao-encontrado', 'o tópico não tem enquete')
    if (this.now() >= e.encerraEm) throw new NetworkError('enquete-encerrada', 'a enquete terminou')
    if (!Number.isInteger(option) || option < 0 || option >= e.opcoes.length) throw new NetworkError('invalido', 'opção inexistente')
    if (e.voters.has(author)) throw new NetworkError('ja-existe', 'já votou: não há troca de voto')
    e.voters.set(author, option)
    e.votos[option]++
    return {}
  }

  // ---- pages ---------------------------------------------------------------------------------------------------------

  protected pageFollow(author: string, id: string, action: 'seguir' | 'deixar'): ActResult {
    const p = this.page(id)
    if (action === 'seguir') {
      if (p.seguidores.has(author)) throw new NetworkError('ja-existe', 'já segue')
      if ([...this.dbPages.values()].filter((x) => !x.encerrada && x.seguidores.has(author)).length >= 300) throw new NetworkError('limite-de-estrutura', 'páginas demais')
      p.seguidores.set(author, this.now())
      if (p.dono !== author && this.publicGraph(author)) this.notify(p.dono, 'novo-seguidor', { origem: author, pagina: p.id })
      return {}
    }
    if (!p.seguidores.has(author)) throw new NetworkError('nao-encontrado', 'não segue')
    p.seguidores.delete(author)
    return {}
  }

  protected pageManagement(author: string, id: string, target: string, action: 'adicionar-admin' | 'remover-admin'): ActResult {
    const p = this.page(id)
    denies(canOnPage('gerir-administradores', this.roleOnPage(p, author)))
    this.targetRover(target)
    if (action === 'adicionar-admin') {
      if (p.admins.includes(target)) throw new NetworkError('ja-existe', 'já é administrador')
      if (p.admins.length >= 10) throw new NetworkError('limite-de-estrutura', 'administradores demais')
      p.admins.push(target)
      return {}
    }
    if (target === p.dono) throw new NetworkError('invalido', 'o dono não se remove')
    if (!p.admins.includes(target)) throw new NetworkError('nao-encontrado', 'não é administrador')
    p.admins = p.admins.filter((u) => u !== target)
    return {}
  }

  // ---- removal, appeal, report ---------------------------------------------------------------------------------

  protected hold(id: string, o: { texto: string; tipo: string; autor: string; byRole: 'dono' | 'moderador' | 'administrador' | 'rele'; comunidade: string | null; pagina: string | null }) {
    this.held.set(id, { ...o, removidoEm: this.now() })
  }

  protected removeByResponsible(author: string, id: string, reason: ModerationReason): ActResult {
    const rec = this.dbNotes.find((x) => x.id === id)
    if (rec) {
      if (rec.alvo !== author) throw new NetworkError('sem-permissao', 'só o dono do mural remove')
      if (!rec.removido) {
        rec.removido = true
        this.hold(id, { texto: rec.texto, tipo: 'recado', autor: rec.autor, byRole: 'dono', comunidade: null, pagina: null })
        this.notify(rec.autor, 'removido-por-responsavel', { origem: null, objeto: id })
      }
      return {}
    }
    const dep = this.dbTestimonials.find((x) => x.id === id)
    if (dep) {
      if (dep.alvo !== author) throw new NetworkError('sem-permissao', 'só o dono do perfil remove')
      if (!dep.apagado) {
        dep.apagado = true
        this.hold(id, { texto: dep.texto, tipo: 'depoimento', autor: dep.autor, byRole: 'dono', comunidade: null, pagina: null })
        this.notify(dep.autor, 'removido-por-responsavel', { origem: null, objeto: id })
      }
      return {}
    }
    const t = this.dbTopics.get(id)
    const r = this.dbReplies.get(id)
    if (t || r) {
      const tp = t ?? this.dbTopics.get(r!.topico)
      const c = tp ? this.dbCommunities.get(tp.comunidade) : undefined
      if (!tp || !c || c.encerrada || !canInCommunity('ler', this.quem(c, author), c.acesso).ok) throw new NetworkError('nao-encontrado', 'não encontrado')
      const owner = (t ?? r!).autor
      if (owner === author) throw new NetworkError('sem-permissao', 'para o seu próprio conteúdo, apague')
      denies(canInCommunity('remover-alheio', this.quem(c, author), c.acesso, { conteudoDoDono: owner === c.dono }))
      const already = t ? t.removido : r!.removida
      if (already) return {}
      const by = this.roleRecord(c, author)
      if (t) t.removido = { por: by, em: this.now() }
      else r!.removida = { por: by, em: this.now() }
      this.hold(id, { texto: t ? `${t.titulo}\n${t.texto}` : r!.texto, tipo: t ? 'topico' : 'resposta-forum', autor: owner, byRole: by, comunidade: c.id, pagina: null })
      this.registrar({ escopo: 'comunidade', contexto: c.id, acao: 'remocao', alvoTipo: t ? 'topico' : 'resposta-forum', alvo: id, motivo: reason, por: by })
      this.notify(owner, 'removido-por-responsavel', { origem: null, objeto: id, comunidade: c.id })
      return {}
    }
    const at = this.dbUpdates.get(id)
    if (at) {
      const p = this.dbPages.get(at.pagina)
      if (!p || p.encerrada) throw new NetworkError('nao-encontrado', 'página não encontrada')
      denies(canOnPage('remover-atualizacao-alheia', this.roleOnPage(p, author)))
      if (at.autor === author) throw new NetworkError('sem-permissao', 'para o seu próprio conteúdo, apague')
      if (!at.removida) {
        at.removida = { por: 'dono', em: this.now() }
        this.hold(id, { texto: `${at.titulo ?? ''}\n${at.texto}`, tipo: 'pagina-publicar', autor: at.autor, byRole: 'dono', comunidade: null, pagina: p.id })
        this.registrar({ escopo: 'pagina', contexto: p.id, acao: 'remocao', alvoTipo: 'pagina-publicar', alvo: id, motivo: reason, por: 'dono' })
        this.notify(at.autor, 'removido-por-responsavel', { origem: null, objeto: id, pagina: p.id })
      }
      return {}
    }
    throw new NetworkError(this.dbCommunities.has(id) || this.dbPages.has(id) ? 'sem-permissao' : 'nao-encontrado', 'não é possível remover isto por aqui')
  }

  protected removeByAuthorSocial(author: string, id: string): ActResult {
    const so = (owner: string) => {
      if (owner !== author) throw new NetworkError('sem-permissao', 'só quem escreveu apaga')
    }
    const rec = this.dbNotes.find((x) => x.id === id && !x.apagado)
    if (rec) {
      so(rec.autor)
      rec.apagado = true
      return {}
    }
    const dep = this.dbTestimonials.find((x) => x.id === id && !x.apagado)
    if (dep) {
      so(dep.autor)
      dep.apagado = true
      return {}
    }
    const sl = this.dbBadges.find((x) => x.id === id && !x.apagado)
    if (sl) {
      so(sl.donor)
      sl.apagado = true
      return {}
    }
    const en = this.dbDeliveries.find((x) => x.id === id && !x.apagado)
    if (en) {
      so(en.autor)
      en.apagado = true
      return {}
    }
    const t = this.dbTopics.get(id)
    if (t && !t.apagado) {
      so(t.autor)
      t.apagado = true
      return {}
    }
    const r = this.dbReplies.get(id)
    if (r && !r.apagada) {
      so(r.autor)
      r.apagada = true
      return {}
    }
    const at = this.dbUpdates.get(id)
    if (at && !at.apagada) {
      so(at.autor)
      at.apagada = true
      return {}
    }
    const pg = this.dbPages.get(id)
    if (pg && !pg.encerrada) {
      so(pg.dono)
      pg.encerrada = true
      return {}
    }
    if (this.hooks.removeOldPost(id, author)) return {}
    throw new NetworkError('nao-encontrado', 'não encontrado')
  }

  protected decideAppeal(author: string, id: string, result: 'mantida' | 'revertida'): ActResult {
    const a = this.apelacoes.find((x) => x.id === id)
    if (!a) throw new NetworkError('nao-encontrado', 'apelação não encontrada')
    const c = a.comunidade ? this.dbCommunities.get(a.comunidade) : undefined
    if (!c || whoDecidesAppeal(a.agiuPor) !== 'dono' || c.dono !== author) throw new NetworkError('sem-permissao', 'só o dono decide, e só quando quem agiu foi um moderador')
    if (a.situacao !== 'aberta') throw new NetworkError('ja-existe', 'a apelação já foi decidida')
    a.situacao = result
    if (result === 'revertida') {
      if (a.tipo === 'banimento') c.banidos = c.banidos.filter((b) => b.uid !== a.autor)
      else {
        const t = this.dbTopics.get(a.alvo)
        const r = this.dbReplies.get(a.alvo)
        if (t) t.removido = undefined
        if (r) r.removida = undefined
        this.held.delete(a.alvo)
      }
    }
    this.notify(a.autor, 'apelacao-decidida', { origem: null, comunidade: c.id, objeto: a.tipo === 'remocao' ? a.alvo : null })
    return {}
  }

  /**
   * 0.3.1 (`denuncia-dispensar`): moderation concluded there is nothing to do. The open reports of that target, in that community, leave the queue;
   * the content stays visible and nothing is deleted; whoever already reported does not report again; a new report, from another person, reopens the case.
   * It goes in the public log with `acao: 'dispensa'` and the ROLE of whoever dismissed it, never who reported.
   */
  protected dismissReport(author: string, community: string, target: string): ActResult {
    const c = this.dbCommunities.get(community)
    if (!c || c.encerrada || !canInCommunity('ler', this.quem(c, author), c.acesso).ok) throw new NetworkError('nao-encontrado', 'comunidade não encontrada')
    if (!this.isTeam(c, author)) throw new NetworkError('sem-permissao', 'só o dono e a moderação dispensam denúncias')
    const t = this.dbTopics.get(target)
    const r = this.dbReplies.get(target)
    const tp = t ?? (r ? this.dbTopics.get(r.topico) : undefined)
    const open = this.denuncias.filter((d) => d.alvo === target && d.dismissedAt === undefined)
    if (!tp || tp.comunidade !== c.id || open.length === 0) throw new NetworkError('nao-encontrado', 'não há denúncia aberta para isto nesta comunidade')
    const now = this.now()
    for (const d of open) d.dismissedAt = now
    this.registrar({ escopo: 'comunidade', contexto: c.id, acao: 'dispensa', alvoTipo: t ? 'topico' : 'resposta-forum', alvo: target, motivo: 'dispensada', por: this.roleRecord(c, author) })
    return {}
  }

  protected reportAct(author: string, target: string, reason: import('../types').SocialReportReason): ActResult {
    if (!(SOCIAL_REPORT_REASONS as readonly string[]).includes(reason)) throw new NetworkError('invalido', 'motivo inválido')
    const who = hash(`sal-social|${author}`)
    const today = (this.reportsByWhom.get(who) ?? []).filter((t) => this.now() - t < DAY)
    if (today.length >= 10) throw new NetworkError('limite', 'denúncias demais hoje')
    today.push(this.now())
    this.reportsByWhom.set(who, today)
    if (this.hooks.reportOld(target, reason)) return {}
    // whoever could not see the target (a closed one they do not take part in) has the report DISCARDED, with the same answer
    if (!this.existsAndVisible(target, author)) return {}
    this.denuncias.push({ alvo: target, quem: who, motivo: reason, em: this.now(), weighs: this.accountAgeDays(author) >= 7 })
    return {}
  }
  /** Is the id of some known social object (visible or not)? */
  knows(id: string): boolean {
    return this.dbTopics.has(id) || this.dbReplies.has(id) || this.dbCommunities.has(id) || this.dbPages.has(id) || this.dbUpdates.has(id) || this.dbNotes.some((x) => x.id === id) || this.dbDeliveries.some((x) => x.id === id) || this.dbTestimonials.some((x) => x.id === id)
  }
  protected existsAndVisible(id: string, reader: string): boolean {
    const t = this.dbTopics.get(id)
    const r = this.dbReplies.get(id)
    if (t || r) {
      const tp = t ?? this.dbTopics.get(r!.topico)
      const c = tp ? this.dbCommunities.get(tp.comunidade) : undefined
      return !!c && !c.encerrada && canInCommunity('ler', this.quem(c, reader), c.acesso).ok
    }
    const c = this.dbCommunities.get(id)
    if (c) return !c.encerrada && canInCommunity('ler', this.quem(c, reader), c.acesso).ok
    return this.dbPages.has(id) || this.dbUpdates.has(id) || this.dbNotes.some((x) => x.id === id) || this.dbDeliveries.some((x) => x.id === id) || this.dbTestimonials.some((x) => x.id === id && x.estado === 'aceito')
  }

  // ---- reactions on the new objects -----------------------------------------------------------------------------------

  /** Reacts to a topic, forum reply or update. Returns false if the id is none of them. */
  reactSocial(author: string, id: string, reaction: ReactionType): boolean {
    const t = this.dbTopics.get(id)
    const r = this.dbReplies.get(id)
    const at = this.dbUpdates.get(id)
    const target = t ?? r ?? at
    if (!target) return false
    const reactors = target.reactors
    if (t || r) {
      const tp = t ?? this.dbTopics.get(r!.topico)!
      const c = this.dbCommunities.get(tp.comunidade)
      if (!c || c.encerrada || !canInCommunity('ler', this.quem(c, author), c.acesso).ok) throw new NetworkError('nao-encontrado', 'não encontrado')
      denies(canInCommunity('reagir', this.quem(c, author), c.acesso))
      if (this.bloqueio(author, (t ?? r!).autor)) throw new NetworkError('interacao-nao-permitida', 'não é possível interagir')
    }
    if (reactors.get(author) === reaction) reactors.delete(author)
    else reactors.set(author, reaction)
    return true
  }

  // ---- create the text objects (after approval) -----------------------------------------------------------

  /** Creates the object the approval released. Returns the id. Each type applies the protocol rules. */
  criar(author: string, type: SocialType, fields: Fields): string {
    const findings = parseSocial({ tipo: type, campos: fields, destino: null })
    if (blocksSocial(findings.filter((a) => a.codigo !== 'sem-destino'))) throw new NetworkError('invalido', 'o objeto não passa nas regras de texto')
    const t = this.now()
    const id = this.newId()
    switch (type) {
      case 'recado': {
        const target = str(fields.alvo)
        this.targetRover(target)
        denies(canOnProfile('recado', this.relationWith(author, target)))
        const day = this.dbNotes.filter((x) => x.alvo === target && t - x.em < DAY)
        if (day.filter((x) => x.autor === author).length >= 3) throw new NetworkError('limite', 'recados demais para este mural hoje')
        if (!this.isFriend(author, target) && day.filter((x) => !this.isFriend(x.autor, target)).length >= 30) throw new NetworkError('limite', 'o mural recebeu recados demais hoje')
        this.dbNotes.push({ id, autor: author, alvo: target, texto: str(fields.texto), em: t })
        this.notify(target, 'recado', { origem: author, objeto: id })
        this.notifyMentions(str(fields.texto), author, { objeto: id }, new Set([target]))
        return id
      }
      case 'depoimento': {
        const target = str(fields.alvo)
        this.targetRover(target)
        denies(canOnProfile('depoimento', this.relationWith(author, target)))
        const fromPair = this.dbTestimonials.filter((d) => d.autor === author && d.alvo === target && !d.apagado)
        const refused = Math.max(0, ...fromPair.filter((d) => d.estado === 'recusado').map((d) => d.declinedAt ?? d.em))
        const v = canWriteAnother(fromPair.map((d) => ({ estado: d.estado, criadoEm: iso(d.em) })), this.dbTestimonials.filter((d) => d.alvo === target && d.estado === 'pendente' && !d.apagado).length, t, refused || undefined)
        if (!v.ok) throw new NetworkError(v.motivo === 'espera' ? 'limite' : v.motivo, 'não pode escrever agora')
        this.dbTestimonials.push({ id, autor: author, alvo: target, texto: str(fields.texto), estado: 'pendente', em: t })
        this.notify(target, 'depoimento-para-aceitar', { origem: author, objeto: id })
        return id
      }
      case 'entrega': {
        if (this.dbDeliveries.filter((e) => e.autor === author && !e.apagado).length >= 100) throw new NetworkError('limite-de-estrutura', 'entregas demais')
        this.dbDeliveries.push({ id, autor: author, titulo: str(fields.titulo), descricao: str(fields.descricao), resultado: str(fields.resultado), tags: list(fields.tags), em: t })
        return id
      }
      case 'comunidade-criar':
        return this.createCommunity(author, fields, id)
      case 'comunidade-atualizar':
        return this.updateCommunity(author, fields)
      case 'comunidade-posse':
        return this.posse(author, fields)
      case 'topico':
        return this.createTopic(author, fields, id)
      case 'topico-editar':
        return this.editTopic(author, fields)
      case 'resposta-forum':
        return this.createReply(author, fields, id)
      case 'pagina-criar': {
        if (this.accountAgeDays(author) < 1) throw new NetworkError('conta-nova', 'a conta é nova demais')
        if ([...this.dbPages.values()].filter((p) => !p.encerrada && p.dono === author).length >= 5) throw new NetworkError('limite-de-estrutura', 'páginas demais')
        const name = str(fields.nome)
        if ([...this.dbPages.values()].some((p) => !p.encerrada && keyName(p.nome) === keyName(name))) throw new NetworkError('ja-existe', 'o nome já existe')
        this.dbPages.set(id, { id, nome: name, descricao: str(fields.descricao), tema: str(fields.tema), dono: author, admins: [author], criadaEm: t, seguidores: new Map(), extraFollowers: 0 })
        return id
      }
      case 'pagina-atualizar': {
        const p = this.page(str(fields.pagina))
        denies(canOnPage('atualizar', this.roleOnPage(p, author)))
        const name = str(fields.nome)
        if ([...this.dbPages.values()].some((x) => x.id !== p.id && !x.encerrada && keyName(x.nome) === keyName(name))) throw new NetworkError('ja-existe', 'o nome já existe')
        Object.assign(p, { nome: name, descricao: str(fields.descricao), tema: str(fields.tema) })
        return p.id
      }
      case 'pagina-publicar': {
        const p = this.page(str(fields.pagina))
        denies(canOnPage('publicar', this.roleOnPage(p, author)))
        this.dbUpdates.set(id, { id, pagina: p.id, autor: author, titulo: str(fields.titulo) || null, texto: str(fields.texto), tags: list(fields.tags), em: t, reactors: new Map() })
        return id
      }
      case 'apelacao':
        return this.createAppeal(author, fields, id)
      case 'conversa-pedir':
      case 'mensagem':
        return this.createFromMessage(author, type, fields, id)
    }
  }

  protected createCommunity(author: string, fields: Fields, id: string): string {
    if (this.accountAgeDays(author) < 1) throw new NetworkError('conta-nova', 'a conta é nova demais')
    if ([...this.dbCommunities.values()].filter((c) => !c.encerrada && c.dono === author).length >= 10) throw new NetworkError('limite-de-estrutura', 'comunidades demais')
    const name = str(fields.nome)
    const access = str(fields.acesso) as CommunityS['acesso']
    // a closed one does not reserve a name (reserving would leak that it exists)
    if (access !== 'fechada' && [...this.dbCommunities.values()].some((c) => !c.encerrada && c.acesso !== 'fechada' && keyName(c.nome) === keyName(name))) throw new NetworkError('ja-existe', 'o nome já existe')
    const t = this.now()
    this.dbCommunities.set(id, {
      id, nome: name, descricao: str(fields.descricao), regras: str(fields.regras), tema: str(fields.tema), acesso: access, categorias: list(fields.categorias),
      dono: author, criadaEm: t, membros: new Map([[author, { papel: 'dono', desde: t }]]), pedidos: [], convites: [], banidos: [], entries: [], extraMembers: 0,
    })
    return id
  }

  protected updateCommunity(author: string, fields: Fields): string {
    const c = this.com(str(fields.comunidade))
    const q = this.quem(c, author)
    denies(canInCommunity('editar-dados', q, c.acesso))
    const access = str(fields.acesso) as CommunityS['acesso']
    if (access !== c.acesso) denies(canInCommunity('mudar-acesso', q, c.acesso))
    const name = str(fields.nome)
    if (access !== 'fechada' && [...this.dbCommunities.values()].some((x) => x.id !== c.id && !x.encerrada && x.acesso !== 'fechada' && keyName(x.nome) === keyName(name))) throw new NetworkError('ja-existe', 'o nome já existe')
    // topics of categories that left the list keep the category they had
    Object.assign(c, { nome: name, descricao: str(fields.descricao), regras: str(fields.regras), tema: str(fields.tema), acesso: access, categorias: list(fields.categorias) })
    return c.id
  }

  protected posse(author: string, fields: Fields): string {
    const c = this.com(str(fields.comunidade))
    denies(canInCommunity('transferir', this.quem(c, author), c.acesso))
    if (fields.acao === 'encerrar') {
      c.encerrada = true
      return c.id
    }
    const newValue = str(fields.novoDono)
    const m = c.membros.get(newValue)
    if (!m) throw new NetworkError('nao-e-membro', 'o novo dono precisa ser membro')
    m.papel = 'dono'
    c.dono = newValue
    const old = c.membros.get(author)!
    old.papel = [...c.membros.values()].filter((x) => x.papel === 'moderador').length < 10 ? 'moderador' : 'membro'
    this.notify(newValue, 'posse-recebida', { origem: author, comunidade: c.id })
    return c.id
  }

  protected createTopic(author: string, fields: Fields, id: string): string {
    const c = this.com(str(fields.comunidade))
    const q = this.quem(c, author)
    if (!canInCommunity('ler', q, c.acesso).ok) throw new NetworkError('nao-encontrado', 'comunidade não encontrada')
    denies(canInCommunity('postar-topico', q, c.acesso))
    const category = fields.categoria === null || fields.categoria === undefined || fields.categoria === '' ? null : str(fields.categoria)
    if (category !== null && !c.categorias.includes(category)) throw new NetworkError('invalido', 'a categoria não existe')
    const options = list(fields.enquete)
    const t = this.now()
    const days = Number(str(fields.enqueteDias) || '7')
    const text = str(fields.texto)
    const title = str(fields.titulo)
    const tags = list(fields.tags)
    this.dbTopics.set(id, {
      id, comunidade: c.id, categoria: category, autor: author, em: t, titulo: title, texto: text, tags, fixado: false, trancado: false,
      enquete: options.length >= 2 ? { opcoes: options, encerraEm: t + days * DAY, votos: options.map(() => 0), voters: new Map() } : null,
      resolvidoPor: null, versoes: [{ versao: 1, titulo: title, texto: text, tags: [...tags], em: t }], reactors: new Map(),
    })
    this.notifyMentions(`${title}\n${text}`, author, { objeto: id, comunidade: c.id }, new Set())
    return id
  }

  protected editTopic(author: string, fields: Fields): string {
    const { t } = this.topicOf(str(fields.topico), author)
    denies(canEditTopic({ meuTopico: t.autor === author, createdAtMs: t.em, nowMs: this.now(), edicoes: t.versoes.length - 1, trancado: t.trancado }))
    const title = str(fields.titulo)
    const text = str(fields.texto)
    const tags = list(fields.tags)
    t.versoes.push({ versao: t.versoes.length + 1, titulo: title, texto: text, tags: [...tags], em: this.now() })
    Object.assign(t, { titulo: title, texto: text, tags })
    return t.id
  }

  protected createReply(author: string, fields: Fields, id: string): string {
    const { t, c } = this.topicOf(str(fields.topico), author)
    if (t.removido) throw new NetworkError('removido', 'tópico escondido')
    const q = this.quem(c, author)
    denies(canInCommunity('responder', q, c.acesso))
    const team = q.papel === 'dono' || q.papel === 'moderador'
    if (t.trancado && !team) throw new NetworkError('trancado', 'o tópico está trancado')
    const live = this.liveReplies(t.id)
    const at = fields.em ? str(fields.em) : null
    const quotes = fields.cita ? str(fields.cita) : null
    let parent: ReplyS | undefined
    if (at) {
      parent = this.dbReplies.get(at)
      if (!parent || parent.topico !== t.id || parent.removida || parent.apagada) throw new NetworkError('nao-encontrado', 'resposta não encontrada')
      if (parent.parentId !== null) throw new NetworkError('resposta-funda', 'responda à mãe e cite esta')
    }
    let quoted: ReplyS | undefined
    if (quotes) {
      quoted = this.dbReplies.get(quotes)
      if (!quoted || quoted.topico !== t.id || quoted.removida || quoted.apagada) throw new NetworkError('nao-encontrado', 'resposta citada não encontrada')
    }
    for (const other of [parent?.autor, quoted?.autor]) if (other && this.bloqueio(author, other)) throw new NetworkError('interacao-nao-permitida', 'não é possível interagir')
    if (this.accountAgeDays(author) < 1 && live.filter((r) => r.autor === author && this.now() - r.em < HOUR).length >= 10) throw new NetworkError('limite', 'respostas demais por hora')
    const text = str(fields.texto)
    this.dbReplies.set(id, { id, topico: t.id, autor: author, texto: text, em: this.now(), parentId: at, cita: quotes, reactors: new Map() })
    // at most ONE notification per person, the one with the highest priority
    const done = new Set<string>([author])
    const give = (u: string | undefined, type: NotificationType) => {
      if (!u || done.has(u)) return
      done.add(u)
      this.notify(u, type, { origem: author, objeto: id, comunidade: c.id })
    }
    give(t.autor, 'resposta-no-topico')
    give(parent?.autor, 'resposta-a-voce')
    give(quoted?.autor, 'citacao')
    this.notifyMentions(text, author, { objeto: id, comunidade: c.id }, done)
    return id
  }

  protected createAppeal(author: string, fields: Fields, id: string): string {
    const type = str(fields.tipo) as 'remocao' | 'banimento'
    const target = str(fields.alvo)
    const t = this.now()
    if (this.apelacoes.some((a) => a.autor === author && a.alvo === target)) throw new NetworkError('ja-existe', 'já apelou deste caso')
    if (type === 'remocao') {
      const ret = this.held.get(target)
      if (!ret || ret.autor !== author) throw new NetworkError('nao-encontrado', 'conteúdo não encontrado')
      if (!ret.comunidade && !ret.pagina) throw new NetworkError('sem-permissao', 'remoção em mural não tem apelação')
      if (!canAppeal(iso(ret.removidoEm), this.clock())) throw new NetworkError('fora-da-janela', 'passaram mais de 14 dias')
      this.apelacoes.push({ id, tipo: type, alvo: target, autor: author, texto: str(fields.texto), em: t, comunidade: ret.comunidade, pagina: ret.pagina, agiuPor: ret.byRole, situacao: 'aberta' })
      const reg = this.registro.find((r) => r.alvo === target && r.acao === 'remocao')
      if (reg) reg.appealId = id
      const c = ret.comunidade ? this.dbCommunities.get(ret.comunidade) : undefined
      if (c && whoDecidesAppeal(ret.byRole) === 'dono') this.notify(c.dono, 'apelacao-recebida', { origem: author, comunidade: c.id })
      return id
    }
    const c = this.com(target)
    const b = c.banidos.find((x) => x.uid === author)
    if (!b) throw new NetworkError('sem-permissao', 'só quem foi banido apela do banimento')
    if (!canAppeal(iso(b.em), this.clock())) throw new NetworkError('fora-da-janela', 'passaram mais de 14 dias')
    this.apelacoes.push({ id, tipo: type, alvo: target, autor: author, texto: str(fields.texto), em: t, comunidade: c.id, pagina: null, agiuPor: b.por, situacao: 'aberta' })
    b.apelacao = id
    const reg = this.registro.find((r) => r.contexto === c.id && r.acao === 'banimento' && r.alvo === author)
    if (reg) reg.appealId = id
    if (whoDecidesAppeal(b.por) === 'dono') this.notify(c.dono, 'apelacao-recebida', { origem: author, comunidade: c.id })
    return id
  }

  // ---- Lumi's draft queue -----------------------------------------------------------------------------------

  async propor(type: SocialType, fields: Fields, destination: DraftTarget | null): Promise<SocialDraft> {
    for (const c of SOCIAL_SCHEMA[type]) if (!(c.nome in fields)) fields = { ...fields, [c.nome]: null }
    const r: SocialDraft = { id: this.newDraftId(), tipo: type, rover: this.resumo(this.eu), campos: fields, destino: destination, criadoEm: iso(this.now()), versao: 1, estado: 'pendente' }
    this.rascunhos.push(r)
    return structuredClone(r)
  }
  async rascunhosSociais(): Promise<SocialDraft[]> {
    return structuredClone(this.rascunhos.filter((r) => r.estado === 'pendente'))
  }
  async rascunhoSocial(id: string): Promise<SocialDraft | null> {
    const r = this.rascunhos.find((x) => x.id === id)
    return r ? structuredClone(r) : null
  }
  protected find(id: string): number {
    const i = this.rascunhos.findIndex((x) => x.id === id)
    if (i < 0) throw new NetworkError('nao-encontrado', 'rascunho não encontrado')
    return i
  }
  async editarSocial(id: string, fields: Fields): Promise<SocialDraft> {
    const i = this.find(id)
    this.rascunhos[i] = editPure(this.rascunhos[i], fields)
    return structuredClone(this.rascunhos[i])
  }
  async recusarSocial(id: string): Promise<SocialDraft> {
    const i = this.find(id)
    this.rascunhos[i] = declinePure(this.rascunhos[i], this.clock())
    return structuredClone(this.rascunhos[i])
  }
  async aprovarSocial(id: string, versionSeen: number): Promise<SocialApprovalResult & { objectId?: string }> {
    const i = this.find(id)
    const res = approvePure(this.rascunhos[i], versionSeen, this.clock())
    if (!res.ok) return res
    // if the relay refuses (new account, limit, block...), the error goes up and the draft STAYS pending
    const objectId = this.criar(this.eu, res.objeto.tipo, res.objeto.campos)
    this.rascunhos[i] = res.rascunho
    return { ...res, objectId }
  }
}
