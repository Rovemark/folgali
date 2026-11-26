// Events on folgali (protocol 0.11.0 part 4): what the screens show after the relay's answer went through src/lib/events/sanitize.ts.
// Times stay as protocol instants (seconds, UTC); `fuso` is the IANA time zone the organizer thinks the event in.
import type { RoverSummary } from '../types'

export const RSVPS = ['vou', 'talvez', 'nao-vou'] as const
export type Rsvp = (typeof RSVPS)[number]
export const isRsvp = (x: unknown): x is Rsvp => typeof x === 'string' && (RSVPS as readonly string[]).includes(x)

/** What the relay lists by itself (`quando`). */
export const RELAY_WHEN = ['proximos', 'semana', 'passados'] as const
export type RelayWhen = (typeof RELAY_WHEN)[number]

/** The filters of the Events screen: the three of the relay, plus "today" and "online" taken from the upcoming list. */
export const EVENT_FILTERS = ['proximos', 'semana', 'hoje', 'online', 'passados'] as const
export type EventFilter = (typeof EVENT_FILTERS)[number]
export const isEventFilter = (x: unknown): x is EventFilter => typeof x === 'string' && (EVENT_FILTERS as readonly string[]).includes(x)

export interface EventCard {
  id: string
  organizador: RoverSummary
  comunidade: { id: string; nome: string } | null
  titulo: string
  descricao: string
  /** seconds, UTC */
  inicio: number
  fim: number | null
  fuso: string
  online: boolean
  /** the place, or for an online event the call link (or null) */
  lugar: string | null
  /** a house gallery cover id (src/lib/folgali/gallery.ts), or null */
  capa: string | null
  vagas: number | null
  vagasRestantes: number | null
  estado: 'ativo' | 'cancelado'
  encerrado: boolean
  criadoEm: number
  editado: boolean
  editadoEm?: number
  canceladoEm?: number
  adulto?: true
  contagens: { vou: number; talvez: number; naoVou: number }
  minhaPresenca: Rsvp | null
}

export interface EventDetail extends EventCard {
  versoes: number
}

export interface Attendee {
  rover: RoverSummary
  /** seconds, UTC */
  em: number
}

export interface EventPage<T> {
  itens: T[]
  proximo?: string
}

/** `info.eventos` of GET /v1/info: the limits the form checks before signing. */
export interface EventLimits {
  tituloCaracteres: number
  descricaoCaracteres: number
  lugarCaracteres: number
  vagasMax: number
  antecedenciaMaxS: number
  duracaoMaxS: number
  duracaoPadraoS: number
}

/** The protocol's limits (packages/protocol/src/events.js): used when the relay does not say. */
export const DEFAULT_LIMITS: EventLimits = {
  tituloCaracteres: 100,
  descricaoCaracteres: 2000,
  lugarCaracteres: 160,
  vagasMax: 100000,
  antecedenciaMaxS: 2 * 365 * 86400,
  duracaoMaxS: 30 * 86400,
  duracaoPadraoS: 6 * 3600,
}

/** The shortest title and place the protocol takes. */
export const TITLE_MIN = 3
export const PLACE_MIN = 2
