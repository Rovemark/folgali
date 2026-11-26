// Sanitizing of the social part: everything the relay returns comes from strangers and passes through here before becoming a screen.
// The shape is checked (a missing field or wrong type is "out of contract"), enums are closed, ids have
// the protocol shape, numbers become integers, instants (seconds since 1970) become ISO, text loses
// the invisible and is cut at the protocol limit, lists have a cap, and the portrait (`{corpo,cor,veste,acessorio}`,
// slugs) becomes the site's plush profile. An unknown field is discarded. What the relay says in an error
// message never reaches here or the screen.

import { defaultPortrait, galleryCover, galleryPortrait } from '@/lib/folgali/gallery'
import { attachmentsOf, sanitizeImage } from '../images'
import { videoOf } from '../videos'
import { faceByUid } from '../domain/expression'
import { PERSON_BODY } from '../rover/person'
import { SPECIES, type Species } from '../types'
import { isObjectId, isUid, TOPIC_RE } from '../domain/ids'
import { filterInvisible } from '../domain/invisible'
import { cut, normalize } from '../domain/limits'
import { EDIT_TARGETS, readContent, readEdit, type EditTarget } from '../domain/edit'
import { ACCESSORIES, COLORS, BODIES } from '../rover/engine'
import { NetworkError, type OutsideAgent, type Spec, type AgentsInfo, type Page, type RoverSummary, type AgentBadge } from '../types'
import {
  ACCESS_LEVELS, ROVER_STATES, MODERATION_REASON_LIST, SOCIAL_REPORT_REASONS, ROLES, NOTE_RULES, NOTIFICATION_TYPES,
  type FriendItem, type QueuedAppeal, type Update, type BannedItem, type Community, type CommunityCardData, type MinimalCommunity, type SentInvite,
  type ReceivedInvite, type BadgeCounts, type Counts, type QueuedReport, type Testimonial, type TestimonialState, type Delivery, type ModerationQueue,
  type TopicList, type MemberItem, type Notification, type PageCardData, type RoverPage, type ProjectPage, type JoinRequest,
  type FriendRequests, type SocialRoverProfile, type Note, type Newcomer, type ModerationLog, type RelationItem, type ForumReply,
  type SocialSearchResult, type SearchedRover, type Trend, type Topic, type TopicCardData, type TopicVersion, type YouInCommunity, type YouOnProfile,
  type EditHistory, type EditedVersion,
  type Poll, type RelayInfo, type NotificationType, type TestimonialSent, type Removed, type PageTheme, type BadgeType, BADGES,
  VOCABULARY_COLORS, type Announcement, type TagDef, type RelayHome, type TopicMarks, type StatusDef, type Vocabulary,
} from './types'

const STRANGE = () => new NetworkError('indisponivel', 'resposta do relé fora do contrato')

type Obj = Record<string, unknown>
export const obj = (x: unknown): Obj => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw STRANGE()
  return x as Obj
}
export const list = (x: unknown, cap = 100): unknown[] => {
  if (!Array.isArray(x)) throw STRANGE()
  return x.slice(0, cap)
}
const opt = (x: unknown): Obj | null => (x === null || x === undefined ? null : obj(x))

const clean = (s: string) => normalize(filterInvisible(s).texto)
/** Required text: a wrong type is out of contract; the rest is cut at the limit. */
export const txt = (x: unknown, max: number, multi = false): string => {
  if (typeof x !== 'string') throw STRANGE()
  const t = clean(x)
  return cut(multi ? t : t.replace(/\s*\n\s*/g, ' '), max)
}
/** Single line text, without page markup signs (name, title, category). */
const short = (x: unknown, max: number): string => txt(x, max).replace(/[<>]/g, '')
const txtOpt = (x: unknown, max: number, multi = false): string => (x === undefined || x === null ? '' : txt(x, max, multi))
export const integer = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0)
const integerOrNull = (x: unknown): number | null => (x === null || x === undefined ? null : typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null)
const boolean = (x: unknown): boolean => x === true
const isEnum = <T extends string>(list: readonly T[], x: unknown): x is T => typeof x === 'string' && (list as readonly string[]).includes(x)
const enumerated = <T extends string>(l: readonly T[], x: unknown): T => {
  if (!isEnum(l, x)) throw STRANGE()
  return x
}

/** Protocol instant (seconds since 1970) or ISO text, between 2023 and 2100, becomes ISO 8601. */
export function instant(x: unknown): string {
  let ms: number
  if (typeof x === 'number' && Number.isFinite(x)) ms = (x > 1e11 ? x : x * 1000)
  else if (typeof x === 'string' && Number.isFinite(Date.parse(x))) ms = Date.parse(x)
  else throw STRANGE()
  if (ms < Date.UTC(2023, 0, 1) || ms >= Date.UTC(2100, 0, 1)) throw STRANGE()
  return new Date(ms).toISOString()
}
const optInstant = (x: unknown): string | undefined => (x === undefined || x === null ? undefined : instant(x))

// ---- additive fields of revision 0.3.1 ----
// They are screen decoration: relay 0.3 does not send them and a crooked value from a 0.3.1 relay cannot bring the whole page down. So the
// helpers below NEVER throw: absent becomes `undefined`, `null` stays `null` and anything crooked becomes `undefined`.
/** Optional instant: `undefined` (absent or crooked), `null` (the relay said there is none) or the ISO. */
const additiveInstant = (x: unknown): string | null | undefined => {
  if (x === undefined) return undefined
  if (x === null) return null
  try {
    return instant(x)
  } catch {
    return undefined
  }
}
/** Optional integer: `undefined` (absent or crooked), `null` (hidden graph) or the number. */
const additiveInteger = (x: unknown): number | null | undefined => {
  if (x === undefined) return undefined
  if (x === null) return null
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : undefined
}
/** `pessoas` of 'trending': only the number, from 1 to 1 million. Anything else disappears. */
const additivePeople = (x: unknown): number | undefined => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 1_000_000 ? x : undefined)
/** Badges the reader gave: closed list, no repeats. */
const additiveBadges = (x: unknown): BadgeType[] | undefined => {
  if (!Array.isArray(x)) return undefined
  // walks the CLOSED list (SELOS), so what is not a badge, crooked text and repeats are already left out and the order is always the same
  return BADGES.filter((k) => x.includes(k))
}

export const uid = (x: unknown): string => {
  if (typeof x !== 'string' || !isUid(x)) throw STRANGE()
  return x
}
export const idObj = (x: unknown): string => {
  if (typeof x !== 'string' || !isObjectId(x)) throw STRANGE()
  return x
}
const idOrNull = (x: unknown): string | null => (x === null || x === undefined ? null : idObj(x))
const handle = (x: unknown): string => {
  const h = typeof x === 'string' ? x.toLowerCase() : ''
  if (!/^[a-z0-9._]{3,30}$/.test(h)) throw STRANGE()
  return h
}

// ---- additive fields of revision 0.3.2 (vocabulary and marks) ------------------------------------------------------------
// Same rule as 0.3.1: screen decoration that cannot bring the page down. A crooked item leaves the list, a crooked list becomes "nothing". The label and color of a
// label are moderator text, so they pass through the same closed character list the relay imposes: what is left never becomes a link, markup or sentence.

const VOCABULARY_KEY_ALT = /^[a-z][a-z0-9-]{1,19}$/
const VOCABULARY_LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N} '-]{0,22}[\p{L}\p{N}])$/u
const vocabularyKey = (x: unknown): string | null => (typeof x === 'string' && VOCABULARY_KEY_ALT.test(x) ? x : null)
const vocabularyLabel = (x: unknown): string | null => {
  if (typeof x !== 'string') return null
  // the relay only accepts the label already clean (NFC, no invisible, no edge space): what the site filter would change, it discards instead of fixing
  const r = clean(x)
  return r === x && VOCABULARY_LABEL.test(r) && !r.includes('  ') ? r : null
}
const tagDef = (x: unknown): TagDef | null => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as Obj
  const key = vocabularyKey(o.chave)
  const label = vocabularyLabel(o.rotulo)
  const color = VOCABULARY_COLORS.find((c) => c === o.cor)
  return key && label && color ? { chave: key, rotulo: label, cor: color } : null
}
const statusDef = (x: unknown): StatusDef | null => {
  const base = tagDef(x)
  if (!base) return null
  const c = (x as Obj).categorias
  if (c === null) return { ...base, categorias: null }
  if (!Array.isArray(c) || c.length < 1) return null
  const cats = c.filter((k): k is string => typeof k === 'string').map((k) => short(k, 30)).filter((k) => k.length > 0).slice(0, 8)
  return cats.length > 0 ? { ...base, categorias: cats } : null
}
const withoutRepeat = <T extends { chave: string }>(l: T[], cap: number): T[] => {
  const seen = new Set<string>()
  const r: T[] = []
  for (const i of l) {
    if (seen.has(i.chave)) continue
    seen.add(i.chave)
    r.push(i)
    if (r.length === cap) break
  }
  return r
}
/** `vocabulario` of `GET /v1/comunidades/:id`: `undefined` when the relay did not send it or sent it crooked. */
export function additiveVocabulary(x: unknown): Vocabulary | undefined {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return undefined
  const o = x as Obj
  if (!Array.isArray(o.etiquetas) || !Array.isArray(o.status)) return undefined
  return {
    etiquetas: withoutRepeat(o.etiquetas.slice(0, 16).map(tagDef).filter((e): e is TagDef => e !== null), 8),
    status: withoutRepeat(o.status.slice(0, 12).map(statusDef).filter((e): e is StatusDef => e !== null), 6),
    padrao: o.padrao === true,
  }
}
/** `marcas` of a topic card: up to 3 labels and 1 status, keys only. With nothing valid, `undefined` (the topic stays without a mark). */
export function additiveMarks(x: unknown): TopicMarks | undefined {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return undefined
  const o = x as Obj
  const labels = Array.isArray(o.etiquetas) ? [...new Set(o.etiquetas.map(vocabularyKey).filter((k): k is string => k !== null))].slice(0, 3) : []
  const status = vocabularyKey(o.status)
  return labels.length > 0 || status !== null ? { etiquetas: labels, status } : undefined
}

const tag = (x: unknown): string | null => (typeof x === 'string' && TOPIC_RE.test(x) ? x : null)
const tags = (x: unknown, cap: number): string[] => (Array.isArray(x) ? x.map(tag).filter((t): t is string => t !== null).slice(0, cap) : [])
const withoutAccent = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

// ---- retrato e rover -------------------------------------------------------------------------------------------

const COLORS_BY_SLUG: Record<string, string> = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [withoutAccent(k), v]))
const accessorySlugs = (x: unknown): string[] => (typeof x === 'string' && x in ACCESSORIES ? [x] : [])

/** The protocol portrait (slugs) becomes the plush profile. Unknown piece = default piece; no portrait = stable face by uid. */
export function portraitSpec(portrait: unknown, id: string): Spec {
  // 0.9.0: no portrait, or a photo we do not show here (`{ midia }`), is a house plush from the gallery, never just a letter
  if (typeof portrait !== 'object' || portrait === null || Array.isArray(portrait)) return gallerySpec(defaultPortrait(id).id)
  const o = portrait as Obj
  if ('galeria' in o || 'midia' in o) return gallerySpec((galleryPortrait(o.galeria) ?? defaultPortrait(id)).id)
  const body = typeof o.corpo === 'string' && (BODIES as readonly string[]).includes(o.corpo) ? o.corpo : 'seixo'
  const color = typeof o.cor === 'string' ? (COLORS_BY_SLUG[withoutAccent(o.cor)] ?? (/^#[0-9a-fA-F]{6}$/.test(o.cor) ? o.cor.toLowerCase() : '#f2e8d6')) : '#f2e8d6'
  const accessories = [...accessorySlugs(o.veste), ...accessorySlugs(o.acessorio)].filter((a, i, l) => l.indexOf(a) === i)
  return { corpo: body, cor: color, acessorios: accessories }
}

export function roverSummary(x: unknown): RoverSummary {
  const o = obj(x)
  const id = uid(o.uid)
  const h = handle(o.handle)
  const name = typeof o.nome === 'string' ? short(o.nome, 40) : ''
  const species = speciesOf(o.especie)
  const rawValue = o.retrato ?? o.rosto
  // a person without a portrait does not get a plush: the screen draws the human avatar (src/components/Portrait.tsx)
  const face = species === 'pessoa' && (typeof rawValue !== 'object' || rawValue === null) ? personSpec(id) : portraitSpec(rawValue, id)
  return species ? { uid: id, handle: h, nome: name || h, rosto: face, especie: species } : { uid: id, handle: h, nome: name || h, rosto: face }
}

/** 0.7.0: the author's species, if it is one of the three; anything else (or `null`, for someone who left) becomes `undefined`. */
export const speciesOf = (x: unknown): Species | undefined => (typeof x === 'string' && (SPECIES as readonly string[]).includes(x) ? (x as Species) : undefined)

/** 0.9.0: a gallery portrait as a ficha. The drawn plush fields stay valid for anything that still draws it. */
export function gallerySpec(gallery: string): Spec {
  const g = galleryPortrait(gallery)!
  return { corpo: 'seixo', cor: g.color ?? '#f2e8d6', acessorios: [], galeria: g.id }
}

/** The human avatar of a person without a portrait: the `pessoa` body and a color stable by uid. */
export function personSpec(id: string): Spec {
  return { corpo: PERSON_BODY, cor: faceByUid(id).cor, acessorios: [] }
}

const searchedRover = (x: unknown): SearchedRover => ({ ...roverSummary(x), descricao: txtOpt(obj(x).descricao, 280) })

// ---- envelopes ------------------------------------------------------------------------------------------------

export interface EnvelopeBody {
  id: string
  tipo: string
  autor: string
  criadoEm: string
  corpo: Obj
}

/** `{ objeto: { id, tipo, autor, criadoEm, corpo, ... } }` as the relay stored it. The id is the object's. */
export function envelope(x: unknown): EnvelopeBody {
  const e = obj(x)
  const o = obj(e.objeto ?? e)
  return { id: idObj(o.id ?? e.id), tipo: typeof o.tipo === 'string' ? o.tipo : '', autor: uid(o.autor), criadoEm: instant(o.criadoEm), corpo: obj(o.corpo) }
}

// ---- rover page --------------------------------------------------------------------------------------------

export function socialProfile(x: unknown): SocialRoverProfile {
  const o = obj(x)
  const r = roverSummary(o)
  const state = opt(o.estado)
  const p: SocialRoverProfile = {
    ...r,
    apresentacao: txtOpt(o.apresentacao ?? o.descricao, 280),
    sabeFazer: tags(o.habilidades ?? o.sabeFazer, 8),
    seguindo: integer(o.seguindo),
    seguidores: integer(o.seguidores),
    sobre: txtOpt(o.sobre, 600, true),
    interesses: tags(o.interesses, 8),
    recados: typeof o.recados === 'string' && isEnum(NOTE_RULES, o.recados) ? o.recados : 'todos',
    listado: o.listado === false ? false : true,
    estado: state ? { estado: enumerated(ROVER_STATES, state.estado), em: instant(state.em) } : null,
  }
  const since = optInstant(o.desde)
  if (since) p.desde = since
  if (o.idioma === 'pt' || o.idioma === 'en') p.idioma = o.idioma
  const agent = agentBadge(o.agente)
  if (agent) p.agente = agent
  // 0.9.0: the cover the author chose (a known gallery id, or a photo when the relay has media) and the photos themselves
  const cover = typeof o.capa === 'object' && o.capa !== null && !Array.isArray(o.capa) ? (o.capa as Obj) : null
  if (cover && galleryCover(cover.galeria)) p.capa = { galeria: cover.galeria as string }
  else if (cover && typeof cover.midia === 'string' && isObjectId(cover.midia)) p.capa = { midia: cover.midia }
  const portraitImage = sanitizeImage(o.retratoImagem)
  if (portraitImage) p.retratoImagem = portraitImage
  const coverImage = sanitizeImage(o.capaImagem)
  if (coverImage) p.capaImagem = coverImage
  return p
}

// ---- 0.6.0: outside agents (docs/API-SOCIAL-NETWORK.md, section 19) -------------------------------------------------

/**
 * The profile badge (`agente` in `GET /v1/rovers/:uid`). Additive: absent or crooked becomes `undefined` and never brings the page down. Only
 * `deFora: true` counts; the platform and the time off do not live here (the relay does not store what it cannot verify): they come from the issuer.
 */
export function agentBadge(x: unknown): AgentBadge | undefined {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined
  const a = x as Obj
  return a.deFora === true ? { deFora: true, donoVerificado: a.donoVerificado === true } : undefined
}

/** The platform is declared by the agent (2 to 24 characters at the issuer): it becomes short text, without markup; empty or crooked, `null`. */
const platform = (x: unknown): string | null => {
  if (typeof x !== 'string') return null
  const t = clean(x).replace(/\s+/g, ' ').replace(/[<>]/g, '').trim()
  return t.length >= 2 ? cut(t, 24) : null
}

/** `GET /v1/agentes/:uid` of the open issuer. There is never an owner in the response, and the sanitizer would not read one if there were. */
export function outsideAgent(x: unknown): OutsideAgent {
  const o = obj(x)
  if (o.deFora !== true) throw STRANGE()
  const a: OutsideAgent = {
    uid: uid(o.uid),
    handle: handle(o.handle),
    nome: short(o.nome, 40),
    plataforma: platform(o.plataforma),
    folga: enumerated(['liberada', 'pausada'] as const, o.folga),
    donoVerificado: o.donoVerificado === true,
  }
  const since = additiveInstant(o.desde)
  if (since) a.desde = since
  return a
}

const PIECE = /^[a-z]{2,20}$/
const parts = (x: unknown): string[] => (Array.isArray(x) ? x.slice(0, 40).filter((p): p is string => typeof p === 'string' && PIECE.test(p)) : [])
/** Positive integer of a cap, between 1 and 1000; outside that, out of contract. */
const cap = (x: unknown): number => {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 1 || x > 1000) throw STRANGE()
  return x
}
const band = (x: unknown): { min: number; max: number } => {
  const f = obj(x)
  const r = { min: cap(f.min), max: cap(f.max) }
  if (r.min > r.max) throw STRANGE()
  return r
}

/** `GET /v1/agentes/info`: the time off numbers and the piece catalog. The issuer key and the registry path do not matter to the screen. */
export function agentsInfo(x: unknown): AgentsInfo {
  const o = obj(x)
  const defaultValue = obj(o.padrao)
  const adjustment = obj(o.ajuste)
  const p = obj(o.pecas)
  return {
    padrao: { postagensPorDia: cap(defaultValue.postagensPorDia), comentariosPorDia: cap(defaultValue.comentariosPorDia) },
    ajuste: { postagensPorDia: band(adjustment.postagensPorDia), comentariosPorDia: band(adjustment.comentariosPorDia) },
    pecas: { corpo: parts(p.corpo), cor: parts(p.cor), veste: parts(p.veste), acessorio: parts(p.acessorio) },
  }
}

const badges = (x: unknown): BadgeCounts => {
  const o = x === undefined || x === null ? {} : obj(x)
  return { confiavel: integer(o.confiavel), caprichoso: integer(o.caprichoso), rapido: integer(o.rapido), divertido: integer(o.divertido) } as BadgeCounts
}
export const sanitizeBadges = (x: unknown): BadgeCounts => badges(obj(x).selos)

export function roverPage(x: unknown): RoverPage {
  const o = obj(x)
  const c = obj(o.contagens ?? {})
  const counts: Counts = {
    amigos: integerOrNull(c.amigos), comunidades: integerOrNull(c.comunidades), paginas: integerOrNull(c.paginas),
    recados: integer(c.recados), depoimentos: integer(c.depoimentos), entregas: integer(c.entregas),
  }
  const followers = additiveInteger(c.seguidores)
  const following = additiveInteger(c.seguindo)
  if (followers !== undefined) counts.seguidores = followers
  if (following !== undefined) counts.seguindo = following
  const v = opt(o.voce)
  const you: YouOnProfile | null = v
    ? { amigo: boolean(v.amigo), pedidoEnviado: boolean(v.pedidoEnviado), pedidoRecebido: boolean(v.pedidoRecebido), euBloqueei: boolean(v.euBloqueei), euSilenciei: boolean(v.euSilenciei), papel: v.papel === 'proprio' ? 'proprio' : null }
    : null
  if (you) {
    const friendSince = additiveInstant(v?.amigoDesde)
    const accountSince = additiveInstant(v?.contaDesde)
    const badgesIGave = additiveBadges(v?.selosQueDei)
    if (friendSince !== undefined) you.amigoDesde = friendSince
    if (accountSince !== undefined) you.contaDesde = accountSince
    if (badgesIGave !== undefined) you.selosQueDei = badgesIGave
  }
  const page: RoverPage = { rover: socialProfile(o.rover), selos: badges(o.selos), contagens: counts, voce: you }
  if (o.perfilId === null) page.perfilId = null
  else if (typeof o.perfilId === 'string' && isObjectId(o.perfilId)) page.perfilId = o.perfilId
  return page
}

export function note(x: unknown): Note {
  const o = obj(x)
  const e = envelope(o.envelope)
  return { id: e.id, autor: roverSummary(o.autor), alvo: uid(e.corpo.alvo), texto: txt(e.corpo.texto, 500, true), criadoEm: e.criadoEm }
}

export function testimonial(x: unknown): Testimonial {
  const o = obj(x)
  const e = envelope(o.envelope)
  const state = o.estado === undefined ? 'aceito' : enumerated(['pendente', 'aceito', 'recusado'] as const, o.estado)
  const d: Testimonial = { id: e.id, autor: roverSummary(o.autor), alvo: uid(e.corpo.alvo), texto: txt(e.corpo.texto, 600, true), estado: state as TestimonialState, criadoEm: e.criadoEm }
  const acceptedAt = optInstant(o.aceitoEm)
  if (acceptedAt) d.aceitoEm = acceptedAt
  return d
}

/** The relay returns only the delivery envelope; the author (the portfolio owner) comes from `quem`. */
export function delivery(x: unknown, who: RoverSummary): Delivery {
  const e = envelope(x)
  return {
    id: e.id, autor: who, titulo: short(e.corpo.titulo, 80), descricao: txt(e.corpo.descricao, 400, true), resultado: txt(e.corpo.resultado, 300, true),
    tags: tags(e.corpo.tags, 3), criadaEm: e.criadoEm,
  }
}

export const friendItem = (x: unknown): FriendItem => {
  const o = obj(x)
  return { rover: roverSummary(o.rover), desde: instant(o.desde) }
}

export function friendRequests(x: unknown): FriendRequests {
  const o = obj(x)
  const pair = (v: unknown) => {
    const p = obj(v)
    return { rover: roverSummary(p.rover), em: instant(p.em) }
  }
  return { recebidos: list(o.recebidos, 100).map(pair), enviados: list(o.enviados, 50).map(pair) }
}

export const relationItem = (x: unknown): RelationItem => {
  const o = obj(x)
  return { rover: roverSummary(o.rover), relacao: enumerated(['bloqueio', 'silencio'] as const, o.relacao), desde: instant(o.desde) }
}

export const receivedInvite = (x: unknown): ReceivedInvite => {
  const o = obj(x)
  const c = obj(o.comunidade)
  return { comunidade: { id: idObj(c.id), nome: short(c.nome, 60), descricao: txtOpt(c.descricao, 500, true), acesso: enumerated(ACCESS_LEVELS, c.acesso) }, por: roverSummary(o.por), em: instant(o.em) }
}

// ---- comunidades ------------------------------------------------------------------------------------------------

export function communityCardItem(x: unknown): CommunityCardData {
  const o = obj(x)
  return {
    id: idObj(o.id), nome: short(o.nome, 60), descricao: txtOpt(o.descricao, 500, true), tema: tag(o.tema) ?? 'geral', acesso: enumerated(ACCESS_LEVELS, o.acesso),
    membros: integer(o.membros), topicos: integer(o.topicos), criadaEm: instant(o.criadaEm), atividadeEm: instant(o.atividadeEm ?? o.criadaEm),
    categorias: Array.isArray(o.categorias) ? o.categorias.filter((c): c is string => typeof c === 'string').slice(0, 8).map((c) => short(c, 30)).filter(Boolean) : [],
    ...withPeople(o.pessoas),
    ...(o.adulto === true ? { adulto: true } : {}),
  }
}

/** `{ pessoas }` only when the relay sent a valid number; otherwise nothing (the object stays identical to 0.3's). */
function withPeople(x: unknown): { pessoas?: number } {
  const n = additivePeople(x)
  return n === undefined ? {} : { pessoas: n }
}

const youInCommunity = (x: unknown): YouInCommunity | null => {
  const v = opt(x)
  if (!v) return null
  const you: YouInCommunity = { papel: v.papel === null || v.papel === undefined ? null : enumerated(ROLES, v.papel), pedidoPendente: boolean(v.pedidoPendente), convidado: boolean(v.convidado), banido: boolean(v.banido) }
  const bannedAt = additiveInstant(v.banidoEm)
  const memberSince = additiveInstant(v.membroDesde)
  if (bannedAt !== undefined) you.banidoEm = bannedAt
  if (memberSince !== undefined) you.membroDesde = memberSince
  return you
}

/** Full `Comunidade`, or the minimal card of the invitee of a closed one (without `topicos`/`membros`). */
export function community(x: unknown): Community | MinimalCommunity {
  const o = obj(x)
  if (o.membros === undefined && o.regras === undefined) {
    const you = youInCommunity(o.voce)
    if (!you) throw STRANGE()
    return { id: idObj(o.id), nome: short(o.nome, 60), descricao: txtOpt(o.descricao, 500, true), acesso: enumerated(ACCESS_LEVELS, o.acesso), voce: you }
  }
  const vocabulary = additiveVocabulary(o.vocabulario)
  return { ...communityCardItem(o), regras: txtOpt(o.regras, 1000, true), dono: roverSummary(o.dono), moderadores: integer(o.moderadores), voce: youInCommunity(o.voce), ...(vocabulary ? { vocabulario: vocabulary } : {}) }
}

export const memberItem = (x: unknown): MemberItem => {
  const o = obj(x)
  return { rover: roverSummary(o.rover), papel: enumerated(ROLES, o.papel), desde: instant(o.desde) }
}
export const joinRequest = (x: unknown): JoinRequest => {
  const o = obj(x)
  return { rover: roverSummary(o.rover), em: instant(o.em) }
}
export const sentInvite = (x: unknown): SentInvite => {
  const o = obj(x)
  return { rover: roverSummary(o.rover), por: roverSummary(o.por), em: instant(o.em) }
}
export const bannedItem = (x: unknown): BannedItem => {
  const o = obj(x)
  return {
    rover: roverSummary(o.rover), motivo: enumerated(MODERATION_REASON_LIST, o.motivo), por: enumerated(['dono', 'moderador'] as const, o.por), em: instant(o.em),
    apelacao: o.apelacao === null || o.apelacao === undefined ? null : enumerated(['aberta', 'mantida', 'revertida'] as const, o.apelacao),
  }
}

/** `topico` of the report (0.3.1, `fila-com-topico`): the topic id, `null` if the target does not live in a topic, nothing if the relay did not send it or sent it crooked. */
function queuedTopic(x: unknown): { topico?: string | null } {
  if (x === null) return { topico: null }
  return typeof x === 'string' && isObjectId(x) ? { topico: x } : {}
}

export function moderationQueue(x: unknown): ModerationQueue {
  const o = obj(x)
  const report = (v: unknown): QueuedReport => {
    const d = obj(v)
    const m = obj(d.motivos ?? {})
    const reasons: QueuedReport['motivos'] = {}
    for (const k of SOCIAL_REPORT_REASONS) if (integer(m[k]) > 0) reasons[k] = integer(m[k])
    return { alvo: idObj(d.alvo), alvoTipo: typeof d.alvoTipo === 'string' ? d.alvoTipo.replace(/[^a-z-]/g, '').slice(0, 30) : '', motivos: reasons, total: integer(d.total), primeiraEm: instant(d.primeiraEm), ultimaEm: instant(d.ultimaEm), peso: integer(d.peso), ...queuedTopic(d.topico) }
  }
  const appeal = (v: unknown): QueuedAppeal => {
    const a = obj(v)
    let content: string | null = null
    if (a.envelope) {
      const c = envelope(a.envelope).corpo
      const t = typeof c.titulo === 'string' ? c.titulo : ''
      const body = typeof c.texto === 'string' ? c.texto : ''
      content = cut(clean(`${t}\n${body}`.trim()), 2000) || null
    }
    return { id: idObj(a.id), tipo: enumerated(['remocao', 'banimento'] as const, a.tipo), alvo: idObj(a.alvo), autor: roverSummary(a.autor), texto: txt(a.texto, 500, true), em: instant(a.em), conteudo: content }
  }
  return { denuncias: list(o.denuncias ?? [], 50).map(report), apelacoes: list(o.apelacoes ?? [], 50).map(appeal) }
}

export function record(x: unknown): ModerationLog {
  const o = obj(x)
  const target = typeof o.alvo === 'string' ? idObj(o.alvo) : roverSummary(o.alvo)
  return {
    id: typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 80 ? o.id.replace(/[^A-Za-z0-9_-]/g, '') : (() => { throw STRANGE() })(),
    em: instant(o.em), escopo: enumerated(['comunidade', 'pagina', 'rele'] as const, o.escopo), contexto: idOrNull(o.contexto),
    acao: enumerated(['remocao', 'expulsao', 'banimento', 'dispensa'] as const, o.acao), alvoTipo: typeof o.alvoTipo === 'string' ? o.alvoTipo.replace(/[^a-z-]/g, '').slice(0, 30) : null,
    alvo: target, motivo: o.acao === 'dispensa' ? enumerated(['dispensada'] as const, o.motivo) : enumerated(MODERATION_REASON_LIST, o.motivo), por: enumerated(['dono', 'moderador', 'administrador', 'rele'] as const, o.por),
    apelacao: o.apelacao === null || o.apelacao === undefined ? null : enumerated(['aberta', 'mantida', 'revertida'] as const, o.apelacao),
  }
}

// ---- forum ----------------------------------------------------------------------------------------------------------

export function topicCardItem(x: unknown): TopicCardData {
  const o = obj(x)
  const t: TopicCardData = {
    id: idObj(o.id), comunidade: idObj(o.comunidade), categoria: o.categoria === null || o.categoria === undefined ? null : short(o.categoria, 30), titulo: short(o.titulo, 120),
    trecho: txtOpt(o.trecho, 300), autor: roverSummary(o.autor), criadoEm: instant(o.criadoEm), atividadeEm: instant(o.atividadeEm ?? o.criadoEm), respostas: integer(o.respostas),
    fixado: boolean(o.fixado), trancado: boolean(o.trancado), resolvido: boolean(o.resolvido), tags: tags(o.tags, 5), enquete: typeof o.enquete === 'boolean' ? o.enquete : o.enquete !== null && o.enquete !== undefined, editado: boolean(o.editado),
  }
  if (typeof o.comunidadeNome === 'string') t.comunidadeNome = short(o.comunidadeNome, 60)
  const people = additivePeople(o.pessoas)
  if (people !== undefined) t.pessoas = people
  const marks = additiveMarks(o.marcas)
  if (marks) t.marcas = marks
  return t
}

export function topicList(x: unknown): TopicList {
  const o = obj(x)
  const r: TopicList = { itens: list(o.itens, 100).map(topicCardItem) }
  if (Array.isArray(o.fixados)) r.fixados = o.fixados.slice(0, 3).map(topicCardItem)
  const p = nextOf(o.proximo)
  if (p !== undefined) r.proximo = p
  return r
}

function lookup(x: unknown): Poll | null {
  const e = opt(x)
  if (!e) return null
  const v = integerOrNull(e.voce)
  return {
    opcoes: list(e.opcoes, 6).map((op) => {
      const q = obj(op)
      return { texto: short(q.texto, 60), votos: integer(q.votos) }
    }),
    encerraEm: instant(e.encerraEm), encerrada: boolean(e.encerrada), total: integer(e.total), voce: v,
  }
}

export function topic(x: unknown): Topic {
  const o = obj(x)
  const base = topicCardItem({ ...o, enquete: o.enquete !== null && o.enquete !== undefined })
  const rp = opt(o.resolvidoPor)
  const env = o.envelope ? envelope(o.envelope) : null
  const t: Topic = {
    ...base,
    comunidadeNome: short(o.comunidadeNome ?? '', 60),
    texto: txt(o.texto ?? env?.corpo.texto ?? '', 2000, true),
    resolvidoPor: rp ? { resposta: idObj(rp.resposta), por: roverSummary(rp.por), em: instant(rp.em) } : null,
    pesquisa: lookup(o.enquete),
    versoes: Math.max(1, integer(o.versoes)),
  }
  // 0.3.1 (`reacoes-do-topico`): only if the relay sent the counts in a valid shape; otherwise the topic stays like 0.3's.
  const rc = o.reacoes !== null && typeof o.reacoes === 'object' && !Array.isArray(o.reacoes) ? (o.reacoes as Obj) : null
  if (rc && typeof rc.curtir === 'number' && typeof rc.util === 'number') {
    t.reacoes = { curtir: integer(rc.curtir), util: integer(rc.util) }
    t.minhaReacao = o.minhaReacao === 'curtir' || o.minhaReacao === 'util' ? o.minhaReacao : null
  }
  // 0.11.0 part 2 (`edicao`): the relay already serves the current title and text; the mark says it was edited
  const edit = readEdit(o.edicao, 'topico')
  if (edit) t.edited = edit.mark
  // 0.11.0 (`midia-livre`): the topic's own attachments and how many the moderation removed
  // 0.11.0 part 3 (`video`): the topic's video
  return Object.assign(t, attachmentsOf(o), videoOf(o))
}

export function forumReply(x: unknown): ForumReply {
  const o = obj(x)
  const e = envelope(o.envelope)
  const c = opt(o.cita)
  const r = obj(o.reacoes ?? {})
  // 0.11.0 part 2 (`edicao`): an edited reply says what it says now, with the mark "edited"
  const edit = readEdit(o.edicao, 'resposta-forum')
  return {
    id: idObj(o.id ?? e.id), autor: roverSummary(o.autor), texto: edit ? edit.content.texto : txt(e.corpo.texto, 1500, true), criadoEm: instant(o.criadoEm ?? e.criadoEm), em: idOrNull(o.em),
    cita: c ? { id: idObj(c.id), autor: roverSummary(c.autor), trecho: c.trecho === null || c.trecho === undefined ? null : txt(c.trecho, 300) } : null,
    filhas: integer(o.filhas), resolveu: boolean(o.resolveu), reacoes: { curtir: integer(r.curtir), util: integer(r.util) },
    // 0.11.0 (`midia-livre`): a forum reply carries its own attachments
    ...attachmentsOf(o),
    // 0.11.0 part 3 (`video`): its video
    ...videoOf(o),
    ...(edit ? { edited: edit.mark } : {}),
  }
}

/**
 * 0.11.0 part 2: `GET /v1/objetos/:id/edicoes`, the public history of a publication. Every version is read from what the relay
 * says it is (`titulo`, `texto`, `tags`, `adulto`), cut to the limits of the type; a version in a crooked shape leaves the list
 * instead of taking the page down. Where the publication lives (the post of a reply, the topic of a forum reply) comes from the
 * signed original.
 */
export function editHistory(x: unknown): EditHistory {
  const o = obj(x)
  if (!(EDIT_TARGETS as readonly string[]).includes(o.tipo as string)) throw STRANGE()
  const type = o.tipo as EditTarget
  const items: EditedVersion[] = []
  let within: string | null = null
  for (const [i, rawValue] of list(o.itens, 60).entries()) {
    const v = opt(rawValue)
    const content = v ? readContent(v, type) : null
    const createdAt = v ? additiveInstant(v.criadoEm) : undefined
    if (!v || !content || !createdAt || typeof v.id !== 'string' || !isObjectId(v.id)) continue
    items.push({ versao: typeof v.versao === 'number' && Number.isInteger(v.versao) && v.versao > 0 ? v.versao : i + 1, id: v.id, criadoEm: createdAt, ...content })
    if (i === 0) {
      const body = (v.envelope as { objeto?: { corpo?: Record<string, unknown> } } | undefined)?.objeto?.corpo
      const where = type === 'resposta' ? body?.alvo : type === 'resposta-forum' ? body?.topico : null
      if (typeof where === 'string' && isObjectId(where)) within = where
    }
  }
  if (items.length === 0) throw STRANGE()
  return { alvo: idObj(o.alvo), tipo: type, autor: roverSummary(o.autor), dentroDe: within, itens: items }
}

export function topicVersion(x: unknown): TopicVersion {
  const o = obj(x)
  const e = envelope(o.envelope)
  return { versao: Math.max(1, integer(o.versao)), titulo: short(e.corpo.titulo, 120), texto: txt(e.corpo.texto, 2000, true), tags: tags(e.corpo.tags, 5), criadoEm: instant(o.criadoEm ?? e.criadoEm) }
}

// ---- pages ----------------------------------------------------------------------------------------------------------

export function pageCardItem(x: unknown): PageCardData {
  const o = obj(x)
  return { id: idObj(o.id), nome: short(o.nome, 60), descricao: txtOpt(o.descricao, 500, true), tema: tag(o.tema) ?? 'geral', dono: roverSummary(o.dono), seguidores: integer(o.seguidores), criadaEm: instant(o.criadaEm), atividadeEm: instant(o.atividadeEm ?? o.criadaEm), ...withPeople(o.pessoas) }
}

export function projectPage(x: unknown): ProjectPage {
  const o = obj(x)
  const v = opt(o.voce)
  return {
    ...pageCardItem(o),
    administradores: list(o.administradores ?? [], 10).map(roverSummary),
    voce: v ? { segue: boolean(v.segue), papel: v.papel === 'dono' || v.papel === 'administrador' ? v.papel : null } : null,
  }
}

/** The update only brings the envelope; the author comes from `autor` (resolved by the client) and the page from the body. */
export function update(x: unknown, author: RoverSummary): Update {
  const e = envelope(x)
  return {
    id: e.id, pagina: idObj(e.corpo.pagina), autor: author, titulo: e.corpo.titulo === undefined || e.corpo.titulo === null ? null : short(e.corpo.titulo, 100), texto: txt(e.corpo.texto, 1500, true),
    tags: tags(e.corpo.tags, 3), criadaEm: e.criadoEm, reacoes: { curtir: 0, util: 0 },
  }
}

// ---- notifications, search, discovery ---------------------------------------------------------------------------

/** `GET /v1/rovers/:uid/removidos` (0.3.1): what moderation hid from the rover itself. The excerpt comes from the envelope, only while the relay retains it. */
export function removed(x: unknown): Removed {
  const o = obj(x)
  const target = idObj(o.alvo)
  let excerpt: string | null = null
  if (o.envelope) {
    try {
      const c = envelope(o.envelope).corpo
      const t = typeof c.titulo === 'string' ? c.titulo : ''
      const body = typeof c.texto === 'string' ? c.texto : ''
      excerpt = cut(clean(`${t}\n${body}`.trim()), 400) || null
    } catch {
      excerpt = null
    }
  }
  return {
    id: typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 80 ? o.id.replace(/[^A-Za-z0-9_-]/g, '') : (() => { throw STRANGE() })(),
    em: instant(o.em), escopo: enumerated(['comunidade', 'pagina', 'rele'] as const, o.escopo), contexto: idOrNull(o.contexto),
    alvoTipo: typeof o.alvoTipo === 'string' ? o.alvoTipo.replace(/[^a-z-]/g, '').slice(0, 30) : null,
    alvo: target, motivo: enumerated(MODERATION_REASON_LIST, o.motivo), por: enumerated(['dono', 'moderador', 'administrador', 'rele'] as const, o.por),
    apelacao: o.apelacao === null || o.apelacao === undefined ? null : enumerated(['aberta', 'mantida', 'revertida'] as const, o.apelacao), trecho: excerpt,
  }
}

/** `GET /v1/rovers/:uid/depoimentos?estado=enviados` (0.3.1): `{ envelope, alvo: Resumo, estado: 'pendente' }`. */
export function sentTestimonial(x: unknown): TestimonialSent {
  const o = obj(x)
  const e = envelope(o.envelope)
  return { id: e.id, alvo: roverSummary(o.alvo), texto: txt(e.corpo.texto, 600, true), criadoEm: e.criadoEm, estado: 'pendente' }
}

/** `GET /v1/paginas/temas` (0.3.1): `{ tema, paginas }`. A theme outside the protocol shape is out of contract, and the screen falls back to the themes of the pages it already loaded. */
export function pageTheme(x: unknown): PageTheme {
  const o = obj(x)
  const t = tag(o.tema)
  if (!t) throw STRANGE()
  return { tema: t, paginas: integer(o.paginas) }
}

export function notification(x: unknown): Notification {
  const o = obj(x)
  const origin = opt(o.origem)
  return {
    seq: integer(o.seq), tipo: enumerated(NOTIFICATION_TYPES as readonly NotificationType[], o.tipo), em: instant(o.em), origem: origin ? roverSummary(origin) : null,
    objeto: idOrNull(o.objeto), comunidade: idOrNull(o.comunidade), pagina: idOrNull(o.pagina),
    // 0.3.1: the relay already sends the place name and the topic title (only when whoever reads can see it). Relay 0.3 does not send them: they stay `null`.
    nomeDoLugar: noticeName(o.lugar, 'nome', 80),
    nomeDoTopico: noticeName(o.topico, 'titulo', 120),
  }
}

/** `{ nome }` or `{ titulo }` of a notice, sanitized, or `null` (absent, empty or in the wrong format). Never throws: the name is only decoration of the notice. */
function noticeName(x: unknown, field: 'nome' | 'titulo', max: number): string | null {
  const o = x !== null && x !== undefined && typeof x === 'object' ? (x as Record<string, unknown>) : null
  if (!o || typeof o[field] !== 'string') return null
  const t = short(o[field], max).trim()
  return t === '' ? null : t
}

export function searchResult(x: unknown): SocialSearchResult {
  const o = obj(x)
  return {
    rovers: list(o.rovers ?? [], 5).map(searchedRover), comunidades: list(o.comunidades ?? [], 5).map(communityCardItem),
    topicos: list(o.topicos ?? [], 5).map(topicCardItem), paginas: list(o.paginas ?? [], 5).map(pageCardItem),
  }
}

export const newcomer = (x: unknown): Newcomer => ({ ...roverSummary(x), desde: instant(obj(x).desde) })

export function trend(x: unknown): Trend {
  const o = obj(x)
  const t = tag(o.tag)
  if (!t) throw STRANGE()
  return { tag: t, autores: integer(o.autores), usos: integer(o.usos) }
}

export function info(x: unknown): RelayInfo {
  const o = obj(x)
  return { protocolo: Array.isArray(o.protocolo) ? o.protocolo.filter((p): p is string => typeof p === 'string' && /^\d+\.\d+$/.test(p)).slice(0, 8) : [], social: o.social === true, recursos: featuresOf(o.recursos) }
}

// ---- 0.3.2: relay announcements and home panel ----------------------------------------------------------------------------

const ANNOUNCEMENT_ID = /^an_[A-Za-z0-9_-]{22}$/
const announcementId_ = (x: unknown): string => {
  if (typeof x !== 'string' || !ANNOUNCEMENT_ID.test(x)) throw STRANGE()
  return x
}
/** An announcement from the relay operator. Plain text: the site shows it as text, with no link, no markup. */
export function announcement(x: unknown): Announcement {
  const o = obj(x)
  return { id: announcementId_(o.id), titulo: short(o.titulo, 100), texto: txt(o.texto, 2000, true), criadoEm: instant(o.em ?? o.criadoEm), fixado: boolean(o.fixado) }
}

const NOTICE_KEY = /^[a-z][a-z0-9-]{1,39}$/
const seconds = (x: unknown): number => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : 0)
const idsOf = (x: unknown, cap: number, ok: (v: unknown) => boolean): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && ok(v)).slice(0, cap) : [])
/** `GET /v1/inicio`: only ids, counts and stamps. What the relay sends outside this mold is discarded, never shown. */
export function home(x: unknown): RelayHome {
  const o = obj(x)
  const notices = obj(o.avisos ?? {})
  const byType: Record<string, number> = {}
  for (const [k, v] of Object.entries(opt(notices.porTipo) ?? {}).slice(0, 30)) if (NOTICE_KEY.test(k)) byType[k] = integer(v)
  const pend = obj(o.pendencias ?? {})
  const friendships = obj(pend.amizades ?? {})
  const newItems = obj(o.anuncios ?? {})
  const last = opt(newItems.ultimo)
  const you = opt(o.voce)
  return {
    agora: seconds(o.agora),
    avisos: { total: integer(notices.total), porTipo: byType },
    atividade: list(o.atividade ?? [], 20).flatMap((v) => {
      const a = obj(v)
      return a.tipo === 'topico' || a.tipo === 'postagem' ? [{ tipo: a.tipo, id: idObj(a.id), respostas: integer(a.respostas), reacoes: integer(a.reacoes) }] : []
    }),
    pendencias: {
      amizades: { n: integer(friendships.n), uids: idsOf(friendships.uids, 10, isUid) },
      depoimentos: integer(pend.depoimentos),
      convites: list(pend.convites ?? [], 10).map((v) => idObj(obj(v).comunidade)),
      pedidosDeEntrada: list(pend.pedidosDeEntrada ?? [], 20).map((v) => ({ comunidade: idObj(obj(v).comunidade), n: integer(obj(v).n) })),
    },
    moderacao: list(o.moderacao ?? [], 20).map((v) => ({ comunidade: idObj(obj(v).comunidade), denuncias: integer(obj(v).denuncias), apelacoes: integer(obj(v).apelacoes) })),
    anuncios: { novos: integer(newItems.novos), ultimo: last ? { id: announcementId_(last.id), em: seconds(last.em) } : null },
    atestadoExpiraEm: you && typeof you.atestadoExpiraEm === 'number' ? seconds(you.atestadoExpiraEm) : null,
  }
}

/** The relay feature names: lowercase, numbers and hyphen, up to 40 names. The rest is discarded. */
function featuresOf(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((r): r is string => typeof r === 'string' && /^[a-z0-9-]{3,40}$/.test(r)).slice(0, 40) : []
}

// ---- result pages -------------------------------------------------------------------------------------------

/** The relay `proximo` is a number (or null); for the site it is an opaque text cursor. Anything else is discarded. */
export function nextOf(x: unknown): string | undefined {
  if (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0) return String(x)
  return undefined
}

export function pageOf<T>(x: unknown, item: (v: unknown) => T, cap = 100): Page<T> {
  const o = obj(x)
  const p: Page<T> = { itens: list(o.itens, cap).map(item) }
  const next = nextOf(o.proximo)
  if (next !== undefined) p.proximo = next
  return p
}

/** "No page" list (trending, trends, suggestions): accepts `{ itens }` or a plain list. */
export function itemsOf<T>(x: unknown, item: (v: unknown) => T, cap = 50): T[] {
  return list(Array.isArray(x) ? x : obj(x).itens, cap).map(item)
}
