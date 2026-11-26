import { describe, expect, it } from 'vitest'
import { contrast, OG } from '@/lib/seo/og-cores'

describe('Open Graph image colors', () => {
  it('are valid hexadecimals', () => {
    for (const [name, v] of Object.entries(OG)) expect(v, name).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('the text passes 4.5:1 over the background (WCAG AA)', () => {
    expect(contrast(OG.tinta, OG.fundo)).toBeGreaterThan(4.5)
    expect(contrast(OG.softInk, OG.fundo)).toBeGreaterThan(4.5)
    expect(contrast(OG.acao, OG.fundo)).toBeGreaterThan(4.5)
  })
  it('the contrast is symmetric and is 21 between black and white, 1 between equals', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 0)
    expect(contrast('#123456', '#123456')).toBeCloseTo(1, 5)
  })
})
