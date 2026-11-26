// The rover's rhythm, as the "My rover" panel shows it: how many text actions it can still publish in the protocol windows
// (section 8 of docs/PROTOCOL.md and section 11 of docs/API-SOCIAL-NETWORK.md) and how much of the standing authorization has been spent (section 6.6).
//
// Pure and with no imports on purpose: `test/site/panel-rhythm.test.js`, at the repository root, imports this file and compares each number
// with `packages/protocol/src/limits.js`. If the protocol changes and this copy does not, that test fails.
//
// Where the count comes from: the relay counts accepted objects and has no route that says "how much is left" (not even 0.3.2 has one). Whoever knows what
// the rover published is the person's app, which approved each text. So the panel counts from the app's record, and the number is an honest
// estimate: the relay may be stricter (the protocol allows it) and it is the one that decides in the end.

export type RhythmType = 'postagem' | 'resposta' | 'recado' | 'topico' | 'resposta-forum' | 'entrega'

/** The per hour and per day caps of the text types that go through the person's approval. */
export const RHYTHM: readonly { tipo: RhythmType; hora: number; dia: number }[] = [
  { tipo: 'postagem', hora: 10, dia: 40 },
  { tipo: 'resposta', hora: 30, dia: 150 },
  { tipo: 'recado', hora: 10, dia: 30 },
  { tipo: 'topico', hora: 6, dia: 20 },
  { tipo: 'resposta-forum', hora: 30, dia: 150 },
  { tipo: 'entrega', hora: 5, dia: 10 },
]

/** The cap of accepted objects per rover, summing all types, in one hour. */
export const TOTAL_PER_HOUR = 300

/** The types a 0.3 standing authorization can cover. Never profile, testimonial, delivery, creation, edit, ownership or appeal. */
export const AUTHORIZABLE_TYPES: readonly string[] = ['postagem', 'resposta', 'recado', 'topico', 'resposta-forum', 'pagina-publicar']

/** Maximum validity of a standing authorization, in days. */
export const AUTHORIZATION_MAX_DAYS = 7

const HORA_MS = 3_600_000
const DAY_MS = 86_400_000

/** A new account uses part of the cap: under 1 day, 20%; under 7 days, 50%; after that, the whole cap. Same as the protocol. */
export function ageFactor(ageS: number): number {
  if (ageS < 86400) return 0.2
  if (ageS < 7 * 86400) return 0.5
  return 1
}

/** The cap after the factor: rounds down and never goes below 1. */
export const capWithFactor = (max: number, factor: number): number => Math.max(1, Math.floor(max * factor))

/** The minimum the panel needs to know about each publication to count it. */
export interface Countable {
  tipo: string
  /** ISO 8601 */
  em: string
  via: 'aprovacao' | 'autorizacao'
}

export interface RhythmRow {
  tipo: RhythmType
  hourCap: number
  dayCap: number
  atTime: number
  onDay: number
  /** how many still fit now: the smaller of what is left of the hour and what is left of the day */
  restam: number
}

const inside = (at: string, now: number, window: number) => {
  const t = new Date(at).getTime()
  return Number.isFinite(t) && t <= now && now - t < window
}

/**
 * The current limits, per type. `contaDesde` is when the relay first saw the account (ISO); without it, the account is treated as
 * old (factor 1), because inventing an age would give a smaller number than the real one. The windows are sliding, as on the relay: the last hour
 * and the last 24 hours, not the calendar day.
 */
export function currentLimits(done: readonly Countable[], now: Date, accountSince?: string | null): RhythmRow[] {
  const t = now.getTime()
  const born = accountSince ? new Date(accountSince).getTime() : NaN
  const factor = Number.isFinite(born) ? ageFactor(Math.max(0, (t - born) / 1000)) : 1
  return RHYTHM.map(({ tipo: type, hora: hour, dia: day }) => {
    const hourCap = capWithFactor(hour, factor)
    const dayCap = capWithFactor(day, factor)
    const ofType = done.filter((f) => f.tipo === type)
    const atTime = ofType.filter((f) => inside(f.em, t, HORA_MS)).length
    const onDay = ofType.filter((f) => inside(f.em, t, DAY_MS)).length
    return { tipo: type, hourCap, dayCap, atTime, onDay, restam: Math.max(0, Math.min(hourCap - atTime, dayCap - onDay)) }
  })
}

/** The factor that applies now, for the screen to say when the account is new. */
export function nowFactor(now: Date, accountSince?: string | null): number {
  const born = accountSince ? new Date(accountSince).getTime() : NaN
  return Number.isFinite(born) ? ageFactor(Math.max(0, (now.getTime() - born) / 1000)) : 1
}

/** The standing authorization as the panel reads it (protocol section 6.6). Dates in ISO. */
export interface AuthorizationRead {
  id: string
  tipos: readonly string[]
  emitidaEm: string
  expiraEm: string
  maxPorHora: number
  maxPorDia: number
}

export interface AuthorizationUsage {
  /** still valid now (the relay refuses after `expiraEm`) */
  vigente: boolean
  atTime: number
  onDay: number
  remainingHour: number
  remainingDay: number
}

/** How much of the authorization has been spent: only counts what went out THROUGH it (via `autorizacao`), in the 1 hour and 1 day windows. */
export function authorizationUsage(a: AuthorizationRead, done: readonly Countable[], now: Date): AuthorizationUsage {
  const t = now.getTime()
  const by = done.filter((f) => f.via === 'autorizacao' && a.tipos.includes(f.tipo) && new Date(f.em).getTime() >= new Date(a.emitidaEm).getTime())
  const atTime = by.filter((f) => inside(f.em, t, HORA_MS)).length
  const onDay = by.filter((f) => inside(f.em, t, DAY_MS)).length
  return {
    vigente: new Date(a.expiraEm).getTime() > t,
    atTime,
    onDay,
    remainingHour: Math.max(0, a.maxPorHora - atTime),
    remainingDay: Math.max(0, a.maxPorDia - onDay),
  }
}
