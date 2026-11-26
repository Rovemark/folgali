import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { labelOf } from '@/lib/i18n-extra'
import { ROUTES } from '@/lib/seo/routes'

const source = readFileSync('src/components/PageNotFound.tsx', 'utf8')
const suggestions = [...(/const SUGGESTIONS = \[([^\]]+)\]/.exec(source)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])

afterEach(() => vi.unstubAllGlobals())

describe('useful 404', () => {
  it('suggests at least four parts of the site', () => {
    expect(suggestions.length).toBeGreaterThanOrEqual(4)
  })
  it.each(suggestions)('the suggestion %s exists in the route registry, is internal and has a label in both languages', (id) => {
    const r = ROUTES.find((x) => x.id === id)
    expect(r, `route ${id}`).toBeDefined()
    expect(r!.caminho.startsWith('/')).toBe(true)
    expect(labelOf('pt', id).length).toBeGreaterThan(0)
    expect(labelOf('en', id).length).toBeGreaterThan(0)
  })
  it('a nonexistent address in a valid language really answers 404, noindex, with the main paths', async () => {
    const { GET } = await import('@/app/[lang]/[...resto]/route')
    for (const lang of ['pt', 'en']) {
      const r = await GET(new Request(`http://x/${lang}/nada/aqui`), { params: Promise.resolve({ lang }) })
      const html = await r.text()
      expect(r.status).toBe(404)
      expect(html).toContain('name="robots" content="noindex"')
      expect(html).toContain(`href="/${lang}/ajuda"`)
      expect(html).toContain(`href="/${lang}"`)
      expect(html).not.toContain('—')
    }
  })
  it('an unknown language falls to the default instead of breaking', async () => {
    const { GET } = await import('@/app/[lang]/[...resto]/route')
    const r = await GET(new Request('http://x/xx/y'), { params: Promise.resolve({ lang: 'xx' }) })
    expect(r.status).toBe(404)
    expect(await r.text()).toContain('lang="pt-BR"')
  })
  it('the body is the 404 page with the whole site (header and footer), requested from this server, and the status stays 404', async () => {
    const requests: string[] = []
    const complete = '<!DOCTYPE html><html><body><header class="topo">menu</header><main>404</main><footer class="rodape">rodapé</footer></body></html>'
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      requests.push(`${url} ${new Headers(init.headers).get('x-folgali-404')}`)
      return new Response(complete, { status: 404, headers: { 'content-type': 'text/html' } })
    })
    const { GET } = await import('@/app/[lang]/[...resto]/route')
    const r = await GET(new Request('http://x/pt/nada/aqui'), { params: Promise.resolve({ lang: 'pt' }) })
    expect(r.status).toBe(404)
    expect(r.headers.get('x-robots-tag')).toContain('noindex')
    const html = await r.text()
    expect(html).toContain('class="topo"')
    expect(html).toContain('class="rodape"')
    expect(requests).toEqual(['http://x/pt/nada/aqui 1'])
  })
  it('the 404 page has search, useful paths, the forest scene and noindex', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const mod = await import('@/app/[lang]/endereco-inexistente/page')
    const html = renderToStaticMarkup(await mod.default({ params: Promise.resolve({ lang: 'pt' }) }))
    expect(html).toContain('role="search"')
    expect(html).toContain('action="/pt/buscar"')
    expect(html).toContain('/marca/folgali/scenes/404-forest.webp')
    for (const id of suggestions) expect(html).toContain(`href="/pt${ROUTES.find((x) => x.id === id)!.caminho}"`)
    const meta = await mod.generateMetadata({ params: Promise.resolve({ lang: 'pt' }) })
    expect(meta.robots).toEqual({ index: false, follow: false })
  })
})
