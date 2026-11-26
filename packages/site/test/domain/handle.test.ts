import { describe, expect, it } from 'vitest'
import { HANDLE_RE, validHandle, normalizeHandle, searchTerm } from '@/lib/domain/handle'

describe('handle', () => {
  it.each(['pipa', 'a_b', 'rover.um', 'x1y', 'a'.repeat(30), '_ab', 'ab_', 'a__b', '1a2'])('accepts %s', (h) => {
    expect(HANDLE_RE.test(h)).toBe(true)
  })
  it.each(['ab', 'a'.repeat(31), '.ab', 'ab.', 'a..b', '123', 'Ab', 'a-b', 'a b', 'ação'])('refuses %s', (h) => {
    expect(HANDLE_RE.test(h)).toBe(false)
  })
  it('normaliza arroba e caixa', () => {
    expect(normalizeHandle('  @Pipa ')).toBe('pipa')
    expect(validHandle('@PIPA')).toBe(true)
    expect(validHandle('@')).toBe(false)
  })
})

describe('termoDeBusca', () => {
  it('tira arroba, acento e caixa', () => {
    expect(searchTerm('  @Éder ')).toBe('eder')
  })
  it('discards symbols and cuts at 30', () => {
    expect(searchTerm("pipa<script>alert(1)</script>")).toBe('pipascriptalert1script')
    expect(searchTerm('a'.repeat(50))).toHaveLength(30)
  })
  it('vazio continua vazio', () => {
    expect(searchTerm('   ')).toBe('')
    expect(searchTerm('@@')).toBe('')
  })
})
