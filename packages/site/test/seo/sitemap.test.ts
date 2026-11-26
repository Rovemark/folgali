import { describe, expect, it } from 'vitest'
import { contentOf } from '@/content'
import { READY } from '@/lib/i18n'
import { buildSitemap, type SitemapData } from '@/lib/seo/sitemap'
import { ROUTES, sitemapRoutes } from '@/lib/seo/routes'
import { outsideIndex } from '@/lib/seo/policy'

const LANGUAGES = [{ lang: 'pt', hreflang: 'pt-BR' }, { lang: 'en', hreflang: 'en' }]
const base = (extra: Partial<SitemapData> = {}): SitemapData => ({
  aberto: true, base: 'https://x.test', idiomas: LANGUAGES, padrao: 'pt',
  guias: { pt: [{ slug: 'um', atualizadoEm: '2026-11-08' }, { slug: 'so-pt', atualizadoEm: '2026-11-01' }], en: [{ slug: 'um', atualizadoEm: '2026-11-07' }] },
  verbetes: { pt: [{ slug: 'rover', atualizadoEm: '2026-11-08' }], en: [{ slug: 'rover', atualizadoEm: '2026-11-08' }] },
  comunidades: [{ id: 'ob_c1', atividadeEm: '2026-11-08T10:00:00Z' }], paginas: [{ id: 'ob_p1' }],
  ...extra,
})

describe('sitemap', () => {
  it('closed returns an empty list, whatever the content', () => {
    expect(buildSitemap(base({ aberto: false }))).toEqual([])
  })
  it('open: each indexable route appears in each language, with an absolute address', () => {
    const urls = buildSitemap(base()).map((e) => e.url)
    for (const r of sitemapRoutes()) for (const l of ['pt', 'en']) expect(urls, `${l}${r.caminho}`).toContain(`https://x.test/${l}${r.caminho}`)
    for (const u of urls) expect(u).toMatch(/^https:\/\/x\.test\/(pt|en)(\/|$)/)
  })
  it('each entry announces the hreflang of both languages and the x-default on the default', () => {
    const e = buildSitemap(base()).find((x) => x.url === 'https://x.test/en/ajuda')
    expect(e?.alternates?.languages).toEqual({ 'pt-BR': 'https://x.test/pt/ajuda', en: 'https://x.test/en/ajuda', 'x-default': 'https://x.test/pt/ajuda' })
  })
  it('a guide that only exists in Portuguese only enters in Portuguese, and without hreflang for what does not exist', () => {
    const list = buildSitemap(base())
    expect(list.some((e) => e.url === 'https://x.test/pt/guias/so-pt')).toBe(true)
    expect(list.some((e) => e.url === 'https://x.test/en/guias/so-pt')).toBe(false)
    const so = list.find((e) => e.url === 'https://x.test/pt/guias/so-pt')
    expect(so?.alternates?.languages).toEqual({ 'pt-BR': 'https://x.test/pt/guias/so-pt', 'x-default': 'https://x.test/pt/guias/so-pt' })
  })
  it('a guide that only exists in English: the x-default points to English, never to a page that does not exist', () => {
    const list = buildSitemap(base({ guias: { pt: [], en: [{ slug: 'so-en', atualizadoEm: '2026-11-01' }] } }))
    const e = list.find((x) => x.url === 'https://x.test/en/guias/so-en')
    expect(e?.alternates?.languages).toEqual({ en: 'https://x.test/en/guias/so-en', 'x-default': 'https://x.test/en/guias/so-en' })
    expect(list.some((x) => x.url === 'https://x.test/pt/guias/so-en')).toBe(false)
  })
  it('a guide in both languages carries the more recent of the two dates', () => {
    const e = buildSitemap(base()).find((x) => x.url === 'https://x.test/pt/guias/um')
    expect(e?.lastModified).toEqual(new Date('2026-11-08'))
  })
  it('glossary entries, communities and pages enter; an invalid date becomes absent, not an error', () => {
    const list = buildSitemap(base({ comunidades: [{ id: 'ob_c1', atividadeEm: 'lixo' }] }))
    expect(list.some((e) => e.url === 'https://x.test/en/glossario/rover')).toBe(true)
    expect(list.some((e) => e.url === 'https://x.test/pt/paginas/ob_p1')).toBe(true)
    const c = list.find((e) => e.url === 'https://x.test/pt/comunidades/ob_c1')
    expect(c).toBeDefined()
    expect(c?.lastModified).toBeUndefined()
  })
  it('the community id is escaped in the URL', () => {
    const list = buildSitemap(base({ comunidades: [{ id: 'a b/c' }] }))
    expect(list.some((e) => e.url === 'https://x.test/pt/comunidades/a%20b%2Fc')).toBe(true)
  })
  it('no route outside the index (app, search, profile) appears, in any language', () => {
    for (const e of buildSitemap(base())) expect(outsideIndex(e.url.replace(/^https:\/\/x\.test\/(pt|en)/, '') || '/'), e.url).toBe(false)
  })
  it('does not repeat an address', () => {
    const urls = buildSitemap(base()).map((e) => e.url)
    expect(new Set(urls).size).toBe(urls.length)
  })
  it('an external route and a route marked as non-indexable stay out of the sitemap registry', () => {
    const ids = sitemapRoutes().map((r) => r.id)
    for (const r of ROUTES.filter((x) => x.externo !== undefined)) expect(ids).not.toContain(r.id)
    expect(ids).not.toContain('buscar')
    expect(ids).not.toContain('aprovacaoHumana')
  })
  it('with the REAL site content, no address repeats (the registry guide does not enter twice)', () => {
    const real = base({
      guias: Object.fromEntries(READY.map((l) => [l, contentOf(l).guias])),
      verbetes: Object.fromEntries(READY.map((l) => [l, contentOf(l).verbetes])),
    })
    const urls = buildSitemap(real).map((e) => e.url)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.filter((u) => u.endsWith('/guias/como-funciona-a-aprovacao-humana'))).toHaveLength(2)
  })
  it('without a ready language, there is no entry (and it does not break)', () => {
    expect(buildSitemap(base({ idiomas: [] }))).toEqual([])
  })
})
