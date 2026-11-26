import { describe, expect, it } from 'vitest'
import { missingGracePeriod, hasPassed, memberForSeconds, minutesToShow, whenCanGiveBadge, whenCanWriteTestimonial } from '@/lib/domain/deadlines'

// The deadlines the screen says in words, over the dates relay 0.3.1 sends in `voce`. Each boundary is tested at the exact instant, because it is
// there that a `>` swapped for `>=` would change what the person reads ("falta 1 minuto" against "já pode").

const T0 = '2026-11-01T12:00:00.000Z'
const ms = (iso: string) => Date.parse(iso)
const DAY = 86_400_000
const at = (base: string, offsetMs: number) => new Date(ms(base) + offsetMs)

describe('quandoPodeDarSelo e quandoPodeEscreverDepoimento', () => {
  it('the date that comes LAST (friendship or account) plus 7 days for the badge and 3 for the testimonial counts', () => {
    const friend = '2026-11-01T12:00:00.000Z'
    const account = '2026-11-03T12:00:00.000Z'
    expect(whenCanGiveBadge(friend, account)?.toISOString()).toBe('2026-11-10T12:00:00.000Z')
    expect(whenCanGiveBadge(account, friend)?.toISOString()).toBe('2026-11-10T12:00:00.000Z')
    expect(whenCanWriteTestimonial(friend, account)?.toISOString()).toBe('2026-11-06T12:00:00.000Z')
    expect(whenCanWriteTestimonial(account, friend)?.toISOString()).toBe('2026-11-06T12:00:00.000Z')
  })
  it('with both dates equal it is that date plus the deadline', () => {
    expect(whenCanGiveBadge(T0, T0)?.getTime()).toBe(ms(T0) + 7 * DAY)
    expect(whenCanWriteTestimonial(T0, T0)?.getTime()).toBe(ms(T0) + 3 * DAY)
  })
  it('without one of the dates (relay 0.3) or with a malformed date it promises no date at all', () => {
    expect(whenCanGiveBadge(undefined, T0)).toBeNull()
    expect(whenCanGiveBadge(T0, undefined)).toBeNull()
    expect(whenCanGiveBadge(null, T0)).toBeNull()
    expect(whenCanGiveBadge(T0, null)).toBeNull()
    expect(whenCanGiveBadge('ontem', T0)).toBeNull()
    expect(whenCanGiveBadge(T0, '')).toBeNull()
    expect(whenCanWriteTestimonial(undefined, undefined)).toBeNull()
    expect(whenCanWriteTestimonial(T0, 'ontem')).toBeNull()
  })
})

describe('jaPassou', () => {
  it('at the exact instant it has passed; one millisecond before it has not; without a date it has not passed', () => {
    const q = new Date(ms(T0))
    expect(hasPassed(q, at(T0, -1))).toBe(false)
    expect(hasPassed(q, at(T0, 0))).toBe(true)
    expect(hasPassed(q, at(T0, 1))).toBe(true)
    expect(hasPassed(null, at(T0, 99 * DAY))).toBe(false)
  })
})

describe('faltaDeCarencia', () => {
  it('topic and vote wait 1 hour, counted from joining', () => {
    expect(missingGracePeriod(T0, 'topico', at(T0, 0))).toBe(3600)
    expect(missingGracePeriod(T0, 'topico', at(T0, 1_000))).toBe(3599)
    expect(missingGracePeriod(T0, 'topico', at(T0, 3_599_000))).toBe(1)
    expect(missingGracePeriod(T0, 'topico', at(T0, 3_600_000))).toBe(0)
    expect(missingGracePeriod(T0, 'topico', at(T0, 7_200_000))).toBe(0)
  })
  it('resposta espera 10 minutos', () => {
    expect(missingGracePeriod(T0, 'resposta', at(T0, 0))).toBe(600)
    expect(missingGracePeriod(T0, 'resposta', at(T0, 599_000))).toBe(1)
    expect(missingGracePeriod(T0, 'resposta', at(T0, 600_000))).toBe(0)
  })
  it('a fraction of a second does not become an extra second: rounds down what passed', () => {
    expect(missingGracePeriod(T0, 'resposta', at(T0, 599_999))).toBe(1)
    expect(missingGracePeriod(T0, 'resposta', at(T0, 1_500))).toBe(599)
  })
  it('a clock that is behind (the join "in the future") counts the whole wait, never more than it', () => {
    expect(missingGracePeriod(T0, 'topico', at(T0, -60_000))).toBe(3600)
    expect(missingGracePeriod(T0, 'resposta', at(T0, -60_000))).toBe(600)
  })
  it('without a date or with a malformed date it cannot be known: 0, and the relay decides', () => {
    expect(missingGracePeriod(undefined, 'topico', at(T0, 0))).toBe(0)
    expect(missingGracePeriod(null, 'resposta', at(T0, 0))).toBe(0)
    expect(missingGracePeriod('ontem', 'topico', at(T0, 0))).toBe(0)
  })
})

describe('membroHaSegundos', () => {
  it('whole seconds since joining; in the future becomes 0; without a date it is undefined', () => {
    expect(memberForSeconds(T0, at(T0, 90_999))).toBe(90)
    expect(memberForSeconds(T0, at(T0, 0))).toBe(0)
    expect(memberForSeconds(T0, at(T0, -5_000))).toBe(0)
    expect(memberForSeconds(undefined, at(T0, 5_000))).toBeUndefined()
    expect(memberForSeconds(null, at(T0, 5_000))).toBeUndefined()
    expect(memberForSeconds('xx', at(T0, 5_000))).toBeUndefined()
  })
})

describe('minutosParaMostrar', () => {
  it('rounds up and never shows less than 1 minute', () => {
    expect(minutesToShow(0)).toBe(1)
    expect(minutesToShow(1)).toBe(1)
    expect(minutesToShow(60)).toBe(1)
    expect(minutesToShow(61)).toBe(2)
    expect(minutesToShow(3600)).toBe(60)
    expect(minutesToShow(3599)).toBe(60)
  })
})
