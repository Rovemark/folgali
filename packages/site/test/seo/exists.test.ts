import { describe, expect, it } from 'vitest'
import { contentOf } from '@/content'
import { missingContent } from '@/lib/seo/exists'

describe('conteudoInexistente', () => {
  it('recognizes glossary entries and guides that exist, in both languages', () => {
    for (const lang of ['pt', 'en'] as const) {
      for (const v of contentOf(lang).verbetes) expect(missingContent(`/${lang}/glossario/${v.slug}`)).toBe(false)
      for (const g of contentOf(lang).guias) expect(missingContent(`/${lang}/guias/${g.slug}`)).toBe(false)
    }
  })
  it('flags a slug that does not exist, with or without a trailing slash', () => {
    expect(missingContent('/pt/glossario/nao-existe')).toBe(true)
    expect(missingContent('/en/guias/nao-existe/')).toBe(true)
  })
  it('a guide slug does not count as a glossary entry and vice versa', () => {
    const guide = contentOf('pt').guias[0].slug
    const glossaryEntry = contentOf('pt').verbetes[0].slug
    if (!contentOf('pt').verbetes.some((v) => v.slug === guide)) expect(missingContent(`/pt/glossario/${guide}`)).toBe(true)
    if (!contentOf('pt').guias.some((g) => g.slug === glossaryEntry)) expect(missingContent(`/pt/guias/${glossaryEntry}`)).toBe(true)
  })
  it('a slug with an invalid escape is nonexistent instead of breaking', () => {
    expect(missingContent('/pt/glossario/%E0%A4%A')).toBe(true)
  })
  it('does not touch what is not a content page', () => {
    for (const p of ['/pt', '/pt/ajuda', '/pt/glossario', '/pt/guias', '/pt/glossario/a/b', '/xx/glossario/rover', '/pt/comunidades/x']) expect(missingContent(p)).toBe(false)
  })
})
