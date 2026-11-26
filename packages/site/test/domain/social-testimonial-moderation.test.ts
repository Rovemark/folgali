import { describe, expect, it } from 'vitest'
import { WAIT_DAYS_AFTER_REFUSAL, MAX_PENDING, applyDecision, canWriteAnother, visibleTo } from '@/lib/domain/testimonial'
import {
  APPEAL_WINDOW_DAYS, daysLeftToAppeal, requiresReason, mainReason, sortQueue, canAppeal, whoDecidesAppeal, validateManagement, type ManagementAction,
} from '@/lib/domain/moderation'
import type { QueuedReport } from '@/lib/social/types'

const DAY = 86_400_000

describe('testimonial: the cycle (section 4.4)', () => {
  it('accepting only works for a pending one', () => {
    expect(applyDecision('pendente', 'aceitar')).toBe('aceito')
    expect(applyDecision('aceito', 'aceitar')).toBeNull()
    expect(applyDecision('recusado', 'aceitar')).toBeNull()
  })
  it('refusing works for pending and for accepted (hide afterwards); a refused one does not return', () => {
    expect(applyDecision('pendente', 'recusar')).toBe('recusado')
    expect(applyDecision('aceito', 'recusar')).toBe('recusado')
    expect(applyDecision('recusado', 'recusar')).toBeNull()
  })
  const dep = (state: 'pendente' | 'aceito' | 'recusado') => ({ estado: state, alvo: 'rvr_dono', autor: { uid: 'rvr_autor' } })
  it('an accepted one is everybody\'s, including whoever is not identified', () => {
    expect(visibleTo(dep('aceito'), null)).toBe(true)
    expect(visibleTo(dep('aceito'), 'rvr_qualquer')).toBe(true)
  })
  it('a pending one is NEVER public: only the owner and the author read it', () => {
    expect(visibleTo(dep('pendente'), null)).toBe(false)
    expect(visibleTo(dep('pendente'), 'rvr_qualquer')).toBe(false)
    expect(visibleTo(dep('pendente'), 'rvr_dono')).toBe(true)
    expect(visibleTo(dep('pendente'), 'rvr_autor')).toBe(true)
  })
  it('a refused one does not appear to anybody, neither the owner nor the author', () => {
    for (const who of [null, 'rvr_dono', 'rvr_autor', 'rvr_qualquer']) expect(visibleTo(dep('recusado'), who)).toBe(false)
  })
  describe('who can write another', () => {
    const t0 = Date.parse('2026-11-05T12:00:00Z')
    const old = (state: 'pendente' | 'aceito' | 'recusado') => [{ estado: state, criadoEm: '2026-10-01T00:00:00Z' }]
    it('one live testimonial per pair: pending or accepted block', () => {
      expect(canWriteAnother(old('pendente'), 0, t0)).toEqual({ ok: false, motivo: 'ja-existe' })
      expect(canWriteAnother(old('aceito'), 0, t0)).toEqual({ ok: false, motivo: 'ja-existe' })
      expect(canWriteAnother(old('recusado'), 0, t0)).toEqual({ ok: true })
      expect(canWriteAnother([], 0, t0)).toEqual({ ok: true })
    })
    it('after a refusal, 7 days of waiting, counted to the instant', () => {
      expect(WAIT_DAYS_AFTER_REFUSAL).toBe(7)
      expect(canWriteAnother(old('recusado'), 0, t0, t0 - 7 * DAY + 1)).toEqual({ ok: false, motivo: 'espera' })
      expect(canWriteAnother(old('recusado'), 0, t0, t0 - 7 * DAY)).toEqual({ ok: true })
      expect(canWriteAnother([], 0, t0, t0 - 1000)).toEqual({ ok: false, motivo: 'espera' })
    })
    it('the owner has at most 20 pending', () => {
      expect(MAX_PENDING).toBe(20)
      expect(canWriteAnother([], 19, t0)).toEqual({ ok: true })
      expect(canWriteAnother([], 20, t0)).toEqual({ ok: false, motivo: 'limite-de-estrutura' })
    })
    it('the order: already exists, then wait, then limit', () => {
      expect(canWriteAnother(old('pendente'), 20, t0, t0)).toEqual({ ok: false, motivo: 'ja-existe' })
      expect(canWriteAnother([], 20, t0, t0)).toEqual({ ok: false, motivo: 'espera' })
    })
  })
})

describe('moderation: reason, appeal and queue (section 10)', () => {
  const ALL: ManagementAction[] = ['convidar', 'cancelar-convite', 'aprovar-pedido', 'recusar-pedido', 'expulsar', 'banir', 'desbanir', 'promover', 'rebaixar']
  it('only expel and ban require a reason', () => {
    for (const a of ALL) expect(requiresReason(a)).toBe(a === 'expulsar' || a === 'banir')
  })
  it('reason required when expelling and banning; forbidden on the others; from the enum', () => {
    for (const a of ['expulsar', 'banir'] as const) {
      expect(validateManagement(a, null)).toBe('motivo-obrigatorio')
      expect(validateManagement(a, 'spam')).toBeNull()
      expect(validateManagement(a, 'dados-pessoais')).toBeNull()
      expect(validateManagement(a, 'inventado' as never)).toBe('motivo-invalido')
    }
    for (const a of ALL.filter((x) => x !== 'expulsar' && x !== 'banir')) {
      expect(validateManagement(a, null)).toBeNull()
      expect(validateManagement(a, 'spam')).toBe('motivo-proibido')
    }
  })
  it('appeal: 14 days, at the exact instant it still counts, 1 ms later it does not, and the future does not count', () => {
    expect(APPEAL_WINDOW_DAYS).toBe(14)
    const now = new Date('2026-11-20T00:00:00Z')
    const at = (ms: number) => new Date(now.getTime() - ms).toISOString()
    expect(canAppeal(at(0), now)).toBe(true)
    expect(canAppeal(at(14 * DAY), now)).toBe(true)
    expect(canAppeal(at(14 * DAY + 1), now)).toBe(false)
    expect(canAppeal(at(-1), now)).toBe(false)
  })
  it('days left to appeal', () => {
    const now = new Date('2026-11-20T00:00:00Z')
    const at = (ms: number) => new Date(now.getTime() - ms).toISOString()
    expect(daysLeftToAppeal(at(0), now)).toBe(14)
    expect(daysLeftToAppeal(at(5 * DAY), now)).toBe(9)
    expect(daysLeftToAppeal(at(5 * DAY + 1), now)).toBe(9)
    expect(daysLeftToAppeal(at(14 * DAY), now)).toBe(0)
    expect(daysLeftToAppeal(at(30 * DAY), now)).toBe(0)
  })
  it('who decides the appeal: the owner, if the actor was a moderator; the relay administration in the other cases', () => {
    expect(whoDecidesAppeal('moderador')).toBe('dono')
    expect(whoDecidesAppeal('dono')).toBe('rele')
    expect(whoDecidesAppeal('administrador')).toBe('rele')
    expect(whoDecidesAppeal('rele')).toBe('rele')
  })

  const rep = (target: string, weight: number, lastAt: string, total = 1): QueuedReport => ({ alvo: target, alvoTipo: 'topico', motivos: { spam: total }, total, primeiraEm: '2026-11-01T00:00:00Z', ultimaEm: lastAt, peso: weight })
  it('the queue orders by weight, then the most recent, then the target, without touching the input', () => {
    const input = [rep('b', 1, '2026-11-03T00:00:00Z'), rep('a', 5, '2026-11-01T00:00:00Z'), rep('c', 1, '2026-11-04T00:00:00Z'), rep('d', 1, '2026-11-04T00:00:00Z')]
    const copy = structuredClone(input)
    expect(sortQueue(input).map((x) => x.alvo)).toEqual(['a', 'c', 'd', 'b'])
    expect(input).toEqual(copy)
  })
  it('weight tie: the most recent first; date tie: target order, whatever the input order', () => {
    const old = rep('a', 2, '2026-11-01T00:00:00Z')
    const newValue = rep('z', 2, '2026-11-09T00:00:00Z')
    expect(sortQueue([old, newValue]).map((x) => x.alvo)).toEqual(['z', 'a'])
    expect(sortQueue([newValue, old]).map((x) => x.alvo)).toEqual(['z', 'a'])
    const c = rep('c', 2, '2026-11-04T00:00:00Z')
    const d = rep('d', 2, '2026-11-04T00:00:00Z')
    expect(sortQueue([d, c]).map((x) => x.alvo)).toEqual(['c', 'd'])
    expect(sortQueue([c, d]).map((x) => x.alvo)).toEqual(['c', 'd'])
  })
  it('NO number of reports hides or removes: the weight only orders and the queue returns all', () => {
    const many_ = Array.from({ length: 100 }, (_, i) => rep(`x${i}`, i % 7, '2026-11-04T00:00:00Z', 10_000))
    const output = sortQueue(many_)
    expect(output).toHaveLength(100)
    expect(new Set(output.map((x) => x.alvo)).size).toBe(100)
    expect(output.every((x) => x.total === 10_000)).toBe(true)
    expect(sortQueue([rep('so', 0, '2026-11-01T00:00:00Z', 1)])).toHaveLength(1)
    expect(sortQueue([])).toEqual([])
  })
  it('main reason: the most cited; a tie keeps the first; empty is null', () => {
    expect(mainReason({ motivos: { spam: 2, assedio: 5, golpe: 1 } })).toBe('assedio')
    expect(mainReason({ motivos: { spam: 3, assedio: 3 } })).toBe('spam')
    expect(mainReason({ motivos: {} })).toBeNull()
    expect(mainReason({ motivos: { spam: 0 } })).toBeNull()
    expect(mainReason({ motivos: { spam: undefined, golpe: 1 } })).toBe('golpe')
  })
})
