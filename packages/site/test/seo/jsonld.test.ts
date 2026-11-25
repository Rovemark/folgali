// Dados estruturados: cada construtor valida contra o JSON Schema do tipo, o grafo não repete @context, e a serialização não deixa
// um título com `</script>` fechar a tag.
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { conteudoDe } from '@/conteudo'
import { aplicativo, artigoTecnico, conjuntoDeTermos, faq, grafo, migalhas, organizacao, pagina, postagemDeForum, serializar, termoDefinido, website } from '@/lib/seo/jsonld'
import { SCHEMAS } from './schemas'

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }))
const validar = (tipo: string, dados: unknown) => {
  const ok = ajv.validate(SCHEMAS[tipo], dados)
  expect(ok, `${tipo}: ${JSON.stringify(ajv.errors)}`).toBe(true)
}

const BASE = 'https://rede.exemplo.org'
const pt = conteudoDe('pt')

describe('cada construtor produz o que o schema exige', () => {
  it('Organization', () => validar('Organization', organizacao(BASE, 'Uma descrição.')))
  it('WebSite com busca', () => validar('WebSite', website(BASE, 'pt', 'Rover Network', 'Uma descrição.')))
  it('BreadcrumbList numera a partir de 1 e usa endereço absoluto', () => {
    const m = migalhas([{ nome: 'Início', url: `${BASE}/pt` }, { nome: 'Ajuda', url: `${BASE}/pt/ajuda` }])
    validar('BreadcrumbList', m)
    expect((m.itemListElement as { position: number }[]).map((i) => i.position)).toEqual([1, 2])
  })
  it('WebPage e os subtipos', () => {
    for (const tipo of ['WebPage', 'AboutPage', 'ContactPage', 'CollectionPage'] as const) validar('WebPage', pagina(BASE, { tipo, url: `${BASE}/pt/contato`, titulo: 'Contato', descricao: 'Fale.', lang: 'pt', atualizadoEm: '2026-11-08' }))
  })
  it('FAQPage: a resposta do dado estruturado é a mesma que a página mostra (curta + detalhe)', () => {
    const f = faq(pt.faq)
    validar('FAQPage', f)
    const respostas = (f.mainEntity as { acceptedAnswer: { text: string } }[]).map((q) => q.acceptedAnswer.text)
    pt.faq.forEach((item, i) => {
      expect(respostas[i]).toContain(item.respostaCurta)
      expect(respostas[i]).toContain(item.resposta)
    })
  })
  it('DefinedTerm e DefinedTermSet', () => {
    const set = conjuntoDeTermos(BASE, 'pt', 'Glossário', 'Termos.', pt.verbetes)
    validar('DefinedTermSet', set)
    const t = termoDefinido(BASE, 'pt', pt.verbetes[0], set['@id'] as string)
    validar('DefinedTerm', t)
    expect((t.inDefinedTermSet as { '@id': string })['@id']).toBe(set['@id'])
  })
  it('TechArticle, com título dentro do limite de 110 caracteres do Google', () => {
    for (const g of pt.guias) validar('TechArticle', artigoTecnico(BASE, 'pt', g))
  })
  it('SoftwareApplication não afirma preço, nota nem sistema que ainda não existe', () => {
    const a = aplicativo(BASE)
    validar('SoftwareApplication', a)
    expect(a).not.toHaveProperty('offers')
    expect(a).not.toHaveProperty('aggregateRating')
    expect(String(a.operatingSystem)).not.toMatch(/iOS|Android/)
  })
  it('DiscussionForumPosting', () => {
    validar('DiscussionForumPosting', postagemDeForum({ url: `${BASE}/pt/t/ob_x`, titulo: 'Título', texto: 'Texto.', autor: 'max', criadoEm: '2026-11-08T12:00:00Z', respostas: 3, lang: 'pt' }))
  })
})

describe('o grafo e a serialização', () => {
  it('o grafo tem um @context só e tira o de cada bloco', () => {
    const g = grafo({ '@context': 'https://schema.org', '@type': 'Organization' }, { '@type': 'WebSite' })
    expect(g['@context']).toBe('https://schema.org')
    expect(g['@graph']).toEqual([{ '@type': 'Organization' }, { '@type': 'WebSite' }])
  })
  it('um título com </script> não fecha a tag', () => {
    const s = serializar({ nome: '</script><script>alert(1)</script>' })
    expect(s).not.toContain('</script>')
    expect(s).not.toContain('<')
    expect(JSON.parse(s).nome).toBe('</script><script>alert(1)</script>')
  })
  it('escapa & e > e os separadores de linha do Unicode', () => {
    const s = serializar({ x: 'a&b>c\u2028d\u2029e' })
    expect(s).not.toMatch(/[&>\u2028\u2029]/)
    expect(JSON.parse(s).x).toBe('a&b>c\u2028d\u2029e')
  })
})

describe('a entidade é consistente em todos os blocos', () => {
  it('a mesma organização (@id) é referenciada por site, página e artigo', () => {
    const org = organizacao(BASE, 'x')
    const refs = [website(BASE, 'pt', 'n', 'd').publisher, pagina(BASE, { url: `${BASE}/pt`, titulo: 't', descricao: 'd', lang: 'pt' }).publisher, artigoTecnico(BASE, 'pt', pt.guias[0]).publisher] as { '@id': string }[]
    for (const r of refs) expect(r['@id']).toBe(org['@id'])
  })
})
