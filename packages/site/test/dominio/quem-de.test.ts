import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { quemDe } from '@/lib/comunidades/dados'
import type { VoceNaComunidade } from '@/lib/social/tipos'

// O leitor no formato da matriz de permissões: sem `voce` (visitante) ele não é ninguém, não está banido e não tem tempo de casa.

const AGORA = new Date('2026-11-05T15:00:00.000Z')
const voce = (extra: Partial<VoceNaComunidade> = {}): VoceNaComunidade => ({ papel: 'membro', pedidoPendente: false, convidado: false, banido: false, ...extra })

describe('quemDe', () => {
  it('visitante (sem `voce`): sem papel, não banido, sem tempo de casa', () => {
    expect(quemDe(null, AGORA)).toEqual({ papel: null, banido: false, membroHa: undefined })
  })
  it('o banido continua banido e o papel passa adiante', () => {
    expect(quemDe(voce({ papel: null, banido: true }), AGORA)).toMatchObject({ papel: null, banido: true })
    expect(quemDe(voce({ papel: 'moderador' }), AGORA)).toMatchObject({ papel: 'moderador', banido: false })
  })
  it('`membroHa` vem de `membroDesde` em segundos, e some quando o relé não disse ou disse nulo', () => {
    expect(quemDe(voce({ membroDesde: '2026-11-05T14:50:00.000Z' }), AGORA).membroHa).toBe(600)
    expect(quemDe(voce({ membroDesde: null }), AGORA).membroHa).toBeUndefined()
    expect(quemDe(voce(), AGORA).membroHa).toBeUndefined()
  })
  it('campos ausentes de um `voce` incompleto valem como "ninguém, não banido"', () => {
    expect(quemDe({} as VoceNaComunidade, AGORA)).toEqual({ papel: null, banido: false, membroHa: undefined })
  })
})
