// Casos de limite que o medidor de mutação (scripts/mutacao-seo.mjs) apontou como sobreviventes na primeira rodada (74,57 %): valores
// exatos de cabeçalho e de meta, cortes de texto, identificadores de dados estruturados, datas do sitemap e o endereço-base.
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { conteudoDe } from '@/conteudo'
import { aplicativo, artigoTecnico, faq, pagina, postagemDeForum, termoDefinido } from '@/lib/seo/jsonld'
import { metaDaRota, resumir } from '@/lib/seo/metadata'
import { metaTela } from '@/lib/seo/meta-telas'
import { contraste } from '@/lib/seo/og-cores'
import { cabecalhoRobots, disallowsDeRobots, foraDoIndice, metaRobots, padraoParaRegex, politicaDaRota } from '@/lib/seo/politica'
import { conteudoInexistente } from '@/lib/seo/existe'
import { montarSitemap } from '@/lib/seo/sitemap'
import { urlAbsoluta, urlBase } from '@/lib/site'
import { proxy } from '@/proxy'

describe('política de rastreio: valores exatos', () => {
  it('cabeçalho: noindex com ou sem follow, e o aberto com os limites de trecho', () => {
    expect(cabecalhoRobots({ index: false, follow: false, arquivo: false })).toBe('noindex, nofollow, noarchive')
    expect(cabecalhoRobots({ index: false, follow: true, arquivo: false })).toBe('noindex, follow, noarchive')
    expect(cabecalhoRobots({ index: true, follow: true, arquivo: true })).toBe('index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1')
  })
  it('meta robots: fechado, fechado seguindo links e aberto', () => {
    expect(metaRobots({ index: false, follow: false, arquivo: false })).toEqual({ index: false, follow: false, nocache: true, noarchive: true, googleBot: { index: false, follow: false } })
    expect(metaRobots({ index: false, follow: true, arquivo: false })).toEqual({ index: false, follow: true, nocache: true, noarchive: true, googleBot: { index: false, follow: true } })
    expect(metaRobots({ index: true, follow: true, arquivo: true })).toMatchObject({ index: true, follow: true, googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large', 'max-video-preview': -1 } })
  })
  it('só perfil e busca seguem links; o resto das rotas fechadas não segue, mesmo com /r/ no meio do caminho', () => {
    expect(politicaDaRota('/pt/r/pipa', true)).toEqual({ index: false, follow: true, arquivo: false })
    expect(politicaDaRota('/pt/buscar', true)).toEqual({ index: false, follow: true, arquivo: false })
    expect(politicaDaRota('/pt/aprovar', true)).toEqual({ index: false, follow: false, arquivo: false })
    expect(politicaDaRota('/pt/comunidades/r/membros', true).follow).toBe(false)
  })
  it('a rota exata, a barra final e o que vem embaixo casam; vizinhas parecidas não', () => {
    expect(foraDoIndice('/buscar/')).toBe(true)
    expect(foraDoIndice('/buscar')).toBe(true)
    expect(foraDoIndice('/buscares')).toBe(false)
    expect(foraDoIndice('/aprovar/x/y')).toBe(true)
    expect(foraDoIndice('/aprovarx')).toBe(false)
  })
  it('caracteres especiais do padrão são literais', () => {
    expect(padraoParaRegex('/a.b').test('/a.b')).toBe(true)
    expect(padraoParaRegex('/a.b').test('/aXb')).toBe(false)
  })
  it('o robots.txt tem o curinga do idioma na frente de cada linha', () => {
    const d = disallowsDeRobots()
    expect(d).toContain('/*/aprovar$')
    expect(d).toContain('/*/aprovar/')
    expect(d).toContain('/*/aprovar?')
    expect(d.every((l) => l.startsWith('/*/'))).toBe(true)
  })
})

describe('endereço-base', () => {
  it('apara espaços, ignora vazio, recusa http fora de localhost e aceita localhost', () => {
    expect(urlBase({ ROVER_NETWORK_URL_BASE: '  https://a.test/  ' })).toBe('https://a.test')
    expect(urlBase({ ROVER_NETWORK_URL_BASE: '   ' })).toBe('https://folgali.com')
    expect(urlBase({})).toBe('https://folgali.com')
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'http://a.test' })).toBe('https://folgali.com')
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'ftp://a.test' })).toBe('https://folgali.com')
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'http://localhost:3000' })).toBe('http://localhost:3000')
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'não é url' })).toBe('https://folgali.com')
  })
  it('urlAbsoluta sem caminho é o início do idioma', () => {
    expect(urlAbsoluta('https://a.test', 'pt')).toBe('https://a.test/pt')
    expect(urlAbsoluta('https://a.test', 'pt', '/ajuda')).toBe('https://a.test/pt/ajuda')
  })
})

describe('metadados: cortes e rotas', () => {
  it('resumir: no limite não corta, passando corta na palavra, tira pontuação do fim e põe reticências', () => {
    expect(resumir('abc def', 7)).toBe('abc def')
    expect(resumir('  muitos   espaços  ')).toBe('muitos espaços')
    expect(resumir('um dois três quatro cinco seis, sete oito nove', 30)).toBe('um dois três quatro cinco…')
    expect(resumir('palavraenormesemespaconenhum e fim', 12)).toBe('palavraenor…')
    expect(resumir('a b c d e f g h i j k l m n o p', 20).endsWith('…')).toBe(true)
  })
  it('rota desconhecida ou externa é erro, não metadado vazio', () => {
    expect(() => metaDaRota('pt', 'nao-existe')).toThrow('rota interna desconhecida: nao-existe')
    expect(() => metaDaRota('pt', 'rovemark')).toThrow('rota interna desconhecida: rovemark')
  })
  it('metaDaRota usa o caminho, o título e a descrição da rota', () => {
    const m = metaDaRota('pt', 'ajuda', { ROVER_NETWORK_URL_BASE: 'https://a.test' })
    expect(m.alternates?.canonical).toBe('https://a.test/pt/ajuda')
    expect(m.description).toBeTruthy()
  })
  it('metaTela: descrição própria é aparada e compactada; sem ela, título seguido da frase da entidade', () => {
    expect(metaTela('pt', '/x', 'Título', '  uma   descrição  ').description).toBe('uma descrição')
    expect(metaTela('pt', '/x', 'Título', '   ').description).toMatch(/^Título\. /)
    expect(metaTela('pt', '/x', 'Título').description).toMatch(/^Título\. /)
  })
})

describe('dados estruturados: identificadores e campos', () => {
  const BASE = 'https://a.test'
  it('WebPage: tipo padrão, id da página e dateModified só quando existe', () => {
    const p = pagina(BASE, { url: `${BASE}/pt/x`, titulo: 'T', descricao: 'D', lang: 'pt' })
    expect(p['@type']).toBe('WebPage')
    expect(p['@id']).toBe(`${BASE}/pt/x#pagina`)
    expect('dateModified' in p).toBe(false)
    const q = pagina(BASE, { tipo: 'AboutPage', url: `${BASE}/pt/x`, titulo: 'T', descricao: 'D', lang: 'pt', atualizadoEm: '2026-11-08' })
    expect(q['@type']).toBe('AboutPage')
    expect(q.dateModified).toBe('2026-11-08')
  })
  it('FAQPage: aparar quando a resposta curta é vazia', () => {
    const f = faq([{ pergunta: 'P?', respostaCurta: '', resposta: 'R.' }])
    expect((f.mainEntity as { acceptedAnswer: { text: string } }[])[0].acceptedAnswer.text).toBe('R.')
  })
  it('verbete, guia, aplicativo e tópico levam o id com o fragmento certo', () => {
    const v = conteudoDe('pt').verbetes[0]
    expect(termoDefinido(BASE, 'pt', v, 'id-conjunto')['@id']).toBe(`${BASE}/pt/glossario/${v.slug}#termo`)
    const g = conteudoDe('pt').guias[0]
    expect(artigoTecnico(BASE, 'pt', g)['@id']).toBe(`${BASE}/pt/guias/${g.slug}#artigo`)
    const a = aplicativo(BASE)
    expect(String(a['@id'])).toMatch(/\/#aplicativo$/)
    expect(a.isRelatedTo).toEqual({ '@id': `${BASE}/#organizacao` })
    const t = postagemDeForum({ url: `${BASE}/pt/t/1`, titulo: 'T', texto: 'x', autor: 'a', criadoEm: '2026-11-08', respostas: 3, lang: 'pt' })
    expect(t['@id']).toBe(`${BASE}/pt/t/1#topico`)
    expect(t.interactionStatistic).toEqual({ '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: 3 })
  })
})

describe('contraste', () => {
  it('valores de referência da WCAG', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contraste('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
    expect(contraste('#0a0a0a', '#000000')).toBeCloseTo(1.05, 1)
    expect(contraste('#123456', '#123456')).toBe(1)
  })
})

describe('sitemap: datas e frequências', () => {
  const IDIOMAS = [{ lang: 'pt', hreflang: 'pt-BR' }, { lang: 'en', hreflang: 'en' }]
  const d = (extra = {}) => ({
    aberto: true, base: 'https://x.test', idiomas: IDIOMAS, padrao: 'pt',
    guias: { pt: [{ slug: 'g', atualizadoEm: '2026-11-08' }], en: [{ slug: 'g', atualizadoEm: '2026-11-03' }] },
    verbetes: { pt: [], en: [] }, comunidades: [{ id: 'ob_c', atividadeEm: '2026-11-08T10:00:00Z' }], paginas: [{ id: 'ob_p' }], ...extra,
  })
  it('rota do registro leva frequência e prioridade; a data do guia é a mais recente entre os idiomas, em qualquer ordem', () => {
    const lista = montarSitemap(d())
    const inicio = lista.find((e) => e.url === 'https://x.test/pt')
    expect(inicio).toMatchObject({ changeFrequency: 'daily', priority: 1 })
    expect(lista.find((e) => e.url === 'https://x.test/en/guias/g')?.lastModified).toEqual(new Date('2026-11-08'))
    const invertido = montarSitemap(d({ guias: { en: [{ slug: 'g', atualizadoEm: '2026-11-03' }], pt: [{ slug: 'g', atualizadoEm: '2026-11-08' }] } }))
    expect(invertido.find((e) => e.url === 'https://x.test/pt/guias/g')?.lastModified).toEqual(new Date('2026-11-08'))
    expect(montarSitemap(d({ guias: { pt: [{ slug: 'g', atualizadoEm: '2026-11-03' }], en: [{ slug: 'g', atualizadoEm: '2026-11-03' }] } })).find((e) => e.url === 'https://x.test/pt/guias/g')?.lastModified).toEqual(new Date('2026-11-03'))
  })
  it('comunidade e página levam frequência diária e prioridade; sem data de atividade a data fica ausente', () => {
    const lista = montarSitemap(d())
    expect(lista.find((e) => e.url === 'https://x.test/pt/comunidades/ob_c')).toMatchObject({ changeFrequency: 'daily', priority: 0.6 })
    const p = lista.find((e) => e.url === 'https://x.test/pt/paginas/ob_p')
    expect(p).toMatchObject({ changeFrequency: 'daily', priority: 0.5 })
    expect(p?.lastModified).toBeUndefined()
  })
  it('guias e verbetes levam frequência mensal', () => {
    expect(montarSitemap(d()).find((e) => e.url === 'https://x.test/pt/guias/g')).toMatchObject({ changeFrequency: 'monthly', priority: 0.7 })
  })
})

describe('proxy: detalhes', () => {
  it('a raiz sem idioma vai para /pt ou /en sem barra sobrando', () => {
    const r = proxy(new NextRequest('https://x.test/', { headers: { 'accept-language': 'pt-BR' } }))
    expect(r.status).toBe(307)
    expect(new URL(r.headers.get('location') as string).pathname).toBe('/pt')
  })
  it('endereço com idioma segue com o caminho no cabeçalho de requisição', () => {
    const r = proxy(new NextRequest('https://x.test/pt/ajuda'))
    expect(r.headers.get('x-middleware-request-x-pathname')).toBe('/pt/ajuda')
  })
})

describe('conteudoInexistente: bordas', () => {
  it('só vale com o idioma na primeira posição e aceita slug com escape válido', () => {
    expect(conteudoInexistente('/a/pt/glossario/zzz')).toBe(false)
    const v = conteudoDe('pt').verbetes[0].slug
    expect(conteudoInexistente(`/pt/glossario/${encodeURIComponent(v)}`)).toBe(false)
    expect(conteudoInexistente(`/pt/glossario/%${v.charCodeAt(0).toString(16)}${v.slice(1)}`)).toBe(false)
  })
})
