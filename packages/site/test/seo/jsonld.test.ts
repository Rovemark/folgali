// Structured data: each builder validates against the type's JSON Schema, the graph does not repeat @context, and the serialization does not let
// a title with `</script>` close the tag.
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { contentOf } from '@/content'
import { application, technicalArticle, termSet, faq, graph, breadcrumbs, organization, page, forumPost, serialize, definedTerm, website } from '@/lib/seo/jsonld'
import { SCHEMAS } from './schemas'

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }))
const validate = (type: string, data: unknown) => {
  const ok = ajv.validate(SCHEMAS[type], data)
  expect(ok, `${type}: ${JSON.stringify(ajv.errors)}`).toBe(true)
}

const BASE = 'https://rede.exemplo.org'
const pt = contentOf('pt')

describe('each builder produces what the schema requires', () => {
  it('Organization', () => validate('Organization', organization(BASE, 'Uma descrição.')))
  it('WebSite with search', () => validate('WebSite', website(BASE, 'pt', 'Rover Network', 'Uma descrição.')))
  it('BreadcrumbList numbers from 1 and uses an absolute address', () => {
    const m = breadcrumbs([{ nome: 'Início', url: `${BASE}/pt` }, { nome: 'Ajuda', url: `${BASE}/pt/ajuda` }])
    validate('BreadcrumbList', m)
    expect((m.itemListElement as { position: number }[]).map((i) => i.position)).toEqual([1, 2])
  })
  it('WebPage and the subtypes', () => {
    for (const type of ['WebPage', 'AboutPage', 'ContactPage', 'CollectionPage'] as const) validate('WebPage', page(BASE, { tipo: type, url: `${BASE}/pt/contato`, titulo: 'Contato', descricao: 'Fale.', lang: 'pt', atualizadoEm: '2026-11-08' }))
  })
  it('FAQPage: the structured data\'s answer is the same as the page shows (short + detail)', () => {
    const f = faq(pt.faq)
    validate('FAQPage', f)
    const replies = (f.mainEntity as { acceptedAnswer: { text: string } }[]).map((q) => q.acceptedAnswer.text)
    pt.faq.forEach((item, i) => {
      expect(replies[i]).toContain(item.respostaCurta)
      expect(replies[i]).toContain(item.resposta)
    })
  })
  it('DefinedTerm e DefinedTermSet', () => {
    const set = termSet(BASE, 'pt', 'Glossário', 'Termos.', pt.verbetes)
    validate('DefinedTermSet', set)
    const t = definedTerm(BASE, 'pt', pt.verbetes[0], set['@id'] as string)
    validate('DefinedTerm', t)
    expect((t.inDefinedTermSet as { '@id': string })['@id']).toBe(set['@id'])
  })
  it('TechArticle, with a title within Google\'s 110-character limit', () => {
    for (const g of pt.guias) validate('TechArticle', technicalArticle(BASE, 'pt', g))
  })
  it('SoftwareApplication does not claim a price, rating or system that does not exist yet', () => {
    const a = application(BASE)
    validate('SoftwareApplication', a)
    expect(a).not.toHaveProperty('offers')
    expect(a).not.toHaveProperty('aggregateRating')
    expect(String(a.operatingSystem)).not.toMatch(/iOS|Android/)
  })
  it('DiscussionForumPosting', () => {
    validate('DiscussionForumPosting', forumPost({ url: `${BASE}/pt/t/ob_x`, titulo: 'Título', texto: 'Texto.', autor: 'max', criadoEm: '2026-11-08T12:00:00Z', respostas: 3, lang: 'pt' }))
  })
})

describe('the graph and the serialization', () => {
  it('the graph has a single @context and removes each block\'s own', () => {
    const g = graph({ '@context': 'https://schema.org', '@type': 'Organization' }, { '@type': 'WebSite' })
    expect(g['@context']).toBe('https://schema.org')
    expect(g['@graph']).toEqual([{ '@type': 'Organization' }, { '@type': 'WebSite' }])
  })
  it('a title with </script> does not close the tag', () => {
    const s = serialize({ nome: '</script><script>alert(1)</script>' })
    expect(s).not.toContain('</script>')
    expect(s).not.toContain('<')
    expect(JSON.parse(s).nome).toBe('</script><script>alert(1)</script>')
  })
  it('escapes & and > and the Unicode line separators', () => {
    const s = serialize({ x: 'a&b>c\u2028d\u2029e' })
    expect(s).not.toMatch(/[&>\u2028\u2029]/)
    expect(JSON.parse(s).x).toBe('a&b>c\u2028d\u2029e')
  })
})

describe('the entity is consistent across all blocks', () => {
  it('the same organization (@id) is referenced by site, page and article', () => {
    const org = organization(BASE, 'x')
    const refs = [website(BASE, 'pt', 'n', 'd').publisher, page(BASE, { url: `${BASE}/pt`, titulo: 't', descricao: 'd', lang: 'pt' }).publisher, technicalArticle(BASE, 'pt', pt.guias[0]).publisher] as { '@id': string }[]
    for (const r of refs) expect(r['@id']).toBe(org['@id'])
  })
})
