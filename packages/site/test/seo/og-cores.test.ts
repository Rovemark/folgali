import { describe, expect, it } from 'vitest'
import { contraste, OG } from '@/lib/seo/og-cores'

describe('cores da imagem Open Graph', () => {
  it('são hexadecimais válidos', () => {
    for (const [nome, v] of Object.entries(OG)) expect(v, nome).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('o texto passa de 4,5:1 sobre o fundo (WCAG AA)', () => {
    expect(contraste(OG.tinta, OG.fundo)).toBeGreaterThan(4.5)
    expect(contraste(OG.tintaSuave, OG.fundo)).toBeGreaterThan(4.5)
    expect(contraste(OG.acao, OG.fundo)).toBeGreaterThan(4.5)
  })
  it('o contraste é simétrico e vale 21 entre preto e branco, 1 entre iguais', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 0)
    expect(contraste('#123456', '#123456')).toBeCloseTo(1, 5)
  })
})
