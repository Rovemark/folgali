// The crawling policy: closed by default, opened all at once by the flag, and the credential screens never opened.
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { profileFromAt, proxy } from '@/proxy'
import siteRobots from '@/app/robots'
import { GET as llmsTxt } from '@/app/llms.txt/route'
import { GET as llmsFull } from '@/app/llms-full.txt/route'
import { GET as rss } from '@/app/[lang]/rss.xml/route'
import { META, READY } from '@/lib/i18n'
import { robotsHeader, robotsDisallows, outsideIndex, metaRobots, patternToRegex, routePolicy, AI_CRAWLERS, robotsRules, ROUTES_OUTSIDE_INDEX } from '@/lib/seo/policy'
import { ROUTES } from '@/lib/seo/routes'
import { internalMark } from '@/lib/security/internal-mark'

afterEach(() => vi.unstubAllEnvs())

const CLOSED = 'noindex, nofollow, noarchive'
const OPEN = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
const publicRoutes = ROUTES.filter((r) => r.externo === undefined)

describe('flag off (the default): nothing is indexable, anywhere', () => {
  it('every route in the registry, in every language, comes out noindex', () => {
    for (const l of READY) for (const r of publicRoutes) expect(routePolicy(`/${l}${r.caminho}`, false), `${l}${r.caminho}`).toEqual({ index: false, follow: false, arquivo: false })
  })
  it('the header and the robots meta say noindex and nofollow', () => {
    const p = routePolicy('/pt', false)
    expect(robotsHeader(p)).toBe(CLOSED)
    expect(metaRobots(p)).toMatchObject({ index: false, follow: false, noarchive: true })
  })
  it('robots.txt closes everything and does not announce a sitemap', () => {
    expect(robotsRules(false, 'https://x.test')).toEqual({ rules: { userAgent: '*', disallow: '/' } })
  })
  it('the proxy puts noindex on a page, a machine file and an image', () => {
    vi.stubEnv('FOLGALI_INDEXABLE', '')
    for (const path of ['/pt', '/pt/ajuda', '/pt/aprovar', '/robots.txt', '/sitemap.xml', '/llms.txt', '/og/pt/padrao', '/marca/icone.svg']) {
      const res = proxy(new NextRequest(`https://x.test${path}`))
      expect(res.headers.get('x-robots-tag'), path).toBe(CLOSED)
    }
  })
  it('only the exact value "sim" turns it on: true, 1, SIM and empty stay closed', () => {
    for (const v of ['true', '1', 'SIM', 'Sim', ' sim', 'yes', '']) {
      vi.stubEnv('FOLGALI_INDEXABLE', v)
      expect(proxy(new NextRequest('https://x.test/pt')).headers.get('x-robots-tag'), v).toBe(CLOSED)
    }
  })
  it('llms.txt, llms-full.txt and the RSS do not exist (404, with noindex)', async () => {
    vi.stubEnv('FOLGALI_INDEXABLE', '')
    for (const r of [llmsTxt(), llmsFull(), await rss(new Request('https://x.test/pt/rss.xml'), { params: Promise.resolve({ lang: 'pt' }) })]) {
      expect(r.status).toBe(404)
      expect(r.headers.get('x-robots-tag')).toBe(CLOSED)
    }
  })
  it('robots.ts, read from the environment, also comes out closed', () => {
    vi.stubEnv('FOLGALI_INDEXABLE', '')
    expect(siteRobots()).toEqual({ rules: { userAgent: '*', disallow: '/' } })
  })
})

describe('flag on ("sim"): everything opens at once, except what depends on a credential', () => {
  it('the public content becomes indexable and citable', () => {
    // search and the "Meu rover" dashboard are in the registry but always stay out of the index (a search result; a screen that depends on the paired app)
    // the report (/denunciar) also stays out of the index: it is a form, not content
    for (const l of READY) for (const r of publicRoutes.filter((x) => x.caminho !== '/buscar' && x.caminho !== '/inicio' && x.caminho !== '/denunciar')) expect(routePolicy(`/${l}${r.caminho}`, true), `${l}${r.caminho}`).toEqual({ index: true, follow: true, arquivo: true })
    expect(robotsHeader(routePolicy('/pt/ajuda', true))).toBe(OPEN)
  })
  it('the proxy changes the header of all responses at the same time', () => {
    vi.stubEnv('FOLGALI_INDEXABLE', 'sim')
    for (const path of ['/pt', '/en/ajuda', '/robots.txt', '/sitemap.xml', '/llms.txt', '/og/pt/padrao']) {
      expect(proxy(new NextRequest(`https://x.test${path}`)).headers.get('x-robots-tag'), path).toBe(OPEN)
    }
  })
  it('robots.txt allows the content, lists the AI crawlers and announces the sitemap', () => {
    vi.stubEnv('FOLGALI_INDEXABLE', 'sim')
    const r = siteRobots()
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/)
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules]
    const agents = rules.map((x) => x.userAgent)
    expect(agents).toContain('*')
    for (const a of AI_CRAWLERS) expect(agents, a.agente).toContain(a.agente)
    // third parties do not train on the content without an agreement (Terms 8.3-A): the training crawlers get Disallow: /
    for (const x of rules) {
      const blocked = AI_CRAWLERS.find((r) => r.agente === x.userAgent)?.bloqueado === true
      if (blocked) {
        expect(x.allow, String(x.userAgent)).toBeUndefined()
        expect(x.disallow, String(x.userAgent)).toBe('/')
      } else {
        expect(x.allow).toBe('/')
        expect(x.disallow).toEqual(robotsDisallows())
      }
    }
    for (const a of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot', 'PerplexityBot', 'Bytespider', 'Applebot-Extended']) {
      expect(AI_CRAWLERS.find((r) => r.agente === a)?.bloqueado, a).toBe(true)
    }
    for (const a of AI_CRAWLERS.filter((r) => r.papel === 'treino')) expect(a.bloqueado, a.agente).toBe(true)
  })
})

describe('what depends on a credential or a person never enters the index, even with the flag on', () => {
  const OUTSIDE = ['/pt/aprovar', '/pt/aprovar/x', '/pt/avisos', '/pt/amigos', '/pt/inicio', '/ar/inicio', '/pt/inicio?x=1', '/pt/app/aprovar', '/pt/denunciar/ob_x', '/pt/buscar', '/pt/r/max', '/pt/comunidades/nova', '/pt/paginas/nova', '/pt/comunidades/ob_x/gerir', '/pt/comunidades/ob_x/novo', '/pt/comunidades/ob_x/membros', '/pt/comunidades/ob_x/moderacao', '/pt/comunidades/ob_x/apelar', '/pt/paginas/ob_x/gerir', '/pt/t/ob_x/editar']
  it.each(OUTSIDE)('%s', (path) => {
    expect(routePolicy(path, true).index).toBe(false)
    expect(robotsHeader(routePolicy(path, true))).toMatch(/^noindex/)
  })
  it('rover profile and search do not enter the index, but their links may be followed', () => {
    expect(routePolicy('/pt/r/max', true)).toEqual({ index: false, follow: true, arquivo: false })
    expect(routePolicy('/pt/buscar', true)).toEqual({ index: false, follow: true, arquivo: false })
    expect(routePolicy('/pt/aprovar', true)).toEqual({ index: false, follow: false, arquivo: false })
    expect(routePolicy('/pt/inicio', true)).toEqual({ index: false, follow: false, arquivo: false })
  })
  it('the "Meu rover" dashboard is in the registry, out of the sitemap and out of the index; the cover (/pt) stays open', () => {
    const r = ROUTES.find((x) => x.caminho === '/inicio')
    expect(r).toMatchObject({ id: 'meuRover', indexable: false, secao: null })
    expect(routePolicy('/pt', true).index).toBe(true)
    expect(outsideIndex('/inicio')).toBe(true)
    expect(outsideIndex('/inicios')).toBe(false)
    expect(robotsDisallows()).toEqual(expect.arrayContaining(['/*/inicio$', '/*/inicio/', '/*/inicio?']))
  })
  it('public content next to those routes stays open (no prefix collision)', () => {
    for (const ok of ['/pt/regras', '/pt/rss.xml', '/pt/recursos', '/pt/comunidades', '/pt/comunidades/ob_x', '/pt/comunidades/ob_x/sobre', '/pt/comunidades/ob_x/registro', '/pt/t/ob_x', '/pt/paginas/ob_x', '/pt/p/ob_x', '/pt/appendice', '/pt/amigosde']) {
      expect(routePolicy(ok, true).index, ok).toBe(true)
    }
  })
  it('the query and the trailing slash do not escape the list', () => {
    expect(outsideIndex('/aprovar?x=1')).toBe(true)
    expect(outsideIndex('/aprovar/')).toBe(true)
    expect(outsideIndex('/buscar?q=oi')).toBe(true)
  })
  it('each pattern becomes a regex that matches its own route and not the neighbor', () => {
    expect(patternToRegex('/r/**').test('/r/max')).toBe(true)
    expect(patternToRegex('/r/**').test('/regras')).toBe(false)
    expect(patternToRegex('/comunidades/*/gerir').test('/comunidades/ob_x/gerir')).toBe(true)
    expect(patternToRegex('/comunidades/*/gerir').test('/comunidades/ob_x/y/gerir')).toBe(false)
    expect(patternToRegex('/buscar').test('/buscar')).toBe(true)
    expect(patternToRegex('/buscar').test('/buscarx')).toBe(false)
  })
  it('robots.txt has three precise lines per pattern (exact, children, query) and none per loose prefix', () => {
    const d = robotsDisallows()
    expect(d).toHaveLength(ROUTES_OUTSIDE_INDEX.length * 3)
    expect(d).toContain('/*/aprovar$')
    expect(d).toContain('/*/aprovar/')
    expect(d).toContain('/*/aprovar?')
    expect(d).toContain('/*/r/')
    expect(d).not.toContain('/*/r')
    for (const line of d) expect(line, line).toMatch(/^\/\*\/[^\s]+(\$|\/|\?)$/)
  })
})

describe('proxy: addresses without a language', () => {
  it('machine files and images pass without redirecting', () => {
    for (const c of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt', '/og/pt/ajuda', '/marca/icone.svg', '/saude']) {
      const res = proxy(new NextRequest(`https://x.test${c}`))
      expect(res.status, c).toBe(200)
      expect(res.headers.get('location'), c).toBeNull()
    }
  })
  it('a page without a language redirects (307) to the browser\'s language, and a language still without text falls back to English', () => {
    const r1 = proxy(new NextRequest('https://x.test/ajuda', { headers: { 'accept-language': 'en-US,en;q=0.9' } }))
    expect(r1.status).toBe(307)
    expect(r1.headers.get('location')).toBe('https://x.test/en/ajuda')
    const fr = proxy(new NextRequest('https://x.test/ajuda', { headers: { 'accept-language': 'fr-FR,fr;q=0.9' } }))
    expect(fr.headers.get('location')).toBe('https://x.test/fr/ajuda')
    // with all 12 languages ready there is no pending language in real life: simulates one to prove the fall back to English path is still alive
    const before = META.ko.pronto
    META.ko.pronto = false
    try {
      const r2 = proxy(new NextRequest('https://x.test/ko/ajuda'))
      expect(r2.headers.get('location')).toBe('https://x.test/en/ajuda')
    } finally {
      META.ko.pronto = before
    }
  })
})

describe('proxy: content that does not exist', () => {
  it('a nonexistent glossary entry and guide become a rewritten 404, noindex, with the request address intact', () => {
    for (const c of ['/pt/glossario/nao-existe', '/en/guias/nao-existe']) {
      const res = proxy(new NextRequest(`https://x.test${c}`))
      expect(res.status, c).toBe(404)
      expect(res.headers.get('x-middleware-rewrite'), c).toContain('/endereco-inexistente')
      expect(res.headers.get('x-robots-tag'), c).toBe('noindex, nofollow')
    }
  })
  it('the internal 404 route also stays out of the index, so the final header does not say index', () => {
    expect(outsideIndex('/endereco-inexistente')).toBe(true)
    expect(robotsHeader(routePolicy('/pt/endereco-inexistente', true))).toContain('noindex')
  })
  it('the request marked by the 404 route becomes the 404 page with the whole site, with the original address for the screens', () => {
    const res = proxy(new NextRequest('https://x.test/pt/qualquer/coisa', { headers: { 'x-folgali-404': internalMark() } }))
    expect(res.status).toBe(404)
    expect(res.headers.get('x-middleware-rewrite')).toContain('/pt/endereco-inexistente')
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/pt/qualquer/coisa')
    // the mark does not reach the page
    expect(res.headers.get('x-middleware-request-x-folgali-404')).toBeNull()
  })
  it('F-09: the 404 header sent by a visitor is dropped: the page renders as usual, and the header never reaches the pages', () => {
    for (const value of ['1', 'sim', '0'.repeat(64), internalMark().slice(1) + '0']) {
      const res = proxy(new NextRequest('https://x.test/pt/linha', { headers: { 'x-folgali-404': value } }))
      expect(res.status, value).toBe(200)
      expect(res.headers.get('x-middleware-rewrite'), value).toBeNull()
      expect(res.headers.get('x-middleware-request-x-folgali-404'), value).toBeNull()
      expect(res.headers.get('x-middleware-request-x-pathname'), value).toBe('/pt/linha')
    }
  })
  it('a glossary entry that exists goes on as normal', () => {
    const res = proxy(new NextRequest('https://x.test/pt/glossario/rover'))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })
})

describe('proxy: short profile address with @', () => {
  it('/{lang}/@handle and /@handle lead to the profile with 308, with the @ raw or as %40', () => {
    const cases: [string, string][] = [
      ['/pt/@roverluna', 'https://x.test/pt/r/roverluna'],
      ['/pt/%40roverluna', 'https://x.test/pt/r/roverluna'],
      ['/en/@RoverLuna/', 'https://x.test/en/r/roverluna'],
      ['/pt/@marina.costa', 'https://x.test/pt/r/marina.costa'],
    ]
    for (const [from, to] of cases) {
      const res = proxy(new NextRequest(`https://x.test${from}`))
      expect(res.status, from).toBe(308)
      expect(res.headers.get('location'), from).toBe(to)
    }
  })
  it('without a language it picks by the browser', () => {
    const res = proxy(new NextRequest('https://x.test/@roverluna', { headers: { 'accept-language': 'fr-FR,fr;q=0.9' } }))
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('https://x.test/fr/r/roverluna')
    const pt = proxy(new NextRequest('https://x.test/%40roverluna'))
    expect(pt.headers.get('location')).toBe('https://x.test/pt/r/roverluna')
  })
  it('a malformed handle or a longer path does not become a profile', () => {
    for (const c of ['/pt/@ab', '/pt/@a..b', '/pt/@x/y', '/pt/@%E0%A4%A', '/xx/@roverluna']) {
      expect(profileFromAt(c, null), c).toBeNull()
    }
  })
})
