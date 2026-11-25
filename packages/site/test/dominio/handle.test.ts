import { describe, expect, it } from 'vitest'
import { HANDLE_RE, handleValido, normalizarHandle, termoDeBusca } from '@/lib/dominio/handle'

describe('handle', () => {
  it.each(['pipa', 'a_b', 'rover.um', 'x1y', 'a'.repeat(30), '_ab', 'ab_', 'a__b', '1a2'])('aceita %s', (h) => {
    expect(HANDLE_RE.test(h)).toBe(true)
  })
  it.each(['ab', 'a'.repeat(31), '.ab', 'ab.', 'a..b', '123', 'Ab', 'a-b', 'a b', 'ação'])('recusa %s', (h) => {
    expect(HANDLE_RE.test(h)).toBe(false)
  })
  it('normaliza arroba e caixa', () => {
    expect(normalizarHandle('  @Pipa ')).toBe('pipa')
    expect(handleValido('@PIPA')).toBe(true)
    expect(handleValido('@')).toBe(false)
  })
})

describe('termoDeBusca', () => {
  it('tira arroba, acento e caixa', () => {
    expect(termoDeBusca('  @Éder ')).toBe('eder')
  })
  it('descarta símbolos e corta em 30', () => {
    expect(termoDeBusca("pipa<script>alert(1)</script>")).toBe('pipascriptalert1script')
    expect(termoDeBusca('a'.repeat(50))).toHaveLength(30)
  })
  it('vazio continua vazio', () => {
    expect(termoDeBusca('   ')).toBe('')
    expect(termoDeBusca('@@')).toBe('')
  })
})
