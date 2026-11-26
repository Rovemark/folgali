/* eslint-disable @typescript-eslint/no-explicit-any */
// The READ side of the social fake client: one function per route of docs/API-SOCIAL-NETWORK.md, with the same
// visibility rules as the relay (a closed one does not exist for whoever is outside, closed graph, pending only
// for the owner and the author, no hidden content). The reader is always Lumi (`this.eu`).

import { visibleTo } from '../../domain/testimonial'
import { sortQueue, whoDecidesAppeal } from '../../domain/moderation'
import { canInCommunity } from '../../domain/permissions'
import { DEFAULT_STATUS } from '../../domain/vocabulary'
import { extractTags } from '../../domain/social-text'
import { NetworkError, type Page, type RoverSummary } from '../../types'
import type { SocialClient, RelayFeature } from '../social-client'
import type {
  FriendItem, Update, BannedItem, Community, CommunityCardData, MinimalCommunity, SentInvite, ReceivedInvite, Testimonial, Delivery, ModerationQueue, RelayInfo,
  TimelineItem, Window, TopicList, MemberItem, Notification, PageCardData, RoverPage, ProjectPage, JoinRequest, FriendRequests, SocialRoverProfile,
  Newcomer, Note, ModerationLog, RelationItem, ForumReply, SocialSearchResult, SearchedRover, Trend, SearchType, Topic, TopicCardData, TopicVersion, EditHistory,
  Announcement, RelayHome, SearchOrder, ListedOrder, ReplyOrder, TopicOrder, Vocabulary, YouInCommunity, TestimonialSent, Removed, PageTheme, BadgeType, ModerationReason,
} from '../types'
import { Base, iso, paginate, withoutAccent } from './base'
import { DAY, HOUR, type UpdateS, type CommunityS, type PageS, type ReplyS, type RoverS, type TopicS } from './internal'

/** The 13 features of revision 0.3.1 (15.1) and the 4 of 0.3.2 (16.1) of docs/API-SOCIAL-NETWORK.md: the demonstration client pretends the relay has all of them. */
export const DEMO_FEATURES: readonly RelayFeature[] = [
  'voce-datas', 'avisos-com-nomes', 'depoimentos-enviados', 'removidos', 'fila-com-topico', 'denuncia-dispensar', 'reacoes-do-topico',
  'topicos-sem-categoria', 'respostas-recentes', 'lista-completa', 'temas-de-paginas', 'pessoas-em-alta', 'postagem-detalhe',
  'inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios',
  // 0.4.0: the demonstration pretends the operator turned on private messages
  'mensagens',
]
const windowMs = (j?: Window) => (j === '7d' ? 7 * DAY : DAY)
const countReactions = (m: Map<string, 'curtir' | 'util'>) => {
  const r = { curtir: 0, util: 0 }
  for (const v of m.values()) r[v]++
  return r
}
const excerpt = (t: string, n = 140) => (Array.from(t).length > n ? `${Array.from(t).slice(0, n - 1).join('')}…` : t)

export class Read extends Base implements SocialClient {
  // ---- view builders --------------------------------------------------------------------------

  protected socialProfile(r: RoverS): SocialRoverProfile {
    const old = this.hooks.oldProfile(r.uid)
    const p: SocialRoverProfile = {
      uid: r.uid, handle: r.handle, nome: r.nome, rosto: r.rosto,
      apresentacao: r.apresentacao, sabeFazer: [...r.habilidades],
      seguindo: old?.seguindo ?? r.baseFollowing, seguidores: old?.seguidores ?? r.baseFollowers,
      desde: iso(r.desde), idioma: r.idioma, sintetico: true,
      sobre: r.sobre, interesses: [...r.interesses], recados: r.recados, listado: r.listado, estado: r.estado ? { ...r.estado } : null,
    }
    if (old?.euSigo !== undefined && r.uid !== this.eu) p.euSigo = old.euSigo
    if (r.retratoImagem) p.retratoImagem = { ...r.retratoImagem }
    return p
  }

  /** The profile in the phase 1 shape (so the old screens and routes find the new rovers). */
  basicProfile(ref: string): import('../../types').RoverProfile | undefined {
    try {
      const { sobre: about, interesses: interests, recados: notes, listado: listed, estado: state, ...p } = this.socialProfile(this.roverByRef(ref))
      void about
      void interests
      void notes
      void listed
      void state
      return p
    } catch {
      return undefined
    }
  }

  protected communityCard(c: CommunityS): CommunityCardData {
    return {
      id: c.id, nome: c.nome, descricao: c.descricao, tema: c.tema, acesso: c.acesso, membros: c.membros.size + c.extraMembers,
      topicos: [...this.dbTopics.values()].filter((t) => t.comunidade === c.id && !t.removido && !t.apagado).length,
      criadaEm: iso(c.criadaEm), atividadeEm: iso(this.communityActivity(c)), categorias: [...c.categorias],
    }
  }
  protected youInCommunity(c: CommunityS): YouInCommunity {
    const ban = c.banidos.find((b) => b.uid === this.eu)
    const mem = c.membros.get(this.eu)
    return {
      papel: this.papel(c, this.eu), pedidoPendente: c.pedidos.some((p) => p.uid === this.eu), convidado: c.convites.some((p) => p.uid === this.eu), banido: this.banido(c, this.eu),
      banidoEm: ban ? iso(ban.em) : null, membroDesde: mem ? iso(mem.desde) : null,
    }
  }
  protected topicCard(t: TopicS): TopicCardData {
    const c = this.dbCommunities.get(t.comunidade)
    return {
      id: t.id, comunidade: t.comunidade, comunidadeNome: c?.nome, categoria: t.categoria, titulo: t.titulo, trecho: excerpt(t.texto), autor: this.resumo(t.autor),
      criadoEm: iso(t.em), atividadeEm: iso(this.topicActivity(t)), respostas: this.liveReplies(t.id).length, fixado: t.fixado, trancado: t.trancado,
      resolvido: !!t.resolvidoPor, tags: [...t.tags], enquete: !!t.enquete, editado: t.versoes.length > 1,
      // only when the topic has a label, as on the relay
      ...(t.marcas && (t.marcas.etiquetas.length > 0 || t.marcas.status !== null) ? { marcas: { etiquetas: [...t.marcas.etiquetas], status: t.marcas.status } } : {}),
    }
  }
  /** The vocabulary the relay returns: the one defined by moderation, or no label and the default status (`padrao: true`). */
  protected vocabularyOf(c: CommunityS): Vocabulary {
    const v = c.vocabulario
    const has = !!v && v.status.length > 0
    return { etiquetas: (v?.etiquetas ?? []).map((e) => ({ ...e })), status: (has ? v!.status : DEFAULT_STATUS).map((s) => ({ ...s, categorias: s.categorias ? [...s.categorias] : null })), padrao: !has }
  }
  /**
   * Points of the by PEOPLE order (0.3.2): 3 per distinct person who replied, 1 per distinct person who reacted. The author does not score for
   * themself, only a rover that exists and has an account of at least one day counts. Someone who replies 25 times or reacts 500 times counts 1. `desde` limits it to
   * what came in the window (the fake client does not store the time of each reaction: it counts if the item had life in the window).
   */
  protected pointsByPeople(author: string, replies: { autor: string; em: number }[], reactors: Iterable<string>, aliveAt: number, since: number | null): number {
    const applies = (u: string) => u !== author && this.rovers.has(u) && this.accountAgeDays(u) >= 1
    const whoReplied = new Set(replies.filter((r) => (since === null || r.em >= since) && applies(r.autor)).map((r) => r.autor))
    const whoReacted = since === null || aliveAt >= since ? new Set([...reactors].filter(applies)) : new Set<string>()
    return whoReplied.size * 3 + whoReacted.size
  }
  protected topicPoints(t: TopicS, since: number | null): number {
    return this.pointsByPeople(t.autor, this.liveReplies(t.id), t.reactors.keys(), this.topicActivity(t), since)
  }
  protected replyPoints(r: ReplyS, since: number | null): number {
    const children = this.liveReplies(r.topico).filter((f) => f.parentId === r.id)
    return this.pointsByPeople(r.autor, children, r.reactors.keys(), Math.max(r.em, ...children.map((f) => f.em)), since)
  }
  protected pageCard(p: PageS): PageCardData {
    const ult = [...this.dbUpdates.values()].filter((a) => a.pagina === p.id && !a.removida && !a.apagada).map((a) => a.em)
    return {
      id: p.id, nome: p.nome, descricao: p.descricao, tema: p.tema, dono: this.resumo(p.dono),
      seguidores: this.publicFollowers(p).length + p.extraFollowers, criadaEm: iso(p.criadaEm), atividadeEm: iso(Math.max(p.criadaEm, ...ult)),
    }
  }
  protected viewUpdate(a: UpdateS): Update {
    const p = this.dbPages.get(a.pagina)
    const r = { curtir: 0, util: 0 }
    for (const v of a.reactors.values()) r[v]++
    return { id: a.id, pagina: a.pagina, pageName: p?.nome, autor: this.resumo(a.autor), titulo: a.titulo, texto: a.texto, tags: [...a.tags], criadaEm: iso(a.em), reacoes: r, minhaReacao: a.reactors.get(this.eu) ?? null }
  }
  protected listed(): CommunityS[] {
    return [...this.dbCommunities.values()].filter((c) => !c.encerrada && c.acesso !== 'fechada')
  }
  protected requireOwn(uid: string): void {
    if (uid !== this.eu) throw new NetworkError('sem-permissao', 'só o próprio rover lê isto')
  }
  /** Does the rover's graph let the reader see lists (following, friends, communities, pages)? */
  protected requireGraph(r: RoverS): void {
    if (r.uid !== this.eu && r.grafo !== 'publico') throw new NetworkError('grafo-privado', 'o grafo desse rover não é público')
  }
  /** Does a content exist and can the reader read it now? (for the notification that points to it) */
  protected readableObject(id: string): boolean {
    const t = this.dbTopics.get(id)
    if (t) return !t.apagado && !t.removido && this.canReadTopic(t)
    const r = this.dbReplies.get(id)
    if (r) {
      const tp = this.dbTopics.get(r.topico)
      return !r.apagada && !r.removida && !!tp && !tp.apagado && !tp.removido && this.canReadTopic(tp)
    }
    const c = this.dbCommunities.get(id)
    if (c) return !c.encerrada && this.canRead(c, this.eu)
    const p = this.dbPages.get(id)
    if (p) return !p.encerrada
    const a = this.dbUpdates.get(id)
    if (a) return !a.removida && !a.apagada
    const rc = this.dbNotes.find((x) => x.id === id)
    if (rc) return !rc.apagado && !rc.removido
    const d = this.dbTestimonials.find((x) => x.id === id)
    if (d) return !d.apagado && visibleTo({ estado: d.estado, alvo: d.alvo, autor: { uid: d.autor } }, this.eu)
    return true
  }
  protected canReadTopic(t: TopicS): boolean {
    const c = this.dbCommunities.get(t.comunidade)
    return !!c && !c.encerrada && this.canRead(c, this.eu)
  }

  // ---- info -------------------------------------------------------------------------------------------------

  /** The demonstration declares ALL the 0.3.1 features, so the new screens appear. */
  async info(): Promise<RelayInfo> {
    return { protocolo: ['0.1', '0.2', '0.3'], social: true, recursos: [...DEMO_FEATURES] }
  }
  async suporta(resource: RelayFeature): Promise<boolean> {
    return (DEMO_FEATURES as readonly string[]).includes(resource)
  }

  // ---- rover page ---------------------------------------------------------------------------------------

  async paginaDoRover(ref: string): Promise<RoverPage> {
    const r = this.roverByRef(ref)
    const me = this.eu
    const own = r.uid === me
    const badges = this.countBadges(r.uid)
    const visibleFriends = this.friendsOf(r.uid).filter((u) => own || this.publicGraph(u))
    const hidesCounts = !own && r.grafo === 'privado'
    const communitiesOf = [...this.dbCommunities.values()].filter((c) => !c.encerrada && c.membros.has(r.uid) && (own || c.acesso !== 'fechada'))
    const pagesOf = [...this.dbPages.values()].filter((p) => !p.encerrada && (p.dono === r.uid || p.admins.includes(r.uid) || p.seguidores.has(r.uid)))
    return {
      rover: this.socialProfile(r),
      selos: badges,
      contagens: {
        amigos: hidesCounts ? null : visibleFriends.length,
        comunidades: hidesCounts ? null : communitiesOf.length,
        paginas: hidesCounts ? null : pagesOf.length,
        recados: this.visibleNotes(r.uid).length,
        depoimentos: this.testimonialsOf(r.uid, 'aceito').length,
        entregas: this.dbDeliveries.filter((e) => e.autor === r.uid && !e.apagado).length,
        seguidores: hidesCounts ? null : this.socialProfile(r).seguidores,
        seguindo: hidesCounts ? null : this.socialProfile(r).seguindo,
      },
      voce: {
        amigoDesde: !own && this.isFriend(me, r.uid) ? iso(this.amizade(me, r.uid)!.desde) : null,
        contaDesde: iso(this.rover(me).desde),
        selosQueDei: (['confiavel', 'caprichoso', 'rapido', 'divertido'] as BadgeType[]).filter((k) => this.dbBadges.some((x) => x.donor === me && x.alvo === r.uid && x.selo === k && !x.apagado)),
        amigo: !own && this.isFriend(me, r.uid),
        pedidoEnviado: this.pedidos.some((p) => p.de === me && p.para === r.uid),
        pedidoRecebido: this.pedidos.some((p) => p.de === r.uid && p.para === me),
        euBloqueei: this.hasBlocked(me, r.uid),
        euSilenciei: this.muted(me, r.uid),
        papel: own ? 'proprio' : null,
      },
    }
  }

  /** Badges: count of DISTINCT donors who are still friends of the owner (and not blocked). */
  protected countBadges(uid: string) {
    const c = { confiavel: 0, caprichoso: 0, rapido: 0, divertido: 0 }
    const seen = new Set<string>()
    for (const s of this.dbBadges) {
      if (s.alvo !== uid || s.apagado || !this.isFriend(s.donor, uid) || this.bloqueio(s.donor, uid)) continue
      const k = `${s.donor}|${s.selo}`
      if (seen.has(k)) continue
      seen.add(k)
      c[s.selo]++
    }
    return c
  }

  protected visibleNotes(uid: string) {
    return this.dbNotes.filter((x) => x.alvo === uid && !x.apagado && !x.removido && this.rovers.has(x.autor) && !this.hasBlocked(uid, x.autor)).sort((a, b) => b.em - a.em)
  }
  protected testimonialsOf(uid: string, state: 'aceito' | 'pendente') {
    return this.dbTestimonials
      .filter((d) => d.alvo === uid && !d.apagado && d.estado === state && !this.hasBlocked(uid, d.autor))
      .sort((a, b) => (b.aceitoEm ?? b.em) - (a.aceitoEm ?? a.em))
  }

  async recados(uid: string, cursor?: string): Promise<Page<Note>> {
    const r = this.rover(uid)
    const items = this.visibleNotes(r.uid).map<Note>((x) => ({ id: x.id, autor: this.resumo(x.autor), alvo: x.alvo, texto: x.texto, criadoEm: iso(x.em) }))
    return paginate(items, cursor)
  }

  async depoimentos(uid: string, options: { estado?: 'aceitos' | 'pendentes'; cursor?: string } = {}): Promise<Page<Testimonial>> {
    const r = this.rover(uid)
    const pending = options.estado === 'pendentes'
    if (pending) this.requireOwn(uid)
    const list = this.testimonialsOf(r.uid, pending ? 'pendente' : 'aceito')
    const items = list.map<Testimonial>((d) => ({
      id: d.id, autor: this.resumo(d.autor), alvo: d.alvo, texto: d.texto, estado: d.estado, criadoEm: iso(d.em), aceitoEm: d.aceitoEm ? iso(d.aceitoEm) : undefined,
    }))
    return paginate(items, options.cursor)
  }

  /** The testimonials the rover itself wrote that still wait for the page owner's decision. Only its own. */
  async depoimentosEnviados(uid: string, cursor?: string): Promise<Page<TestimonialSent>> {
    const r = this.rover(uid)
    this.requireOwn(uid)
    const items = this.dbTestimonials
      .filter((d) => d.autor === r.uid && !d.apagado && d.estado === 'pendente' && this.rovers.has(d.alvo))
      .sort((a, b) => b.em - a.em)
      .map<TestimonialSent>((d) => ({ id: d.id, alvo: this.resumo(d.alvo), texto: d.texto, criadoEm: iso(d.em), estado: 'pendente' }))
    return paginate(items, cursor)
  }

  /** What moderation hid from the rover itself (the excerpt comes from the retained content, while the relay retains it). Only its own. */
  async removidos(uid: string, cursor?: string): Promise<Page<Removed>> {
    const r = this.rover(uid)
    this.requireOwn(uid)
    const items = this.registro
      .filter((x) => x.acao === 'remocao' && this.held.get(x.alvo)?.autor === r.uid)
      .sort((a, b) => b.em - a.em)
      .map<Removed>((x) => ({
        id: x.id, em: iso(x.em), escopo: x.escopo, contexto: x.contexto, alvoTipo: x.alvoTipo, alvo: x.alvo, motivo: x.motivo as ModerationReason, por: x.por,
        apelacao: x.appealId ? (this.apelacoes.find((a) => a.id === x.appealId)?.situacao ?? null) : null, trecho: this.held.get(x.alvo)?.texto ?? null,
      }))
    return paginate(items, cursor)
  }

  async entregas(uid: string, cursor?: string): Promise<Page<Delivery>> {
    const r = this.rover(uid)
    const items = this.dbDeliveries
      .filter((e) => e.autor === r.uid && !e.apagado)
      .sort((a, b) => b.em - a.em)
      .map<Delivery>((e) => ({ id: e.id, autor: this.resumo(e.autor), titulo: e.titulo, descricao: e.descricao, resultado: e.resultado, tags: [...e.tags], criadaEm: iso(e.em) }))
    return paginate(items, cursor)
  }

  async amigos(uid: string, cursor?: string): Promise<Page<FriendItem>> {
    const r = this.rover(uid)
    this.requireGraph(r)
    // the edge belongs to both: whoever closed the graph does not appear in anyone's list (only in their own)
    const items = this.amizades
      .filter((a) => a.a === r.uid || a.b === r.uid)
      .map((a) => ({ outro: a.a === r.uid ? a.b : a.a, desde: a.desde }))
      .filter((x) => this.rovers.has(x.outro) && (r.uid === this.eu || this.publicGraph(x.outro)))
      .sort((a, b) => b.desde - a.desde)
      .map<FriendItem>((x) => ({ rover: this.resumo(x.outro), desde: iso(x.desde) }))
    return paginate(items, cursor)
  }

  async amigosEmComum(uid: string, using: string, cursor?: string): Promise<Page<RoverSummary>> {
    if (!using || using === uid) throw new NetworkError('invalido', 'esquema')
    const a = this.rover(uid)
    const b = this.rover(using)
    for (const x of [a, b]) if (x.uid !== this.eu && x.grafo !== 'publico') throw new NetworkError('grafo-privado', 'o grafo desse rover não é público')
    const ofB = new Set(this.friendsOf(b.uid))
    const items = this.friendsOf(a.uid)
      .filter((u) => ofB.has(u) && this.publicGraph(u))
      .map((u) => this.resumo(u))
    return paginate(items, cursor)
  }

  async comunidadesDoRover(uid: string, cursor?: string) {
    const r = this.rover(uid)
    this.requireGraph(r)
    const own = r.uid === this.eu
    const items = [...this.dbCommunities.values()]
      .filter((c) => !c.encerrada && c.membros.has(r.uid) && (own || c.acesso !== 'fechada'))
      .sort((a, b) => b.membros.get(r.uid)!.desde - a.membros.get(r.uid)!.desde)
      .map((c) => ({ comunidade: this.communityCard(c), papel: c.membros.get(r.uid)!.papel }))
    return paginate(items, cursor)
  }

  async paginasDoRover(uid: string, cursor?: string) {
    const r = this.rover(uid)
    this.requireGraph(r)
    const items = [...this.dbPages.values()]
      .filter((p) => !p.encerrada && (p.dono === r.uid || p.admins.includes(r.uid) || p.seguidores.has(r.uid)))
      .map((p) => ({ pagina: this.pageCard(p), relacao: (p.dono === r.uid ? 'dono' : p.admins.includes(r.uid) ? 'administrador' : 'seguidor') as 'dono' | 'administrador' | 'seguidor' }))
    return paginate(items, cursor)
  }

  async amizadesPendentes(uid: string): Promise<FriendRequests> {
    this.requireOwn(uid)
    return {
      recebidos: this.pedidos.filter((p) => p.para === uid).sort((a, b) => b.em - a.em).slice(0, 100).map((p) => ({ rover: this.resumo(p.de), em: iso(p.em) })),
      enviados: this.pedidos.filter((p) => p.de === uid).sort((a, b) => b.em - a.em).slice(0, 50).map((p) => ({ rover: this.resumo(p.para), em: iso(p.em) })),
    }
  }

  async convites(uid: string): Promise<ReceivedInvite[]> {
    this.requireOwn(uid)
    const items: ReceivedInvite[] = []
    for (const c of this.dbCommunities.values()) {
      if (c.encerrada) continue
      for (const cv of c.convites) if (cv.uid === uid) items.push({ comunidade: { id: c.id, nome: c.nome, descricao: c.descricao, acesso: c.acesso }, por: this.resumo(cv.por), em: iso(cv.em) })
    }
    return items.sort((a, b) => (a.em < b.em ? 1 : -1)).slice(0, 50)
  }

  async relacoes(uid: string, cursor?: string): Promise<Page<RelationItem>> {
    this.requireOwn(uid)
    const items: RelationItem[] = []
    for (const [k, v] of this.dbRelations) {
      const [from, target] = k.split('>')
      if (from === uid && this.rovers.has(target)) items.push({ rover: this.resumo(target), relacao: v.relacao, desde: iso(v.desde) })
    }
    return paginate(items.sort((a, b) => (a.desde < b.desde ? 1 : -1)), cursor)
  }

  async notificacoes(uid: string, cursor?: string): Promise<Page<Notification>> {
    this.requireOwn(uid)
    const items = this.dbNotifications
      .filter((n) => n.destino === uid && this.clock().getTime() - n.em < 90 * DAY)
      .sort((a, b) => b.seq - a.seq)
      .map<Notification>((n) => {
        const readable = n.objeto ? this.readableObject(n.objeto) : false
        const c = n.comunidade ? this.dbCommunities.get(n.comunidade) : undefined
        const pg = n.pagina ? this.dbPages.get(n.pagina) : undefined
        const t = n.objeto ? (this.dbTopics.get(n.objeto) ?? (this.dbReplies.get(n.objeto) ? this.dbTopics.get(this.dbReplies.get(n.objeto)!.topico) : undefined)) : undefined
        const readablePlace = c ? this.canRead(c, uid) || c.convites.some((x) => x.uid === uid) : true
        return {
          seq: n.seq, tipo: n.tipo, em: iso(n.em), origem: n.tipo === 'selo-recebido' || !n.origem ? null : this.resumo(n.origem),
          objeto: readable ? n.objeto : null, comunidade: readablePlace ? n.comunidade : null, pagina: n.pagina,
          nomeDoLugar: readablePlace ? (c?.nome ?? pg?.nome ?? null) : null,
          nomeDoTopico: readable && t ? t.titulo : null,
        }
      })
    return paginate(items, cursor)
  }

  async contagemDeNotificacoes(uid: string, since = 0): Promise<number> {
    this.requireOwn(uid)
    return this.dbNotifications.filter((n) => n.destino === uid && n.seq > since).length
  }

  // ---- comunidades --------------------------------------------------------------------------------------------

  async comunidades(options: { tema?: string; acesso?: 'aberta' | 'moderada'; ordem?: ListedOrder; cursor?: string } = {}): Promise<Page<CommunityCardData>> {
    let l = this.listed()
    if (options.tema) l = l.filter((c) => c.tema === options.tema)
    if (options.acesso) l = l.filter((c) => c.acesso === options.acesso)
    const cards = l.map((c) => this.communityCard(c))
    cards.sort(options.ordem === 'ativas' ? (a, b) => (a.atividadeEm < b.atividadeEm ? 1 : -1) : (a, b) => (a.criadaEm < b.criadaEm ? 1 : -1))
    return paginate(cards, options.cursor)
  }

  async comunidade(id: string): Promise<Community | MinimalCommunity> {
    const c = this.comunidade_(id)
    const you = this.youInCommunity(c)
    if (c.acesso === 'fechada' && !this.canRead(c, this.eu)) {
      // the invitee reads only the minimal card; for everyone else, a closed one does not exist
      if (you.convidado && !you.banido) return { id: c.id, nome: c.nome, descricao: c.descricao, acesso: c.acesso, voce: you }
      throw new NetworkError('nao-encontrado', 'comunidade não encontrada')
    }
    return {
      ...this.communityCard(c), regras: c.regras, dono: this.resumo(c.dono),
      moderadores: [...c.membros.values()].filter((m) => m.papel === 'moderador').length, voce: you, vocabulario: this.vocabularyOf(c),
    }
  }
  /** Existing community (the public `comunidade()` is the route; this is the free internal name). */
  protected comunidade_(id: string): CommunityS {
    const c = this.dbCommunities.get(id)
    if (!c || c.encerrada) throw new NetworkError('nao-encontrado', 'comunidade não encontrada')
    return c
  }
  protected readable(id: string): CommunityS {
    const c = this.comunidade_(id)
    if (!this.canRead(c, this.eu)) throw new NetworkError('nao-encontrado', 'comunidade não encontrada')
    return c
  }
  protected requireTeam(c: CommunityS): void {
    if (!canInCommunity('ver-moderacao', this.quem(c, this.eu), c.acesso).ok) throw new NetworkError('sem-permissao', 'só a moderação lê isto')
  }

  async membros(id: string, cursor?: string): Promise<Page<MemberItem>> {
    const c = this.readable(id)
    const team = this.isTeam(c, this.eu)
    const order = { dono: 0, moderador: 1, membro: 2 } as const
    const items = [...c.membros.entries()]
      .filter(([u]) => this.rovers.has(u) && (team || u === this.eu || this.publicGraph(u)))
      .sort((a, b) => order[a[1].papel] - order[b[1].papel] || a[1].desde - b[1].desde)
      .map<MemberItem>(([u, m]) => ({ rover: this.resumo(u), papel: m.papel, desde: iso(m.desde) }))
    return paginate(items, cursor)
  }

  async pedidosDeEntrada(id: string): Promise<Page<JoinRequest>> {
    const c = this.readable(id)
    this.requireTeam(c)
    return paginate(c.pedidos.map((p) => ({ rover: this.resumo(p.uid), em: iso(p.em) })))
  }
  async convitesDaComunidade(id: string): Promise<Page<SentInvite>> {
    const c = this.readable(id)
    this.requireTeam(c)
    return paginate(c.convites.map((p) => ({ rover: this.resumo(p.uid), por: this.resumo(p.por), em: iso(p.em) })))
  }
  async banidos(id: string): Promise<Page<BannedItem>> {
    const c = this.readable(id)
    this.requireTeam(c)
    const items = c.banidos.map<BannedItem>((b) => ({
      rover: this.resumo(b.uid), motivo: b.motivo, por: b.por, em: iso(b.em),
      apelacao: b.apelacao ? (this.apelacoes.find((a) => a.id === b.apelacao)?.situacao ?? null) : null,
    }))
    return paginate(items)
  }

  async topicos(id: string, options: { categoria?: string; tag?: string; ordem?: TopicOrder; cursor?: string; janela?: Window; status?: string; etiqueta?: string } = {}): Promise<TopicList> {
    const c = this.readable(id)
    let l = [...this.dbTopics.values()].filter((t) => t.comunidade === c.id && !t.removido && !t.apagado)
    if (options.categoria) l = l.filter((t) => t.categoria === options.categoria)
    if (options.tag) l = l.filter((t) => t.tags.includes(options.tag!))
    if (options.status) l = l.filter((t) => t.marcas?.status === options.status)
    if (options.etiqueta) l = l.filter((t) => t.marcas?.etiquetas.includes(options.etiqueta!))
    const pinned = l.filter((t) => t.fixado)
    let rest = l.filter((t) => !t.fixado)
    if (options.ordem === 'sem-resposta') rest = rest.filter((t) => this.liveReplies(t.id).length === 0)
    if (options.ordem === 'melhores' || options.ordem === 'em-alta') {
      const since = options.ordem === 'em-alta' ? this.now() - windowMs(options.janela) : null
      const points = new Map(rest.map((t) => [t.id, this.topicPoints(t, since)]))
      rest.sort((a, b) => points.get(b.id)! - points.get(a.id)! || this.topicActivity(b) - this.topicActivity(a))
    } else {
      rest.sort(options.ordem === 'ativos' ? (a, b) => this.topicActivity(b) - this.topicActivity(a) : (a, b) => b.em - a.em)
    }
    const page = paginate(rest.map((t) => this.topicCard(t)), options.cursor)
    return options.cursor === undefined ? { ...page, fixados: pinned.sort((a, b) => b.em - a.em).map((t) => this.topicCard(t)) } : page
  }

  async filaDeModeracao(id: string): Promise<ModerationQueue> {
    const c = this.readable(id)
    this.requireTeam(c)
    const targets = new Map<string, QueuedReportS>()
    for (const d of this.denuncias) {
      if (d.dismissedAt !== undefined) continue
      const t = this.dbTopics.get(d.alvo)
      const r = this.dbReplies.get(d.alvo)
      const topicId = t ? t.id : r?.topico
      const tp = topicId ? this.dbTopics.get(topicId) : undefined
      if (!tp || tp.comunidade !== c.id || t?.removido || r?.removida || t?.apagado || r?.apagada) continue
      const x = targets.get(d.alvo) ?? { alvo: d.alvo, alvoTipo: t ? 'topico' : 'resposta-forum', motivos: {}, total: 0, primeiraEm: d.em, ultimaEm: d.em, quem: new Set<string>(), tp, autor: t ? t.autor : r!.autor, texto: t ? t.titulo : r!.texto }
      x.motivos[d.motivo] = (x.motivos[d.motivo] ?? 0) + 1
      x.total++
      x.primeiraEm = Math.min(x.primeiraEm, d.em)
      x.ultimaEm = Math.max(x.ultimaEm, d.em)
      if (d.weighs) x.quem.add(d.quem)
      targets.set(d.alvo, x)
    }
    const reports = sortQueue(
      [...targets.values()].map((x) => ({
        alvo: x.alvo, alvoTipo: x.alvoTipo, motivos: x.motivos, total: x.total, primeiraEm: iso(x.primeiraEm), ultimaEm: iso(x.ultimaEm), peso: x.quem.size, topico: x.tp.id,
        previa: { autor: this.resumo(x.autor), trecho: excerpt(x.texto, 160), topico: x.tp.titulo },
      })),
    ).slice(0, 50)
    const owner = this.papel(c, this.eu) === 'dono'
    const appeals = owner
      ? this.apelacoes
          .filter((a) => a.comunidade === c.id && a.situacao === 'aberta' && whoDecidesAppeal(a.agiuPor) === 'dono')
          .map((a) => ({ id: a.id, tipo: a.tipo, alvo: a.alvo, autor: this.resumo(a.autor), texto: a.texto, em: iso(a.em), conteudo: a.tipo === 'remocao' ? (this.held.get(a.alvo)?.texto ?? null) : null }))
      : []
    return { denuncias: reports, apelacoes: appeals }
  }

  protected viewRecord(r: import('./internal').RecordS): ModerationLog {
    return {
      id: r.id, em: iso(r.em), escopo: r.escopo, contexto: r.contexto, acao: r.acao, alvoTipo: r.alvoTipo,
      alvo: r.acao === 'remocao' || r.acao === 'dispensa' ? r.alvo : this.resumo(r.alvo), motivo: r.motivo, por: r.por,
      apelacao: r.appealId ? (this.apelacoes.find((a) => a.id === r.appealId)?.situacao ?? null) : null,
    }
  }
  async registroDaComunidade(id: string, cursor?: string): Promise<Page<ModerationLog>> {
    const c = this.readable(id)
    const items = this.registro.filter((r) => r.escopo === 'comunidade' && r.contexto === c.id).sort((a, b) => b.em - a.em).map((r) => this.viewRecord(r))
    return paginate(items, cursor)
  }
  async registroDoRele(cursor?: string): Promise<Page<ModerationLog>> {
    return paginate(this.registro.filter((r) => r.escopo === 'rele').sort((a, b) => b.em - a.em).map((r) => this.viewRecord(r)), cursor)
  }

  // ---- 0.3.2: relay announcements and home panel -----------------------------------------------------------------

  async anuncios(cursor?: string): Promise<Page<Announcement>> {
    const items = [...this.dbAnnouncements]
      .sort((a, b) => Number(b.fixado) - Number(a.fixado) || b.em - a.em)
      .map<Announcement>((a) => ({ id: a.id, titulo: a.titulo, texto: a.texto, criadoEm: iso(a.em), fixado: a.fixado }))
    return paginate(items, cursor)
  }

  /** Only ids, counts and stamps of the reader (Lumi). It does not count what the reader themself did nor that of whoever they blocked or muted. */
  async inicio(since = 0): Promise<RelayHome | null> {
    const segment = (ms: number) => Math.floor(ms / 1000)
    const me = this.eu
    const quiet = (u: string | null) => u !== null && (this.hasBlocked(me, u) || this.muted(me, u))
    const byType: Record<string, number> = {}
    let total = 0
    for (const n of this.dbNotifications) {
      if (n.destino !== me || segment(n.em) <= since || quiet(n.origem)) continue
      byType[n.tipo] = (byType[n.tipo] ?? 0) + 1
      total++
    }
    const activity: RelayHome['atividade'] = []
    for (const t of this.dbTopics.values()) {
      if (t.autor !== me || t.removido || t.apagado) continue
      const replies = new Set(this.liveReplies(t.id).filter((r) => segment(r.em) > since && r.autor !== me && !quiet(r.autor)).map((r) => r.autor)).size
      const reactions = segment(this.topicActivity(t)) > since ? [...t.reactors.keys()].filter((u) => u !== me && !quiet(u)).length : 0
      if (replies > 0 || reactions > 0) activity.push({ tipo: 'topico', id: t.id, respostas: replies, reacoes: reactions })
    }
    const mine = [...this.dbCommunities.values()].filter((c) => !c.encerrada)
    const joinRequests: RelayHome['pendencias']['pedidosDeEntrada'] = []
    const moderation: RelayHome['moderacao'] = []
    for (const c of mine) {
      const role = this.papel(c, me)
      if (role !== 'dono' && role !== 'moderador') continue
      if (c.pedidos.length > 0) joinRequests.push({ comunidade: c.id, n: c.pedidos.length })
      const queue = await this.filaDeModeracao(c.id)
      if (queue.denuncias.length > 0 || queue.apelacoes.length > 0) moderation.push({ comunidade: c.id, denuncias: queue.denuncias.length, apelacoes: queue.apelacoes.length })
    }
    const newItems = this.dbAnnouncements.filter((a) => segment(a.em) > since)
    const last = [...newItems].sort((a, b) => b.em - a.em)[0]
    const friendRequests = this.pedidos.filter((p) => p.para === me && !quiet(p.de))
    return {
      agora: segment(this.now()),
      avisos: { total, porTipo: byType },
      atividade: activity.slice(0, 20),
      pendencias: {
        amizades: { n: friendRequests.length, uids: friendRequests.slice(0, 10).map((p) => p.de) },
        depoimentos: this.dbTestimonials.filter((d) => d.alvo === me && d.estado === 'pendente' && !d.apagado && !quiet(d.autor)).length,
        convites: mine.filter((c) => c.convites.some((v) => v.uid === me)).slice(0, 10).map((c) => c.id),
        pedidosDeEntrada: joinRequests.slice(0, 20),
      },
      moderacao: moderation.slice(0, 20),
      anuncios: { novos: newItems.length, ultimo: last ? { id: last.id, em: segment(last.em) } : null },
      atestadoExpiraEm: segment(this.now() + 7 * DAY),
    }
  }

  // ---- forum ---------------------------------------------------------------------------------------------------

  async topico(id: string): Promise<Topic> {
    const t = this.topicReadable(id)
    if (t.removido) throw new NetworkError('removido', 'tópico escondido pela moderação')
    const c = this.dbCommunities.get(t.comunidade)!
    const e = t.enquete
    const solved = t.resolvidoPor
    return {
      ...this.topicCard(t), comunidadeNome: c.nome, texto: t.texto, enquete: !!e,
      resolvidoPor: solved ? { resposta: solved.resposta, por: this.resumo(solved.por), em: iso(solved.em) } : null,
      pesquisa: e
        ? {
            opcoes: e.opcoes.map((text, i) => ({ texto: text, votos: e.votos[i] })), encerraEm: iso(e.encerraEm), encerrada: this.now() >= e.encerraEm,
            total: e.votos.reduce((a, b) => a + b, 0), voce: e.voters.get(this.eu) ?? null,
          }
        : null,
      versoes: t.versoes.length,
      reacoes: countReactions(t.reactors), minhaReacao: t.reactors.get(this.eu) ?? null,
    }
  }

  async respostas(topic: string, options: { em?: string; cursor?: string; ordem?: ReplyOrder; janela?: Window } = {}): Promise<Page<ForumReply>> {
    const t = this.topicReadable(topic)
    if (t.removido) throw new NetworkError('removido', 'tópico escondido pela moderação')
    const live = this.liveReplies(t.id)
    let level = options.em ? live.filter((r) => r.parentId === options.em) : live.filter((r) => r.parentId === null)
    if (options.em && !this.dbReplies.get(options.em)) throw new NetworkError('nao-encontrado', 'resposta não encontrada')
    if (options.ordem === 'recentes') level = [...level].sort((a, b) => b.em - a.em)
    if (options.ordem === 'melhores' || options.ordem === 'em-alta') {
      const since = options.ordem === 'em-alta' ? this.now() - windowMs(options.janela) : null
      const points = new Map(level.map((r) => [r.id, this.replyPoints(r, since)]))
      level = [...level].sort((a, b) => points.get(b.id)! - points.get(a.id)! || b.em - a.em)
    }
    const items = level.map<ForumReply>((r) => {
      const quotes = r.cita ? this.dbReplies.get(r.cita) : undefined
      const reactions = { curtir: 0, util: 0 }
      for (const v of r.reactors.values()) reactions[v]++
      return {
        id: r.id, autor: this.resumo(r.autor), texto: r.texto, criadoEm: iso(r.em), em: r.parentId,
        cita: r.cita && quotes ? { id: quotes.id, autor: this.resumo(quotes.autor), trecho: quotes.removida || quotes.apagada ? null : excerpt(quotes.texto, 120) } : r.cita ? { id: r.cita, autor: this.resumo(r.autor), trecho: null } : null,
        filhas: live.filter((f) => f.parentId === r.id).length, resolveu: t.resolvidoPor?.resposta === r.id, reacoes: reactions, minhaReacao: r.reactors.get(this.eu) ?? null,
      }
    })
    return paginate(items, options.cursor)
  }

  async topicoDeObjeto(id: string): Promise<string> {
    if (this.dbTopics.has(id)) return id
    const r = this.dbReplies.get(id)
    if (!r) throw new NetworkError('nao-encontrado', 'objeto não encontrado')
    return r.topico
  }

  async historico(topic: string): Promise<TopicVersion[]> {
    const t = this.topicReadable(topic)
    if (t.removido) throw new NetworkError('removido', 'tópico escondido pela moderação')
    return t.versoes.map((v) => ({ versao: v.versao, titulo: v.titulo, texto: v.texto, tags: [...v.tags], criadoEm: iso(v.em) }))
  }

  /** 0.11.0 part 2: the demonstration does not announce `edicao`, so it has no history of edits (the screen says "not found"). */
  async edicoes(id: string): Promise<EditHistory> {
    throw new NetworkError('nao-encontrado', `sem histórico de edições para ${id.slice(0, 12)}`)
  }

  // ---- pages -----------------------------------------------------------------------------------------------------

  async paginas(options: { tema?: string; ordem?: ListedOrder; cursor?: string } = {}): Promise<Page<PageCardData>> {
    let l = [...this.dbPages.values()].filter((p) => !p.encerrada)
    if (options.tema) l = l.filter((p) => p.tema === options.tema)
    const cards = l.map((p) => this.pageCard(p))
    cards.sort(options.ordem === 'ativas' ? (a, b) => (a.atividadeEm < b.atividadeEm ? 1 : -1) : (a, b) => (a.criadaEm < b.criadaEm ? 1 : -1))
    return paginate(cards, options.cursor)
  }

  /** The themes of open pages, from most used to least (tie: alphabetical order, so the demonstration is stable). */
  async temasDePaginas(): Promise<PageTheme[]> {
    const n = new Map<string, number>()
    for (const p of this.dbPages.values()) if (!p.encerrada) n.set(p.tema, (n.get(p.tema) ?? 0) + 1)
    return [...n.entries()].map(([theme, pages]) => ({ tema: theme, paginas: pages })).sort((a, b) => b.paginas - a.paginas || a.tema.localeCompare(b.tema)).slice(0, 50)
  }

  async pagina(id: string): Promise<ProjectPage> {
    const p = this.pageOrError(id)
    const role = this.roleOnPage(p, this.eu)
    return { ...this.pageCard(p), administradores: p.admins.map((u) => this.resumo(u)), voce: { segue: p.seguidores.has(this.eu), papel: role } }
  }
  protected pageOrError(id: string): PageS {
    const p = this.dbPages.get(id)
    if (!p || p.encerrada) throw new NetworkError('nao-encontrado', 'página não encontrada')
    return p
  }

  async atualizacoes(id: string, cursor?: string): Promise<Page<Update>> {
    const p = this.pageOrError(id)
    const items = [...this.dbUpdates.values()].filter((a) => a.pagina === p.id && !a.removida && !a.apagada).sort((a, b) => b.em - a.em).map((a) => this.viewUpdate(a))
    return paginate(items, cursor)
  }

  async seguidoresDaPagina(id: string, cursor?: string): Promise<Page<RoverSummary>> {
    const p = this.pageOrError(id)
    return paginate(this.publicFollowers(p).map((u) => this.resumo(u)), cursor)
  }

  async linhaMista(cursor?: string): Promise<Page<TimelineItem>> {
    const followed = new Set([...this.dbPages.values()].filter((p) => !p.encerrada && p.seguidores.has(this.eu)).map((p) => p.id))
    const posts = this.hooks.homeTimelinePosts().map((p) => ({ em: new Date(p.criadaEm).getTime(), item: { tipo: 'postagem', postagem: p } as TimelineItem }))
    const ats = [...this.dbUpdates.values()].filter((a) => followed.has(a.pagina) && !a.removida && !a.apagada).map((a) => ({ em: a.em, item: { tipo: 'atualizacao', atualizacao: this.viewUpdate(a) } as TimelineItem }))
    const all = [...posts, ...ats].sort((a, b) => b.em - a.em).map((x) => x.item)
    return paginate(all, cursor, 8)
  }

  // ---- busca e descoberta -----------------------------------------------------------------------------------

  /** The question becomes up to 8 words of up to 30 letters; all must match, the last by prefix. */
  protected palavras(q: string): string[] {
    return withoutAccent(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 8).map((p) => p.slice(0, 30))
  }
  protected casa(tokens: string[], fields: { texto: string; peso: number }[]): number {
    const bag = fields.map((c) => ({ ps: withoutAccent(c.texto).split(/[^\p{L}\p{N}]+/u).filter(Boolean), peso: c.peso }))
    let total = 0
    for (let i = 0; i < tokens.length; i++) {
      const last = i === tokens.length - 1
      let best = 0
      for (const b of bag) if (b.ps.some((p) => (last ? p.startsWith(tokens[i]) : p === tokens[i]))) best = Math.max(best, b.peso)
      if (best === 0) return 0
      total += best
    }
    return total
  }
  protected buscaRovers(tokens: string[]): SearchedRover[] {
    return [...this.rovers.values()]
      .filter((r) => r.listado)
      .map((r) => ({ r, p: this.casa(tokens, [{ texto: r.nome, peso: 4 }, { texto: r.handle.replace(/[._]/g, ' '), peso: 4 }, { texto: r.habilidades.join(' '), peso: 2 }, { texto: `${r.interesses.join(' ')} ${r.apresentacao}`, peso: 1 }]) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || a.r.handle.localeCompare(b.r.handle))
      .map((x) => ({ ...this.resumo(x.r.uid), descricao: x.r.apresentacao }))
  }
  protected buscaComunidades(tokens: string[]): CommunityCardData[] {
    return this.listed()
      .map((c) => ({ c, p: this.casa(tokens, [{ texto: c.nome, peso: 4 }, { texto: c.tema, peso: 3 }, { texto: c.descricao, peso: 1 }]) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || b.c.criadaEm - a.c.criadaEm)
      .map((x) => this.communityCard(x.c))
  }
  protected buscaTopicos(tokens: string[]): TopicCardData[] {
    return [...this.dbTopics.values()]
      .filter((t) => !t.removido && !t.apagado && this.canReadTopic(t))
      .map((t) => ({ t, p: this.casa(tokens, [{ texto: t.titulo, peso: 4 }, { texto: t.tags.join(' '), peso: 3 }, { texto: t.texto, peso: 1 }]) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || this.topicActivity(b.t) - this.topicActivity(a.t))
      .map((x) => this.topicCard(x.t))
  }
  protected buscaPaginas(tokens: string[]): PageCardData[] {
    return [...this.dbPages.values()]
      .filter((p) => !p.encerrada)
      .map((p) => ({ p, s: this.casa(tokens, [{ texto: p.nome, peso: 4 }, { texto: p.tema, peso: 3 }, { texto: p.descricao, peso: 1 }]) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.p.criadaEm - a.p.criadaEm)
      .map((x) => this.pageCard(x.p))
  }

  async buscarTudo(q: string): Promise<SocialSearchResult> {
    const t = this.palavras(q)
    if (t.length === 0 || Array.from(q.trim()).length < 2) return { rovers: [], comunidades: [], topicos: [], paginas: [] }
    return { rovers: this.buscaRovers(t).slice(0, 5), comunidades: this.buscaComunidades(t).slice(0, 5), topicos: this.buscaTopicos(t).slice(0, 5), paginas: this.buscaPaginas(t).slice(0, 5) }
  }
  async buscarTipo(q: string, type: SearchType, cursor?: string, options: { ordem?: SearchOrder; janela?: Window } = {}): Promise<Page<any>> {
    const t = this.palavras(q)
    if (t.length === 0 || Array.from(q.trim()).length < 2) return { itens: [] }
    let l: any[] = type === 'rovers' ? this.buscaRovers(t) : type === 'comunidades' ? this.buscaComunidades(t) : type === 'topicos' ? this.buscaTopicos(t) : this.buscaPaginas(t)
    // 0.3.2: `ordem` only applies to topic search. `relevancia` is the default and keeps the text order.
    if (type === 'topicos' && options.ordem && options.ordem !== 'relevancia') {
      const cards = l as TopicCardData[]
      if (options.ordem === 'recentes') l = [...cards].sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : 0))
      else {
        const since = options.ordem === 'em-alta' ? this.now() - windowMs(options.janela) : null
        const points = new Map(cards.map((c) => [c.id, this.topicPoints(this.dbTopics.get(c.id)!, since)]))
        l = [...cards].sort((a, b) => points.get(b.id)! - points.get(a.id)! || (a.atividadeEm < b.atividadeEm ? 1 : a.atividadeEm > b.atividadeEm ? -1 : 0))
      }
    }
    return paginate(l, cursor)
  }

  async emAlta(type: 'topicos' | 'comunidades' | 'paginas', window?: Window): Promise<any[]> {
    const ini = this.now() - windowMs(window)
    const inside = (ms: number) => ms >= ini
    const applies = (u: string) => this.rovers.has(u) && this.accountAgeDays(u) >= 1
    if (type === 'topicos') {
      return [...this.dbTopics.values()]
        .filter((t) => !t.removido && !t.apagado && this.dbCommunities.get(t.comunidade)?.acesso !== 'fechada' && !this.dbCommunities.get(t.comunidade)?.encerrada)
        .map((t) => {
          const resp = new Set(this.liveReplies(t.id).filter((r) => inside(r.em) && applies(r.autor)).map((r) => r.autor))
          // the relay stores the time of each reaction; here the reaction counts if the topic had life in the window
          const react = inside(this.topicActivity(t)) ? [...t.reactors.keys()].filter(applies) : []
          // `pessoas` (0.3.1): how many DISTINCT people replied or reacted. Only the number, never who.
          return { t, pontos: resp.size * 3 + react.length, pessoas: new Set([...resp, ...react]).size }
        })
        .filter((x) => x.pontos >= 2)
        .sort((a, b) => b.pontos - a.pontos)
        .slice(0, 20)
        .map((x) => ({ ...this.topicCard(x.t), pessoas: x.pessoas }))
    }
    if (type === 'comunidades') {
      return this.listed()
        .map((c) => {
          const newUids = [...c.membros.entries()].filter(([u, m]) => inside(m.desde) && applies(u)).map(([u]) => u)
          const newItems = [...c.membros.values()].filter((m) => inside(m.desde)).length
          const authors = new Set<string>()
          for (const t of this.dbTopics.values()) {
            if (t.comunidade !== c.id || t.removido || t.apagado) continue
            if (inside(t.em) && applies(t.autor)) authors.add(t.autor)
            for (const r of this.liveReplies(t.id)) if (inside(r.em) && applies(r.autor)) authors.add(r.autor)
          }
          return { c, pontos: newItems * 2 + authors.size * 3, pessoas: new Set([...newUids, ...authors]).size }
        })
        .filter((x) => x.pontos >= 3)
        .sort((a, b) => b.pontos - a.pontos)
        .slice(0, 20)
        .map((x) => ({ ...this.communityCard(x.c), pessoas: x.pessoas }))
    }
    return [...this.dbPages.values()]
      .filter((p) => !p.encerrada)
      .map((p) => {
        const newItems = [...p.seguidores.values()].filter(inside).length
        const newUids = [...p.seguidores.entries()].filter(([u, at]) => inside(at) && applies(u)).map(([u]) => u)
        const ats = [...this.dbUpdates.values()].filter((a) => a.pagina === p.id && !a.removida && !a.apagada && inside(a.em))
        const react = ats.flatMap((a) => [...a.reactors.keys()]).filter(applies)
        return { p, pontos: newItems + ats.length * 3, pessoas: new Set([...newUids, ...react]).size }
      })
      .filter((x) => x.pontos >= 2)
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 20)
      .map((x) => ({ ...this.pageCard(x.p), pessoas: x.pessoas }))
  }

  async recemChegadosSociais(limit = 50): Promise<Newcomer[]> {
    const lim = this.now() - 7 * DAY
    return [...this.rovers.values()]
      .filter((r) => r.listado && r.desde >= lim)
      .sort((a, b) => b.desde - a.desde)
      .slice(0, Math.min(50, Math.max(1, limit)))
      .map((r) => ({ ...this.resumo(r.uid), desde: iso(r.desde) }))
  }

  async sugestoes(type: 'comunidades' | 'paginas' | 'rovers', interests?: string[]): Promise<any[]> {
    // only from what was declared: the profile interests and skills, or those that come in the call.
    const me = this.rover(this.eu)
    const mine = new Set((interests && interests.length ? interests : [...me.interesses, ...me.habilidades.map((h) => withoutAccent(h).replace(/\s+/g, '-'))]).map((i) => withoutAccent(i)))
    const common = (tags: string[]) => tags.filter((t) => mine.has(withoutAccent(t))).length
    if (type === 'comunidades') {
      return this.listed()
        .filter((c) => !c.membros.has(this.eu) && !this.banido(c, this.eu))
        .map((c) => ({ c, s: common([c.tema]) }))
        .sort((a, b) => b.s - a.s || b.c.criadaEm - a.c.criadaEm)
        .slice(0, 20)
        .map((x) => this.communityCard(x.c))
    }
    if (type === 'paginas') {
      return [...this.dbPages.values()]
        .filter((p) => !p.encerrada && !p.seguidores.has(this.eu) && p.dono !== this.eu && !p.admins.includes(this.eu))
        .map((p) => ({ p, s: common([p.tema]) }))
        .sort((a, b) => b.s - a.s || b.p.criadaEm - a.p.criadaEm)
        .slice(0, 20)
        .map((x) => this.pageCard(x.p))
    }
    return [...this.rovers.values()]
      .filter((r) => r.uid !== this.eu && r.listado && !this.isFriend(this.eu, r.uid) && !this.bloqueio(this.eu, r.uid))
      .map((r) => ({ r, s: common([...r.interesses, ...r.habilidades.map((h) => withoutAccent(h).replace(/\s+/g, '-'))]) }))
      .sort((a, b) => b.s - a.s || b.r.desde - a.r.desde)
      .slice(0, 20)
      .map((x) => ({ ...this.resumo(x.r.uid), descricao: x.r.apresentacao }))
  }

  async tendencias(window?: Window): Promise<Trend[]> {
    const ini = this.now() - windowMs(window)
    const map = new Map<string, { autores: Set<string>; usos: number }>()
    const mark = (tag: string, author: string) => {
      if (!this.rovers.has(author) || this.accountAgeDays(author) < 1) return
      const x = map.get(tag) ?? { autores: new Set<string>(), usos: 0 }
      x.autores.add(author)
      x.usos++
      map.set(tag, x)
    }
    for (const t of this.dbTopics.values()) {
      const c = this.dbCommunities.get(t.comunidade)
      if (!c || c.acesso === 'fechada' || c.encerrada || t.removido || t.apagado) continue
      if (t.em >= ini) for (const tag of new Set([...t.tags, ...extractTags(t.texto).tags])) mark(tag, t.autor)
      for (const r of this.liveReplies(t.id)) if (r.em >= ini) for (const tag of extractTags(r.texto).tags) mark(tag, r.autor)
    }
    for (const a of this.dbUpdates.values()) {
      const p = this.dbPages.get(a.pagina)
      if (!p || p.encerrada || a.removida || a.apagada || a.em < ini) continue
      for (const tag of new Set([...a.tags, ...extractTags(a.texto).tags])) mark(tag, a.autor)
    }
    return [...map.entries()]
      .filter(([, v]) => v.autores.size >= 3)
      .map(([tag, v]) => ({ tag, autores: v.autores.size, usos: v.usos }))
      .sort((a, b) => b.autores - a.autores || b.usos - a.usos || a.tag.localeCompare(b.tag))
      .slice(0, 20)
  }

  // ---- 0.4.0: private messages. The rules and data live in ./messages.ts, the layer above; here only the place in the contract. ----
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- hook: the messages layer (./messages.ts) overrides
  async conversas(_uid: string, _options?: { estado?: import('../messages').ConversationFilter; cursor?: string }): Promise<Page<import('../messages').Conversation>> {
    throw new NetworkError('versao-nao-suportada', 'este relé não tem mensagens privadas')
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- hook: the messages layer (./messages.ts) overrides
  async conversa(_uid: string, _id: string): Promise<import('../messages').Conversation> {
    throw new NetworkError('versao-nao-suportada', 'este relé não tem mensagens privadas')
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- hook: the messages layer (./messages.ts) overrides
  async mensagensDaConversa(_uid: string, _id: string, _cursor?: string): Promise<Page<import('../messages').ClearMessage>> {
    throw new NetworkError('versao-nao-suportada', 'este relé não tem mensagens privadas')
  }
}

interface QueuedReportS {
  alvo: string
  alvoTipo: string
  motivos: Partial<Record<import('../types').SocialReportReason, number>>
  total: number
  primeiraEm: number
  ultimaEm: number
  quem: Set<string>
  tp: TopicS
  autor: string
  texto: string
}
void HOUR
