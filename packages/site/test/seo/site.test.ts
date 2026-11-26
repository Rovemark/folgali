import { describe, expect, it } from 'vitest'
import { alternatives, ENTITY, indexable, DEFAULT_BASE_URL, absoluteUrl, urlBase } from '@/lib/site'

describe('indexavel', () => {
  it('is false without the variable and with any value that is not "sim"', () => {
    expect(indexable({})).toBe(false)
    for (const v of ['', 'nao', 'true', '1', 'SIM', 'sim ']) expect(indexable({ FOLGALI_INDEXABLE: v }), v).toBe(false)
  })
  it('is true only with "sim"', () => {
    expect(indexable({ FOLGALI_INDEXABLE: 'sim' })).toBe(true)
  })
})

describe('urlBase', () => {
  it('uses the default without the variable, and removes the slash and the path from whatever comes', () => {
    expect(urlBase({})).toBe(DEFAULT_BASE_URL)
    expect(urlBase({ FOLGALI_BASE_URL: 'https://exemplo.org/' })).toBe('https://exemplo.org')
    expect(urlBase({ FOLGALI_BASE_URL: 'https://exemplo.org/a/b?c=1' })).toBe('https://exemplo.org')
  })
  it('only accepts https, or http on localhost; the rest falls to the default', () => {
    expect(urlBase({ FOLGALI_BASE_URL: 'http://exemplo.org' })).toBe(DEFAULT_BASE_URL)
    expect(urlBase({ FOLGALI_BASE_URL: 'javascript:alert(1)' })).toBe(DEFAULT_BASE_URL)
    expect(urlBase({ FOLGALI_BASE_URL: 'lixo' })).toBe(DEFAULT_BASE_URL)
    expect(urlBase({ FOLGALI_BASE_URL: 'http://localhost:3961' })).toBe('http://localhost:3961')
    expect(urlBase({ FOLGALI_BASE_URL: 'http://127.0.0.1:3961' })).toBe('http://127.0.0.1:3961')
  })
})

describe('urlAbsoluta e alternativas', () => {
  it('monta base, idioma e caminho', () => {
    expect(absoluteUrl('https://x.test', 'pt', '')).toBe('https://x.test/pt')
    expect(absoluteUrl('https://x.test', 'en', '/ajuda')).toBe('https://x.test/en/ajuda')
  })
  it('hreflang per language, plus x-default in the default language', () => {
    const l = alternatives('https://x.test', '/ajuda', [{ lang: 'pt', hreflang: 'pt-BR' }, { lang: 'en', hreflang: 'en' }], 'pt')
    expect(l).toEqual({ 'pt-BR': 'https://x.test/pt/ajuda', en: 'https://x.test/en/ajuda', 'x-default': 'https://x.test/pt/ajuda' })
  })
})

describe('the entity is always the same', () => {
  it('name, company and license match what the footer and the pages say', () => {
    expect(ENTITY.nome).toBe('folgali')
    expect(ENTITY.empresa).toBe('Rovemark')
    expect(ENTITY.siblingProduct).toBe('Rover Hangar')
    expect(ENTITY.licenca).toBe('AGPL-3.0')
    expect(ENTITY.companyUrl).toMatch(/^https:\/\//)
  })
})
