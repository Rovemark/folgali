// The base of the in-memory social state: the data and the query helpers that reading and writing share.

import { demoId } from '../../domain/ids'
import { canInCommunity, type Who } from '../../domain/permissions'
import { NetworkError, type Page, type Post, type RoverSummary } from '../../types'
import type { SocialReportReason, RoleInCommunity } from '../types'
import {
  DAY, SOCIAL_SIZE, type ActiveFriendship, type DeclinedFriendship, type AnnouncementS, type AppealS, type UpdateS, type CommunityS, type HeldContent, type ReportS,
  type TestimonialS, type DeliveryS, type NotificationS, type PageS, type FriendRequest, type NoteS, type RecordS, type ReplyS, type RoverS, type BadgeS, type TopicS,
} from './internal'
import type { SocialDraft } from '../../domain/social-approval'

/** What the old client (posts, follow) lends to the social part. */
export interface Hooks {
  oldProfile(uid: string): { seguindo: number; seguidores: number; euSigo?: boolean } | undefined
  homeTimelinePosts(): Post[]
  undoFollow(a: string, b: string): void
  /** returns true if the id was an old post (and removed it, if the author's) */
  removeOldPost(id: string, author: string): boolean
  reportOld(target: string, reason: SocialReportReason): boolean
}

export const NO_HOOKS: Hooks = {
  oldProfile: () => undefined,
  homeTimelinePosts: () => [],
  undoFollow: () => undefined,
  removeOldPost: () => false,
  reportOld: () => false,
}

export const iso = (ms: number) => new Date(ms).toISOString()
const createCursor = (n: number) => btoa(String(n))
export function readCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0
  let n = NaN
  try {
    n = Number.parseInt(atob(cursor), 10)
  } catch {
    n = NaN
  }
  if (!Number.isInteger(n) || n < 0) throw new NetworkError('invalido', 'cursor inválido')
  return n
}
export function paginate<T>(items: T[], cursor?: string, length = SOCIAL_SIZE): Page<T> {
  const ini = readCursor(cursor)
  return { itens: items.slice(ini, ini + length), proximo: ini + length < items.length ? createCursor(ini + length) : undefined }
}

export const withoutAccent = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

export class Base {
  readonly rovers = new Map<string, RoverS>()
  readonly dbCommunities = new Map<string, CommunityS>()
  readonly dbTopics = new Map<string, TopicS>()
  readonly dbReplies = new Map<string, ReplyS>()
  readonly dbPages = new Map<string, PageS>()
  readonly dbUpdates = new Map<string, UpdateS>()
  /** 0.3.2: the relay operator announcements */
  readonly dbAnnouncements: AnnouncementS[] = []
  readonly dbNotes: NoteS[] = []
  readonly dbTestimonials: TestimonialS[] = []
  readonly dbBadges: BadgeS[] = []
  readonly dbDeliveries: DeliveryS[] = []
  readonly amizades: ActiveFriendship[] = []
  readonly pedidos: FriendRequest[] = []
  readonly declined: DeclinedFriendship[] = []
  /** `${de}>${alvo}` -> relation */
  readonly dbRelations = new Map<string, { relacao: 'bloqueio' | 'silencio'; desde: number }>()
  readonly dbNotifications: NotificationS[] = []
  readonly denuncias: ReportS[] = []
  readonly apelacoes: AppealS[] = []
  readonly registro: RecordS[] = []
  readonly held = new Map<string, HeldContent>()
  readonly rascunhos: SocialDraft[] = []
  /** who reported what, per day (the same person: at most 10 per day) */
  readonly reportsByWhom = new Map<string, number[]>()
  /** the latest times of each type of gesture per author (rate, only where the demonstration needs it) */
  readonly rate = new Map<string, number[]>()
  protected seq = 0
  protected contador = 0
  protected draftCounter = 0

  constructor(
    readonly clock: () => Date,
    readonly eu: string,
    protected readonly hooks: Hooks = NO_HOOKS,
  ) {}

  /** After the seed: the next notice and the next draft continue from those that already exist. */
  pinCounters(notices: number): void {
    this.seq = notices
    this.draftCounter = this.rascunhos.length
  }

  now(): number {
    return this.clock().getTime()
  }
  newId(): string {
    return demoId('ob', `z${++this.contador}`)
  }
  newDraftId(): string {
    return `rsc_soc_${String(++this.draftCounter).padStart(2, '0')}`
  }

  // ---- rovers ---------------------------------------------------------------------------------------

  rover(uid: string): RoverS {
    const r = this.rovers.get(uid)
    if (!r) throw new NetworkError('nao-encontrado', 'rover não encontrado')
    return r
  }
  roverByRef(ref: string): RoverS {
    const clean = ref.replace(/^@/, '').toLowerCase()
    for (const r of this.rovers.values()) if (r.uid === ref || r.handle === clean) return r
    throw new NetworkError('nao-encontrado', 'rover não encontrado')
  }
  resumo(uid: string): RoverSummary {
    const r = this.rover(uid)
    return { uid: r.uid, handle: r.handle, nome: r.nome, rosto: r.rosto, especie: r.especie ?? 'rover' }
  }
  accountAgeDays(uid: string): number {
    return Math.floor((this.now() - this.rover(uid).desde) / DAY)
  }
  proprio(uid: string): boolean {
    return uid === this.eu
  }

  // ---- relations ----------------------------------------------------------------------------------------

  chave = (a: string, b: string) => `${a}>${b}`
  hasBlocked(from: string, target: string): boolean {
    return this.dbRelations.get(this.chave(from, target))?.relacao === 'bloqueio'
  }
  muted(from: string, target: string): boolean {
    return this.dbRelations.get(this.chave(from, target))?.relacao === 'silencio'
  }
  /** block in ANY direction */
  bloqueio(a: string, b: string): boolean {
    return this.hasBlocked(a, b) || this.hasBlocked(b, a)
  }
  amizade(a: string, b: string): ActiveFriendship | undefined {
    return this.amizades.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
  }
  isFriend(a: string, b: string): boolean {
    return !!this.amizade(a, b)
  }
  friendsOf(uid: string): string[] {
    return this.amizades.filter((x) => x.a === uid || x.b === uid).map((x) => (x.a === uid ? x.b : x.a))
  }
  friendForDays(a: string, b: string): number {
    const am = this.amizade(a, b)
    return am ? Math.floor((this.now() - am.desde) / DAY) : 0
  }
  publicGraph(uid: string): boolean {
    return this.rover(uid).grafo === 'publico'
  }

  // ---- comunidades -------------------------------------------------------------------------------------

  com(id: string): CommunityS {
    const c = this.dbCommunities.get(id)
    if (!c || c.encerrada) throw new NetworkError('nao-encontrado', 'comunidade não encontrada')
    return c
  }
  papel(c: CommunityS, uid: string): RoleInCommunity | null {
    return c.membros.get(uid)?.papel ?? null
  }
  banido(c: CommunityS, uid: string): boolean {
    return c.banidos.some((b) => b.uid === uid)
  }
  quem(c: CommunityS, uid: string): Who {
    const m = c.membros.get(uid)
    return { papel: m?.papel ?? null, banido: this.banido(c, uid), memberFor: m ? Math.floor((this.now() - m.desde) / 1000) : undefined }
  }
  /** Can the reader read this community? (closed: only a non-banned member) */
  canRead(c: CommunityS, uid: string): boolean {
    return canInCommunity('ler', this.quem(c, uid), c.acesso).ok
  }
  isTeam(c: CommunityS, uid: string): boolean {
    const p = this.papel(c, uid)
    return (p === 'dono' || p === 'moderador') && !this.banido(c, uid)
  }
  top(id: string): TopicS {
    const t = this.dbTopics.get(id)
    if (!t || t.apagado) throw new NetworkError('nao-encontrado', 'tópico não encontrado')
    return t
  }
  /** Topic the reader can see (a closed community is invisible to whoever is outside). Throws nao-encontrado. */
  topicReadable(id: string, reader = this.eu): TopicS {
    const t = this.top(id)
    const c = this.dbCommunities.get(t.comunidade)
    if (!c || c.encerrada || !this.canRead(c, reader)) throw new NetworkError('nao-encontrado', 'tópico não encontrado')
    return t
  }
  liveReplies(topicId: string): ReplyS[] {
    return [...this.dbReplies.values()].filter((r) => r.topico === topicId && !r.removida && !r.apagada).sort((a, b) => a.em - b.em)
  }
  topicActivity(t: TopicS): number {
    const ult = this.liveReplies(t.id).at(-1)
    return Math.max(t.em, ult?.em ?? 0)
  }
  communityActivity(c: CommunityS): number {
    let m = c.criadaEm
    for (const t of this.dbTopics.values()) if (t.comunidade === c.id && !t.removido && !t.apagado) m = Math.max(m, this.topicActivity(t))
    return m
  }

  // ---- pages ------------------------------------------------------------------------------------------

  page(id: string): PageS {
    const p = this.dbPages.get(id)
    if (!p || p.encerrada) throw new NetworkError('nao-encontrado', 'página não encontrada')
    return p
  }
  roleOnPage(p: PageS, uid: string): 'dono' | 'administrador' | null {
    if (p.dono === uid) return 'dono'
    return p.admins.includes(uid) ? 'administrador' : null
  }
  /** followers who keep the graph public */
  publicFollowers(p: PageS): string[] {
    return [...p.seguidores.keys()].filter((u) => this.rovers.has(u) && this.publicGraph(u))
  }

  // ---- notifications ------------------------------------------------------------------------------------

  /** Generates the notification, WITHOUT text. It does not go to oneself, nor from a muted or blocked rover. */
  notify(destination: string, type: NotificationS['tipo'], o: { origem?: string | null; objeto?: string | null; comunidade?: string | null; pagina?: string | null } = {}): void {
    const origin = o.origem ?? null
    if (origin && (origin === destination || this.bloqueio(origin, destination) || this.muted(destination, origin))) return
    if (!this.rovers.has(destination)) return
    this.dbNotifications.push({ seq: ++this.seq, destino: destination, tipo: type, em: this.now(), origem: origin, objeto: o.objeto ?? null, comunidade: o.comunidade ?? null, pagina: o.pagina ?? null })
  }

  /** Counts recent gestures of an author, for the rate. */
  countRate(key: string, windowMs: number): number {
    const now = this.now()
    const l = (this.rate.get(key) ?? []).filter((t) => now - t < windowMs)
    this.rate.set(key, l)
    return l.length
  }
  markRate(key: string): void {
    const l = this.rate.get(key) ?? []
    l.push(this.now())
    this.rate.set(key, l)
  }
}
