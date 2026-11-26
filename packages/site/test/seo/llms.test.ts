import { describe, expect, it } from 'vitest'
import { llmsData } from '@/lib/seo/data'
import { generateLlmsFull, generateLlmsTxt } from '@/lib/seo/llms'
import { AI_CRAWLERS } from '@/lib/seo/policy'
import { sitemapRoutes } from '@/lib/seo/routes'

const d = llmsData({ FOLGALI_BASE_URL: 'https://exemplo.org' })
const txt = generateLlmsTxt(d)
const full = generateLlmsFull(d)

describe('llms.txt', () => {
  it('opens with the entity name and the description, in the standard\'s format (title, quote)', () => {
    expect(txt.startsWith('# folgali\n\n> ')).toBe(true)
    expect(txt).toContain(d.idiomas[0].entidade.descricaoCurta)
    expect(txt).toContain(d.idiomas[1].entidade.descricaoCurta)
  })
  it('brings the citable facts, how to cite and the license', () => {
    for (const f of d.idiomas[0].entidade.fatos) expect(txt).toContain(f)
    expect(txt).toContain('## How to cite')
    expect(txt).toContain('AGPL-3.0')
    expect(txt).toContain('Rovemark, all rights reserved')
  })
  it('lists one line with an absolute link for each canonical page, in each language', () => {
    for (const l of ['pt', 'en']) for (const r of sitemapRoutes()) expect(txt, `${l}${r.caminho}`).toContain(`](https://exemplo.org/${l}${r.caminho}):`)
  })
  it('lists guides and glossary entries with the short answer', () => {
    for (const t of d.idiomas) {
      for (const g of t.conteudo.guias) expect(txt).toContain(`](https://exemplo.org/${t.lang}/guias/${g.slug}): ${g.respostaCurta}`)
      for (const v of t.conteudo.verbetes) expect(txt).toContain(`](https://exemplo.org/${t.lang}/glossario/${v.slug}): ${v.definicaoCurta}`)
    }
  })
  it('describes the crawling policy, cites the AI crawlers and points to robots.txt', () => {
    for (const a of AI_CRAWLERS) expect(txt).toContain(a.agente)
    expect(txt).toContain('https://exemplo.org/robots.txt')
  })
  it('links the feeds, the sitemap and the full text', () => {
    expect(txt).toContain('https://exemplo.org/pt/rss.xml')
    expect(txt).toContain('https://exemplo.org/en/rss.xml')
    expect(txt).toContain('https://exemplo.org/sitemap.xml')
    expect(txt).toContain('https://exemplo.org/llms-full.txt')
  })
  it('never cites an app, credential or profile screen', () => {
    for (const forbidden of ['/aprovar', '/avisos', '/amigos', '/denunciar', '/comunidades/nova', '/r/', '/buscar']) expect(txt, forbidden).not.toContain(`exemplo.org/pt${forbidden}`)
  })
  it('is deterministic and has no em dash', () => {
    expect(generateLlmsTxt(d)).toBe(txt)
    expect(txt).not.toMatch(/—/)
  })
  it('uses the environment\'s base address, not a fixed one', () => {
    expect(txt).not.toContain('folgali.com')
    expect(generateLlmsTxt(llmsData({}))).toContain('https://folgali.com/pt')
  })
})

describe('llms-full.txt', () => {
  it('brings the text of the pages, help, glossary, guides and news', () => {
    for (const t of d.idiomas) {
      for (const r of sitemapRoutes()) {
        const p = t.paginas[r.id]
        if (p) expect(full, `${t.lang} ${r.id}`).toContain(p.respostaCurta)
      }
      for (const f of t.conteudo.faq) expect(full).toContain(f.resposta)
      for (const v of t.conteudo.verbetes) expect(full).toContain(v.definicao)
      for (const g of t.conteudo.guias) for (const s of g.secoes) for (const p of s.paragrafos) expect(full).toContain(p)
      for (const n of t.conteudo.novidades) expect(full).toContain(n.titulo)
    }
  })
  it('each page has the source, with an absolute address', () => {
    expect(full).toContain('Source: https://exemplo.org/pt/como-funciona')
    expect(full).toContain('Source: https://exemplo.org/en/seguranca')
  })
  it('shows the code of the sections that have code', () => {
    const withCode = { ...d, idiomas: [{ ...d.idiomas[0], conteudo: { ...d.idiomas[0].conteudo, guias: [{ ...d.idiomas[0].conteudo.guias[0], secoes: [{ titulo: 'Exemplo', paragrafos: ['x'], codigo: { linguagem: 'bash', texto: 'curl /v1/info' } }] }] } }] }
    expect(generateLlmsFull(withCode)).toContain('```bash\ncurl /v1/info\n```')
  })
})
