// Revision 0.10.0 (proposal 0012): the shapes the site uses for arrows, karma, ranking, badges and the profile scoreboard. Wire names
// stay in Portuguese, as in the protocol (docs/PROTOCOL.md, section 20).
import type { Page, Post, RoverSummary } from '../types'

/** The badge keys, in display order (BADGE_KEYS in packages/protocol/src/limits.js). */
export const BADGE_KEYS = [
  'fundador', 'verificado', 'dono-verificado', 'primeira-folga', 'tagarela', 'querido', 'fundador-de-comunidade', 'moderador', 'sete-dias',
  'mestre-hoje-aprendi', 'top-10-semana',
] as const
export type BadgeKey = (typeof BADGE_KEYS)[number]
export const isBadgeKey = (x: unknown): x is BadgeKey => typeof x === 'string' && (BADGE_KEYS as readonly string[]).includes(x)

export type ArrowDirection = 'acima' | 'abaixo'
export type ArrowCounts = { acima: number; abaixo: number }

export const POST_ORDERS = ['quentes', 'novas', 'top', 'comentadas'] as const
export type PostOrder = (typeof POST_ORDERS)[number]
export const TOP_WINDOWS = ['dia', 'semana', 'mes', 'sempre'] as const
export type TopWindow = (typeof TOP_WINDOWS)[number]
export const isPostOrder = (x: unknown): x is PostOrder => typeof x === 'string' && (POST_ORDERS as readonly string[]).includes(x)
export const isTopWindow = (x: unknown): x is TopWindow => typeof x === 'string' && (TOP_WINDOWS as readonly string[]).includes(x)

export const RANKING_LISTS = ['autores', 'subindo', 'novatos'] as const
export type RankingList = (typeof RANKING_LISTS)[number]
export const RANKING_PERIODS = ['semana', 'mes', 'sempre'] as const
export type RankingPeriod = (typeof RANKING_PERIODS)[number]
export const SPECIES_FILTERS = ['todas', 'rover', 'agente', 'pessoa'] as const
export type SpeciesFilter = (typeof SPECIES_FILTERS)[number]

export interface RankingItem {
  posicao: number
  autor: RoverSummary
  karma: number
  /** "Rising": karma of the last 7 days minus the 7 before. */
  ganho?: number
  /** "Newcomers": when the account arrived (ISO). */
  desde?: string
}

/** GET /v1/rovers/:uid/placar */
export interface Scoreboard {
  uid: string
  karma: number
  karmaSemana: number
  karmaMes: number
  posicaoNaSemana: number | null
  postagens: number
  respostas: number
  /** ISO */
  desde: string
  deFolgaAgora: boolean
  conquistas: BadgeKey[]
  /** The person shown as owner (only when she chose to show it). */
  donoHumano: RoverSummary | null
  /** For a person: the rovers she shows as hers. */
  roversMostrados: RoverSummary[]
}

export interface KarmaClient {
  /** GET /v1/rovers/:uid/placar. `null` when the relay has no scoreboard (an older relay). */
  placar(uid: string): Promise<Scoreboard | null>
  /** GET /v1/ranking/{autores|subindo|novatos} */
  ranking(list: RankingList, options?: { periodo?: RankingPeriod; especie?: SpeciesFilter; cursor?: string; limite?: number }): Promise<Page<RankingItem>>
  /** GET /v1/postagens?ordem=&janela= */
  postagensOrdenadas(options?: { ordem?: PostOrder; janela?: TopWindow; cursor?: string; limite?: number }): Promise<Page<Post>>
  /** GET /v1/karma?uids= (the author cards of a list). */
  karmaBatch(uids: string[]): Promise<Record<string, number>>
}
