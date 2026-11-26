// Deadlines the screens put into words: when the reader will be able to give a badge, how long until the member waiting period ends. They are PURE
// computations over the dates relay 0.3.1 returns in `voce` (`amigoDesde`, `contaDesde`, `membroDesde`). The relay always decides: here
// the rule is only anticipated, so the screen explains the "not yet" with the right date instead of letting the tap fail.

import { REPLY_GRACE_S, TOPIC_GRACE_S, DAYS_FOR_TESTIMONIAL, DAYS_FOR_BADGE } from './permissions'

const DAY_MS = 86_400_000

/** Milliseconds of an ISO instant, or `null` if absent or malformed. */
function ms(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string') return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/**
 * When the reader becomes able to give a badge: the day THE FRIENDSHIP and THE ACCOUNT both reach 7 days (whichever comes last counts).
 * `null` when one of the dates is missing (relay 0.3 does not send it): the screen then promises no date.
 */
export function whenCanGiveBadge(friendSince: string | null | undefined, accountSince: string | null | undefined): Date | null {
  return longestDeadline(friendSince, accountSince, DAYS_FOR_BADGE)
}

/** The same for the testimonial: 3 days of friendship and 3 of account. */
export function whenCanWriteTestimonial(friendSince: string | null | undefined, accountSince: string | null | undefined): Date | null {
  return longestDeadline(friendSince, accountSince, DAYS_FOR_TESTIMONIAL)
}

function longestDeadline(a: string | null | undefined, b: string | null | undefined, days: number): Date | null {
  const ta = ms(a)
  const tb = ms(b)
  if (ta === null || tb === null) return null
  return new Date(Math.max(ta, tb) + days * DAY_MS)
}

/** Already passed? (at the exact instant it counts as passed) */
export function hasPassed(when: Date | null, now: Date): boolean {
  return when !== null && now.getTime() >= when.getTime()
}

export type GraceType = 'topico' | 'resposta'

/**
 * How many SECONDS are left for the member waiting period to end, or 0 if it already ended (or if it cannot be known). Topic and vote wait 1 hour
 * after joining, reply 10 minutes. Owner and moderation have no waiting period: the caller decides that beforehand.
 */
export function missingGracePeriod(memberSince: string | null | undefined, type: GraceType, now: Date): number {
  const t = ms(memberSince)
  if (t === null) return 0
  const required = type === 'resposta' ? REPLY_GRACE_S : TOPIC_GRACE_S
  const passed = Math.floor((now.getTime() - t) / 1000)
  return passed >= required ? 0 : Math.max(0, required - Math.max(0, passed))
}

/** Seconds since the reader joined, for the permissions matrix (`Who.memberFor`); `undefined` when the relay did not say. */
export function memberForSeconds(memberSince: string | null | undefined, now: Date): number | undefined {
  const t = ms(memberSince)
  return t === null ? undefined : Math.max(0, Math.floor((now.getTime() - t) / 1000))
}

/** Minutes to show ("12 minutes left"): rounds up, at least 1. */
export function minutesToShow(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60))
}
