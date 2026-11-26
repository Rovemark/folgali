// The footer: the four short columns, the legal line and the closing strip come from the registry (`FOOTER`), each link points to a real page.tsx,
// the ten links that legal requires are there, every route on the map is still reachable (in the footer or in the site map, which the footer
// links to), the art and brand notice is there, and there is no cookie, tracking or script. (The sweep "every link answers 200 in the preview" is
// scripts/sweep-footer.mjs.)
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ pathname: { valor: '/pt/ajuda' } }))
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname.valor, useSearchParams: () => new URLSearchParams('') }))

import SiteMap from '@/components/SiteMap'
import Footer from '@/components/Footer'
import { entity } from '@/content'
import { dict, READY } from '@/lib/i18n'
import { legalDict } from '@/lib/legal-i18n'
import { pageOf, footerDict, labelOf } from '@/lib/i18n-extra'
import { FOOTER_COLUMNS, FOOTER, ROUTES, MAP_SECTIONS, sectionRoutes, footerRoutes, allFromFooter, type Route } from '@/lib/seo/routes'

/** The ten links that legal requires in the footer, on every page and language. */
const REQUIRED_LEGAL = ['termos', 'privacidade', 'cookies', 'regras', 'moderacaoPolitica', 'direitosAutorais', 'idade', 'termosDesenvolvedores', 'contato', 'denunciar']

const root = join(__dirname, '..', '..')

/** `/guias/como-funciona-a-aprovacao-humana` -> the `guias/[slug]` folder: a dynamic segment matches anything. */
function pageExists(path: string): boolean {
  const segs = path.split('/').filter(Boolean)
  let dir = join(root, 'src/app/[lang]')
  for (const s of segs) {
    const exact = join(dir, s)
    if (existsSync(exact)) {
      dir = exact
      continue
    }
    const dynamic_ = ['[slug]', '[id]', '[handle]'].map((x) => join(dir, x)).find((x) => existsSync(x))
    if (!dynamic_) return false
    dir = dynamic_
  }
  return existsSync(join(dir, 'page.tsx'))
}

describe('every route in the registry has a real page', () => {
  it.each(ROUTES.filter((r) => r.externo === undefined).map((r) => [r.id, r.caminho]))('%s (%s)', (_id, path) => {
    expect(pageExists(path as string)).toBe(true)
  })
  it('the checker does not accept an invented route', () => {
    expect(pageExists('/isto-nao-existe')).toBe(false)
    expect(pageExists('/desenvolvedores/nao-existe')).toBe(false)
  })
})

describe('the footer registry', () => {
  it('every footer route exists in the registry and appears only once', () => {
    const ids = Object.values(FOOTER).flat()
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(ROUTES.some((r) => r.id === id), id).toBe(true)
  })
  it('at most four columns, each with at most six links: the footer does not bloat again', () => {
    expect(FOOTER_COLUMNS.length).toBeLessThanOrEqual(4)
    for (const c of FOOTER_COLUMNS) {
      expect(FOOTER[c].length, c).toBeGreaterThan(0)
      expect(FOOTER[c].length, c).toBeLessThanOrEqual(6)
    }
    expect(FOOTER.base).toEqual(['termos', 'privacidade', 'cookies'])
  })
  it('the ten mandatory legal links are in the footer', () => {
    const ids = allFromFooter().map((r) => r.id)
    for (const id of REQUIRED_LEGAL) expect(ids, id).toContain(id)
  })
  it('no route on the map is left without a path: it is either in the footer or in the site map, which the footer links to', () => {
    const inFooter = new Set(allFromFooter().map((r) => r.id))
    expect(inFooter.has('mapaDoSite')).toBe(true)
    const inMap = new Set(MAP_SECTIONS.flatMap((s) => sectionRoutes(s).map((r) => r.id)))
    for (const r of ROUTES.filter((x) => x.secao !== null)) expect(inFooter.has(r.id) || inMap.has(r.id), r.id).toBe(true)
    // and every group on the map has a known name (a route with a section outside the groups would vanish from the map)
    for (const r of ROUTES.filter((x) => x.secao !== null)) expect(MAP_SECTIONS, r.id).toContain(r.secao)
  })
})

/** A route's link, with the language's label and the language's address (or the external one, with noopener and a notice). */
function checkLink(link: HTMLElement, route: Route, lang: 'pt' | 'en') {
  if (route.externo !== undefined) {
    expect(link).toHaveAttribute('href', route.externo)
    expect(link).toHaveAttribute('rel', 'noopener')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.textContent).toContain(footerDict(lang).abreEmNovaAba)
  } else {
    expect(link).toHaveAttribute('href', `/${lang}${route.caminho}`)
  }
}

describe.each(['pt', 'en'] as const)('Footer in %s', (lang) => {
  const r = footerDict(lang)
  const render_ = (isDemo = true) => render(<Footer lang={lang} demonstracao={isDemo} />)

  it('has the four columns, with a title, in registry order', () => {
    render_()
    const titles = screen.getAllByRole('heading', { level: 2 }).map((n) => n.textContent)
    expect(titles).toEqual(FOOTER_COLUMNS.map((c) => (r.colunas as Record<string, string>)[c]))
  })

  it('each item of each column is a link, with the language\'s label and the language\'s address, in registry order', () => {
    render_()
    for (const c of FOOTER_COLUMNS) {
      const column = screen.getByRole('region', { name: (r.colunas as Record<string, string>)[c] })
      const links = within(column).getAllByRole('link')
      expect(links).toHaveLength(FOOTER[c].length)
      footerRoutes(c).forEach((route, i) => {
        expect(links[i].textContent?.startsWith(labelOf(lang, route.id)), route.id).toBe(true)
        checkLink(links[i], route, lang)
      })
    }
  })

  it('the legal line and the closing strip carry the legal documents, with the site map', () => {
    render_()
    const line = screen.getByRole('navigation', { name: r.legal })
    for (const route of footerRoutes('legal')) checkLink(within(line).getByRole('link', { name: new RegExp(`^${labelOf(lang, route.id)}`) }), route, lang)
    const base = screen.getByRole('list', { name: legalDict(lang).rodape.secao })
    expect(within(base).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(footerRoutes('base').map((x) => `/${lang}${x.caminho}`))
    expect(within(line).getByRole('link', { name: labelOf(lang, 'mapaDoSite') })).toHaveAttribute('href', `/${lang}/mapa-do-site`)
  })

  it('the brand carries the GitHub code, the contact and the RSS, each icon with a name for the screen reader', () => {
    render_()
    const [code] = footerRoutes('marca')
    checkLink(screen.getByRole('link', { name: new RegExp(`^${labelOf(lang, 'codigo')}`) }), code, lang)
    // the contact appears twice: the brand icon and the Company column item, both to the same page
    const contacts = screen.getAllByRole('link', { name: labelOf(lang, 'contato') })
    expect(contacts).toHaveLength(2)
    for (const c of contacts) expect(c).toHaveAttribute('href', `/${lang}/contato`)
  })

  it('the RSS icon only appears when the site is open to indexing (when closed, the feed answers 404)', () => {
    vi.stubEnv('FOLGALI_INDEXABLE', 'sim')
    const { unmount } = render_()
    expect(screen.getByRole('link', { name: r.rss })).toHaveAttribute('href', `/${lang}/rss.xml`)
    unmount()
    vi.stubEnv('FOLGALI_INDEXABLE', 'nao')
    render_()
    expect(screen.queryByRole('link', { name: r.rss })).toBeNull()
    vi.unstubAllEnvs()
  })

  it('no link is empty, "#" or javascript:', () => {
    const { container } = render_()
    for (const a of container.querySelectorAll('a')) {
      const href = a.getAttribute('href') ?? ''
      expect(href, a.textContent ?? '').not.toBe('')
      expect(href).not.toBe('#')
      expect(href).not.toMatch(/^javascript:/i)
    }
  })

  it('carries the description, Rovemark\'s rights with the year, the art and brand notice, the license and the beta', () => {
    const { container } = render_()
    expect(screen.getByText(r.marca.descricao)).toBeInTheDocument()
    expect(screen.getByText(dict(lang).rodape.linha2)).toBeInTheDocument()
    expect(container.textContent).toContain('AGPL-3.0')
    expect(container.textContent).toContain(`© ${new Date().getFullYear()} Rovemark Inc.`)
    expect(screen.getByText(r.beta)).toBeInTheDocument()
  })

  it('the protocol version lives on the protocol page, not in the footer; and the footer does not say "draft"', () => {
    const { container } = render_()
    expect(container.textContent).not.toContain(entity.draftReview)
    expect(container.textContent).not.toMatch(/rascunho|draft/i)
    expect(pageOf(lang, 'protocolo').respostaCurta).toContain(entity.draftReview)
    expect(pageOf(lang, 'protocolo').respostaCurta).toContain(entity.protocolVersion)
  })

  it('the demo notice only appears when the site is in demo', () => {
    const { container, unmount } = render_(true)
    expect(container.textContent).toContain(r.demo)
    unmount()
    const two = render_(false)
    expect(two.container.textContent).not.toContain(r.demo)
  })

  it('the language selector is a compact button with the current language; the list links the languages, keeps the page and marks the current one', () => {
    h.pathname.valor = `/${lang}/ajuda`
    const { container } = render_()
    expect(container.querySelectorAll('.footer-language')).toHaveLength(1)
    const summary = container.querySelector('.footer-language summary') as HTMLElement
    expect(summary.textContent).toBe(lang === 'pt' ? 'Português' : 'English')
    expect(summary).toHaveAttribute('aria-label', `${r.idioma}: ${lang === 'pt' ? 'Português' : 'English'}`)
    const list = screen.getByRole('list', { name: r.idioma })
    const links = within(list).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(READY.map((l) => `/${l}/ajuda`))
    expect(links.find((l) => l.getAttribute('aria-current') === 'true')?.getAttribute('href')).toBe(`/${lang}/ajuda`)
  })

  it('the theme is a named switch, which turns dark on and off', async () => {
    document.documentElement.dataset.tema = 'claro'
    render_()
    const key = screen.getByRole('switch', { name: r.tema })
    expect(key).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(key)
    expect(document.documentElement.dataset.tema).toBe('escuro')
    await waitFor(() => expect(key).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(key)
    expect(document.documentElement.dataset.tema).toBe('claro')
    await waitFor(() => expect(key).toHaveAttribute('aria-checked', 'false'))
  })

  it('no longer brings the language cloud or the theme sentence', () => {
    const { container } = render_()
    expect(container.textContent).not.toContain(legalDict(lang).tema)
    expect(container.querySelector('.rodape-idiomas')).toBeNull()
  })

  it('it is a real footer, with labeled navigation, and without a script, cookie or tracking image', () => {
    const { container } = render_()
    expect(container.querySelector('footer')).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: r.navegacao }).length).toBeGreaterThan(0)
    expect(container.querySelector('script, iframe, img[src^="http"]')).toBeNull()
    // Luna is decoration: without alt text, the screen reader skips it
    expect(container.querySelector('img.footer-luna')).toHaveAttribute('alt', '')
  })
})

describe.each(READY)('what legal asked for in plain sight, in %s', (lang) => {
  it('the full copyright sentence, with the "© year Rovemark Inc." from left to right', () => {
    const { container } = render(<Footer lang={lang} demonstracao={false} />)
    const year = new Date().getFullYear()
    const complete = legalDict(lang).rodape.copyright.replace('{ano}', String(year))
    const line = container.querySelector('.footer-copy') as HTMLElement
    expect(line.textContent).toBe(complete)
    expect(line.querySelector('bdi[dir="ltr"]')?.textContent).toBe(`© ${year} Rovemark Inc.`)
    expect(complete).toMatch(/AGPL-3\.0/)
    expect(complete).toContain('folgali')
    expect(complete).toContain('Luna')
  })
  it('the report and security e-mails, clickable, the same as the Terms (section 18)', () => {
    const { container } = render(<Footer lang={lang} demonstracao={false} />)
    const contacts = container.querySelector('.footer-fine .footer-contacts') as HTMLElement
    expect(contacts).not.toBeNull()
    const links = [...contacts.querySelectorAll('a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['mailto:abuse@rovemark.co', 'mailto:security@rovemark.co'])
    expect(links.map((a) => a.textContent)).toEqual(['abuse@rovemark.co', 'security@rovemark.co'])
    expect(contacts.textContent).not.toMatch(/[{}]/)
  })
})

describe.each(['pt', 'en'] as const)('site map in %s', (lang) => {
  it('links every route with a section, grouped, with the language\'s label and address', () => {
    render(<SiteMap lang={lang} />)
    for (const s of MAP_SECTIONS) {
      const group = screen.getByRole('region', { name: (footerDict(lang).secoes as Record<string, string>)[s] })
      const links = within(group).getAllByRole('link')
      expect(links).toHaveLength(sectionRoutes(s).length)
      sectionRoutes(s).forEach((route, i) => {
        expect(links[i].textContent?.startsWith(labelOf(lang, route.id)), route.id).toBe(true)
        checkLink(links[i], route, lang)
      })
    }
  })
})
