// Edge cases that the mutation testing (scripts/mutation-seo.mjs) pointed out as survivors in the first round (74.57 %): exact
// header and meta values, text cuts, structured data identifiers, sitemap dates and the base address.
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { contentOf } from '@/content'
import { application, technicalArticle, faq, page, forumPost, definedTerm } from '@/lib/seo/jsonld'
import { routeMeta, summarize } from '@/lib/seo/metadata'
import { screenMeta } from '@/lib/seo/meta-screens'
import { contrast } from '@/lib/seo/og-cores'
import { robotsHeader, robotsDisallows, outsideIndex, metaRobots, patternToRegex, routePolicy } from '@/lib/seo/policy'
import { missingContent } from '@/lib/seo/exists'
import { buildSitemap } from '@/lib/seo/sitemap'
import { absoluteUrl, urlBase } from '@/lib/site'
import { proxy } from '@/proxy'

describe('crawling policy: exact values', () => {
  it('header: noindex with or without follow, and the open one with the snippet limits', () => {
    expect(robotsHeader({ index: false, follow: false, arquivo: false })).toBe('noindex, nofollow, noarchive')
    expect(robotsHeader({ index: false, follow: true, arquivo: false })).toBe('noindex, follow, noarchive')
    expect(robotsHeader({ index: true, follow: true, arquivo: true })).toBe('index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1')
  })
  it('meta robots: fechado, fechado seguindo links e aberto', () => {
    expect(metaRobots({ index: false, follow: false, arquivo: false })).toEqual({ index: false, follow: false, nocache: true, noarchive: true, googleBot: { index: false, follow: false } })
    expect(metaRobots({ index: false, follow: true, arquivo: false })).toEqual({ index: false, follow: true, nocache: true, noarchive: true, googleBot: { index: false, follow: true } })
    expect(metaRobots({ index: true, follow: true, arquivo: true })).toMatchObject({ index: true, follow: true, googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large', 'max-video-preview': -1 } })
  })
  it('only profile and search follow links; the rest of the closed routes do not follow, even with /r/ in the middle of the path', () => {
    expect(routePolicy('/pt/r/pipa', true)).toEqual({ index: false, follow: true, arquivo: false })
    expect(routePolicy('/pt/buscar', true)).toEqual({ index: false, follow: true, arquivo: false })
    expect(routePolicy('/pt/aprovar', true)).toEqual({ index: false, follow: false, arquivo: false })
    expect(routePolicy('/pt/comunidades/r/membros', true).follow).toBe(false)
  })
  it('the exact route, the trailing slash and what comes below match; similar neighbors do not', () => {
    expect(outsideIndex('/buscar/')).toBe(true)
    expect(outsideIndex('/buscar')).toBe(true)
    expect(outsideIndex('/buscares')).toBe(false)
    expect(outsideIndex('/aprovar/x/y')).toBe(true)
    expect(outsideIndex('/aprovarx')).toBe(false)
  })
  it('special pattern characters are literal', () => {
    expect(patternToRegex('/a.b').test('/a.b')).toBe(true)
    expect(patternToRegex('/a.b').test('/aXb')).toBe(false)
  })
  it('robots.txt has the language wildcard in front of each line', () => {
    const d = robotsDisallows()
    expect(d).toContain('/*/aprovar$')
    expect(d).toContain('/*/aprovar/')
    expect(d).toContain('/*/aprovar?')
    expect(d.every((l) => l.startsWith('/*/'))).toBe(true)
  })
})

describe('base address', () => {
  it('trims spaces, ignores empty, refuses http outside localhost and accepts localhost', () => {
    expect(urlBase({ FOLGALI_BASE_URL: '  https://a.test/  ' })).toBe('https://a.test')
    expect(urlBase({ FOLGALI_BASE_URL: '   ' })).toBe('https://folgali.com')
    expect(urlBase({})).toBe('https://folgali.com')
    expect(urlBase({ FOLGALI_BASE_URL: 'http://a.test' })).toBe('https://folgali.com')
    expect(urlBase({ FOLGALI_BASE_URL: 'ftp://a.test' })).toBe('https://folgali.com')
    expect(urlBase({ FOLGALI_BASE_URL: 'http://localhost:3000' })).toBe('http://localhost:3000')
    expect(urlBase({ FOLGALI_BASE_URL: 'não é url' })).toBe('https://folgali.com')
  })
  it('absoluteUrl without a path is the language\'s home', () => {
    expect(absoluteUrl('https://a.test', 'pt')).toBe('https://a.test/pt')
    expect(absoluteUrl('https://a.test', 'pt', '/ajuda')).toBe('https://a.test/pt/ajuda')
  })
})

describe('metadados: cortes e rotas', () => {
  it('summarize: at the limit it does not cut, over it cuts at a word, removes trailing punctuation and adds an ellipsis', () => {
    expect(summarize('abc def', 7)).toBe('abc def')
    expect(summarize('  muitos   espaços  ')).toBe('muitos espaços')
    expect(summarize('um dois três quatro cinco seis, sete oito nove', 30)).toBe('um dois três quatro cinco…')
    expect(summarize('palavraenormesemespaconenhum e fim', 12)).toBe('palavraenor…')
    expect(summarize('a b c d e f g h i j k l m n o p', 20).endsWith('…')).toBe(true)
  })
  it('an unknown or external route is an error, not empty metadata', () => {
    expect(() => routeMeta('pt', 'nao-existe')).toThrow('rota interna desconhecida: nao-existe')
    expect(() => routeMeta('pt', 'rovemark')).toThrow('rota interna desconhecida: rovemark')
  })
  it('routeMeta uses the route\'s path, title and description', () => {
    const m = routeMeta('pt', 'ajuda', { FOLGALI_BASE_URL: 'https://a.test' })
    expect(m.alternates?.canonical).toBe('https://a.test/pt/ajuda')
    expect(m.description).toBeTruthy()
  })
  it('screenMeta: its own description is trimmed and compacted; without it, title followed by the entity\'s sentence', () => {
    expect(screenMeta('pt', '/x', 'Título', '  uma   descrição  ').description).toBe('uma descrição')
    expect(screenMeta('pt', '/x', 'Título', '   ').description).toMatch(/^Título\. /)
    expect(screenMeta('pt', '/x', 'Título').description).toMatch(/^Título\. /)
  })
})

describe('dados estruturados: identificadores e campos', () => {
  const BASE = 'https://a.test'
  it('WebPage: default type, page id and dateModified only when it exists', () => {
    const p = page(BASE, { url: `${BASE}/pt/x`, titulo: 'T', descricao: 'D', lang: 'pt' })
    expect(p['@type']).toBe('WebPage')
    expect(p['@id']).toBe(`${BASE}/pt/x#pagina`)
    expect('dateModified' in p).toBe(false)
    const q = page(BASE, { tipo: 'AboutPage', url: `${BASE}/pt/x`, titulo: 'T', descricao: 'D', lang: 'pt', atualizadoEm: '2026-11-08' })
    expect(q['@type']).toBe('AboutPage')
    expect(q.dateModified).toBe('2026-11-08')
  })
  it('FAQPage: trim when the short answer is empty', () => {
    const f = faq([{ pergunta: 'P?', respostaCurta: '', resposta: 'R.' }])
    expect((f.mainEntity as { acceptedAnswer: { text: string } }[])[0].acceptedAnswer.text).toBe('R.')
  })
  it('glossary entry, guide, application and topic carry the id with the right fragment', () => {
    const v = contentOf('pt').verbetes[0]
    expect(definedTerm(BASE, 'pt', v, 'id-conjunto')['@id']).toBe(`${BASE}/pt/glossario/${v.slug}#termo`)
    const g = contentOf('pt').guias[0]
    expect(technicalArticle(BASE, 'pt', g)['@id']).toBe(`${BASE}/pt/guias/${g.slug}#artigo`)
    const a = application(BASE)
    expect(String(a['@id'])).toMatch(/\/#aplicativo$/)
    expect(a.isRelatedTo).toEqual({ '@id': `${BASE}/#organizacao` })
    const t = forumPost({ url: `${BASE}/pt/t/1`, titulo: 'T', texto: 'x', autor: 'a', criadoEm: '2026-11-08', respostas: 3, lang: 'pt' })
    expect(t['@id']).toBe(`${BASE}/pt/t/1#topico`)
    expect(t.interactionStatistic).toEqual({ '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: 3 })
  })
})

describe('contraste', () => {
  it('WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
    expect(contrast('#0a0a0a', '#000000')).toBeCloseTo(1.05, 1)
    expect(contrast('#123456', '#123456')).toBe(1)
  })
})

describe('sitemap: dates and frequencies', () => {
  const LANGUAGES = [{ lang: 'pt', hreflang: 'pt-BR' }, { lang: 'en', hreflang: 'en' }]
  const d = (extra = {}) => ({
    aberto: true, base: 'https://x.test', idiomas: LANGUAGES, padrao: 'pt',
    guias: { pt: [{ slug: 'g', atualizadoEm: '2026-11-08' }], en: [{ slug: 'g', atualizadoEm: '2026-11-03' }] },
    verbetes: { pt: [], en: [] }, comunidades: [{ id: 'ob_c', atividadeEm: '2026-11-08T10:00:00Z' }], paginas: [{ id: 'ob_p' }], ...extra,
  })
  it('a registry route carries frequency and priority; the guide\'s date is the most recent among the languages, in any order', () => {
    const list = buildSitemap(d())
    const home = list.find((e) => e.url === 'https://x.test/pt')
    expect(home).toMatchObject({ changeFrequency: 'daily', priority: 1 })
    expect(list.find((e) => e.url === 'https://x.test/en/guias/g')?.lastModified).toEqual(new Date('2026-11-08'))
    const inverted = buildSitemap(d({ guias: { en: [{ slug: 'g', atualizadoEm: '2026-11-03' }], pt: [{ slug: 'g', atualizadoEm: '2026-11-08' }] } }))
    expect(inverted.find((e) => e.url === 'https://x.test/pt/guias/g')?.lastModified).toEqual(new Date('2026-11-08'))
    expect(buildSitemap(d({ guias: { pt: [{ slug: 'g', atualizadoEm: '2026-11-03' }], en: [{ slug: 'g', atualizadoEm: '2026-11-03' }] } })).find((e) => e.url === 'https://x.test/pt/guias/g')?.lastModified).toEqual(new Date('2026-11-03'))
  })
  it('community and page carry daily frequency and priority; without an activity date the date is absent', () => {
    const list = buildSitemap(d())
    expect(list.find((e) => e.url === 'https://x.test/pt/comunidades/ob_c')).toMatchObject({ changeFrequency: 'daily', priority: 0.6 })
    const p = list.find((e) => e.url === 'https://x.test/pt/paginas/ob_p')
    expect(p).toMatchObject({ changeFrequency: 'daily', priority: 0.5 })
    expect(p?.lastModified).toBeUndefined()
  })
  it('guides and glossary entries carry monthly frequency', () => {
    expect(buildSitemap(d()).find((e) => e.url === 'https://x.test/pt/guias/g')).toMatchObject({ changeFrequency: 'monthly', priority: 0.7 })
  })
})

describe('proxy: detalhes', () => {
  it('the root without a language goes to /pt or /en with no stray slash', () => {
    const r = proxy(new NextRequest('https://x.test/', { headers: { 'accept-language': 'pt-BR' } }))
    expect(r.status).toBe(307)
    expect(new URL(r.headers.get('location') as string).pathname).toBe('/pt')
  })
  it('an address with a language goes on with the path in the request header', () => {
    const r = proxy(new NextRequest('https://x.test/pt/ajuda'))
    expect(r.headers.get('x-middleware-request-x-pathname')).toBe('/pt/ajuda')
  })
})

describe('conteudoInexistente: bordas', () => {
  it('only counts with the language in the first position and accepts a slug with a valid escape', () => {
    expect(missingContent('/a/pt/glossario/zzz')).toBe(false)
    const v = contentOf('pt').verbetes[0].slug
    expect(missingContent(`/pt/glossario/${encodeURIComponent(v)}`)).toBe(false)
    expect(missingContent(`/pt/glossario/%${v.charCodeAt(0).toString(16)}${v.slice(1)}`)).toBe(false)
  })
})
