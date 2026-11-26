// Reading events from the relay, on the site's server only (the browser never talks to the relay). Public reads, without a credential:
// the reader's own answer (`minhaPresenca`) comes from the browser through /api/person/events. Nothing is cached, so an event the
// person just created or answered shows on her next page. Every answer goes through src/lib/events/sanitize.ts.
import 'server-only'
import { isObjectId, isUid } from '../domain/ids'
import { relayCode } from '../social/http/errors'
import { NetworkError } from '../types'
import { attendeeList, eventDetail, eventList, eventsInfo } from './sanitize'
import { RELAY_WHEN, isRsvp, type Attendee, type EventCard, type EventDetail, type EventLimits, type EventPage, type RelayWhen, type Rsvp } from './types'

const TIMEOUT_MS = 8000

/** The relay's address when the site talks to a real relay, or null (the demonstration client). */
export function relayAddress(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  if (env.FOLGALI_CLIENT !== 'http' || !env.FOLGALI_RELAY_URL) return null
  try {
    const u = new URL(env.FOLGALI_RELAY_URL)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin + u.pathname.replace(/\/+$/, '')
  } catch {
    return null
  }
}

async function read(path: string): Promise<unknown> {
  const base = relayAddress()
  if (!base) throw new NetworkError('indisponivel', 'sem relé')
  let res: Response
  try {
    res = await fetch(`${base}${path}`, { method: 'GET', headers: { accept: 'application/json' }, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new NetworkError('indisponivel', 'o relé não respondeu')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => undefined)
    throw new NetworkError(relayCode(res.status, body), 'o relé recusou o pedido')
  }
  try {
    return await res.json()
  } catch {
    throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
  }
}

const CURSOR = /^\d{1,16}$/
const query = (q: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Whether the relay announces events, and the limits it declares. A relay that does not answer counts as without events. */
export async function eventsOnRelay(): Promise<{ on: boolean; limits: EventLimits }> {
  try {
    return eventsInfo(await read('/v1/info'))
  } catch {
    return eventsInfo(null)
  }
}

export interface ListOptions {
  quando?: RelayWhen
  comunidade?: string
  /** the organizer */
  de?: string
  /** events this uid answered vou or talvez to */
  vai?: string
  antes?: string
  limite?: number
}

/** GET /v1/eventos. Odd options are dropped before the request leaves (an id that is not one never becomes a path). */
export async function listEvents(o: ListOptions = {}): Promise<EventPage<EventCard>> {
  const when = o.quando && (RELAY_WHEN as readonly string[]).includes(o.quando) ? o.quando : 'proximos'
  const q = {
    quando: when,
    comunidade: o.comunidade && isObjectId(o.comunidade) ? o.comunidade : undefined,
    de: o.de && isUid(o.de) ? o.de : undefined,
    vai: o.vai && isUid(o.vai) ? o.vai : undefined,
    antes: o.antes && CURSOR.test(o.antes) ? o.antes : undefined,
    limite: o.limite && o.limite > 0 ? Math.min(50, Math.floor(o.limite)) : undefined,
  }
  return eventList(await read(`/v1/eventos${query(q)}`))
}

/** GET /v1/comunidades/:id/eventos */
export async function communityEvents(community: string, when: RelayWhen = 'proximos', limit = 3): Promise<EventPage<EventCard>> {
  if (!isObjectId(community)) throw new NetworkError('nao-encontrado', 'não encontrado')
  return eventList(await read(`/v1/comunidades/${community}/eventos${query({ quando: when, limite: limit })}`))
}

/** GET /v1/rovers/:uid/eventos: what the rover organizes, or (`papel=vai`) what they answered vou or talvez to. */
export async function roverEvents(uid: string, role: 'organiza' | 'vai', limit = 3): Promise<EventPage<EventCard>> {
  if (!isUid(uid)) throw new NetworkError('nao-encontrado', 'não encontrado')
  return eventList(await read(`/v1/rovers/${uid}/eventos${query({ quando: 'proximos', papel: role === 'vai' ? 'vai' : undefined, limite: limit })}`))
}

/** GET /v1/eventos/:id */
export async function readEvent(eventId: string): Promise<EventDetail> {
  if (!isObjectId(eventId)) throw new NetworkError('nao-encontrado', 'não encontrado')
  return eventDetail(await read(`/v1/eventos/${eventId}`))
}

/** GET /v1/eventos/:id/presencas?resposta= */
export async function attendees(eventId: string, reply: Rsvp = 'vou', limit = 30): Promise<EventPage<Attendee>> {
  if (!isObjectId(eventId) || !isRsvp(reply)) throw new NetworkError('nao-encontrado', 'não encontrado')
  return attendeeList(await read(`/v1/eventos/${eventId}/presencas${query({ resposta: reply, limite: limit })}`))
}
