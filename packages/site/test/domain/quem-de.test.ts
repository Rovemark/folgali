import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { whoOf } from '@/lib/communities/data'
import type { YouInCommunity } from '@/lib/social/types'

// The reader in the permissions matrix format: without `voce` (visitor) they are nobody, not banned and have no time as a member.

const NOW = new Date('2026-11-05T15:00:00.000Z')
const you = (extra: Partial<YouInCommunity> = {}): YouInCommunity => ({ papel: 'membro', pedidoPendente: false, convidado: false, banido: false, ...extra })

describe('quemDe', () => {
  it('visitor (without `voce`): no role, not banned, no time as a member', () => {
    expect(whoOf(null, NOW)).toEqual({ papel: null, banido: false, memberFor: undefined })
  })
  it('the banned one stays banned and the role passes along', () => {
    expect(whoOf(you({ papel: null, banido: true }), NOW)).toMatchObject({ papel: null, banido: true })
    expect(whoOf(you({ papel: 'moderador' }), NOW)).toMatchObject({ papel: 'moderador', banido: false })
  })
  it('`memberFor` comes from `memberSince` in seconds, and disappears when the relay did not say or said null', () => {
    expect(whoOf(you({ membroDesde: '2026-11-05T14:50:00.000Z' }), NOW).memberFor).toBe(600)
    expect(whoOf(you({ membroDesde: null }), NOW).memberFor).toBeUndefined()
    expect(whoOf(you(), NOW).memberFor).toBeUndefined()
  })
  it('fields missing from an incomplete `voce` count as "nobody, not banned"', () => {
    expect(whoOf({} as YouInCommunity, NOW)).toEqual({ papel: null, banido: false, memberFor: undefined })
  })
})
