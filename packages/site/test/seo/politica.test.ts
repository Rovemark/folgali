// A política de rastreamento: fechada por padrão, aberta de uma vez só pela flag, e as telas de credencial nunca abertas.
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxy } from '@/proxy'
import robotsDoSite from '@/app/robots'
import { GET as llmsTxt } from '@/app/llms.txt/route'
import { GET as llmsFull } from '@/app/llms-full.txt/route'
import { GET as rss } from '@/app/[lang]/rss.xml/route'
import { META, PRONTOS } from '@/lib/i18n'
import { cabecalhoRobots, disallowsDeRobots, foraDoIndice, metaRobots, padraoParaRegex, politicaDaRota, RASTREADORES_DE_IA, regrasDeRobots, ROTAS_FORA_DO_INDICE } from '@/lib/seo/politica'
import { ROTAS } from '@/lib/seo/rotas'

afterEach(() => vi.unstubAllEnvs())

const FECHADO = 'noindex, nofollow, noarchive'
const ABERTO = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
const rotasPublicas = ROTAS.filter((r) => r.externo === undefined)

describe('flag desligada (o padrão): nada é indexável, em lugar nenhum', () => {
  it('toda rota do registro, em todo idioma, sai noindex', () => {
    for (const l of PRONTOS) for (const r of rotasPublicas) expect(politicaDaRota(`/${l}${r.caminho}`, false), `${l}${r.caminho}`).toEqual({ index: false, follow: false, arquivo: false })
  })
  it('o cabeçalho e o meta robots dizem noindex e nofollow', () => {
    const p = politicaDaRota('/pt', false)
    expect(cabecalhoRobots(p)).toBe(FECHADO)
    expect(metaRobots(p)).toMatchObject({ index: false, follow: false, noarchive: true })
  })
  it('o robots.txt fecha tudo e não anuncia sitemap', () => {
    expect(regrasDeRobots(false, 'https://x.test')).toEqual({ rules: { userAgent: '*', disallow: '/' } })
  })
  it('o proxy põe noindex em página, em arquivo de máquina e em imagem', () => {
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', '')
    for (const caminho of ['/pt', '/pt/ajuda', '/pt/aprovar', '/robots.txt', '/sitemap.xml', '/llms.txt', '/og/pt/padrao', '/marca/icone.svg']) {
      const res = proxy(new NextRequest(`https://x.test${caminho}`))
      expect(res.headers.get('x-robots-tag'), caminho).toBe(FECHADO)
    }
  })
  it('só o valor exato "sim" liga: true, 1, SIM e vazio continuam fechados', () => {
    for (const v of ['true', '1', 'SIM', 'Sim', ' sim', 'yes', '']) {
      vi.stubEnv('ROVER_NETWORK_INDEXAVEL', v)
      expect(proxy(new NextRequest('https://x.test/pt')).headers.get('x-robots-tag'), v).toBe(FECHADO)
    }
  })
  it('llms.txt, llms-full.txt e o RSS não existem (404, com noindex)', async () => {
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', '')
    for (const r of [llmsTxt(), llmsFull(), await rss(new Request('https://x.test/pt/rss.xml'), { params: Promise.resolve({ lang: 'pt' }) })]) {
      expect(r.status).toBe(404)
      expect(r.headers.get('x-robots-tag')).toBe(FECHADO)
    }
  })
  it('robots.ts, lido pelo ambiente, também sai fechado', () => {
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', '')
    expect(robotsDoSite()).toEqual({ rules: { userAgent: '*', disallow: '/' } })
  })
})

describe('flag ligada ("sim"): tudo abre de uma vez, menos o que depende de credencial', () => {
  it('o conteúdo público vira indexável e citável', () => {
    // a busca e o painel "Meu rover" estão no registro mas ficam fora do índice sempre (resultado de busca; tela que depende do app pareado)
    for (const l of PRONTOS) for (const r of rotasPublicas.filter((x) => x.caminho !== '/buscar' && x.caminho !== '/inicio')) expect(politicaDaRota(`/${l}${r.caminho}`, true), `${l}${r.caminho}`).toEqual({ index: true, follow: true, arquivo: true })
    expect(cabecalhoRobots(politicaDaRota('/pt/ajuda', true))).toBe(ABERTO)
  })
  it('o proxy muda o cabeçalho de todas as respostas ao mesmo tempo', () => {
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', 'sim')
    for (const caminho of ['/pt', '/en/ajuda', '/robots.txt', '/sitemap.xml', '/llms.txt', '/og/pt/padrao']) {
      expect(proxy(new NextRequest(`https://x.test${caminho}`)).headers.get('x-robots-tag'), caminho).toBe(ABERTO)
    }
  })
  it('o robots.txt libera o conteúdo, lista os rastreadores de IA e anuncia o sitemap', () => {
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', 'sim')
    const r = robotsDoSite()
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/)
    const regras = Array.isArray(r.rules) ? r.rules : [r.rules]
    const agentes = regras.map((x) => x.userAgent)
    expect(agentes).toContain('*')
    for (const a of RASTREADORES_DE_IA) expect(agentes, a.agente).toContain(a.agente)
    for (const x of regras) {
      expect(x.allow).toBe('/')
      expect(x.disallow).toEqual(disallowsDeRobots())
    }
  })
})

describe('o que depende de credencial ou de uma pessoa nunca entra no índice, nem com a flag ligada', () => {
  const FORA = ['/pt/aprovar', '/pt/aprovar/x', '/pt/avisos', '/pt/amigos', '/pt/inicio', '/ar/inicio', '/pt/inicio?x=1', '/pt/app/aprovar', '/pt/denunciar/ob_x', '/pt/buscar', '/pt/r/max', '/pt/comunidades/nova', '/pt/paginas/nova', '/pt/comunidades/ob_x/gerir', '/pt/comunidades/ob_x/novo', '/pt/comunidades/ob_x/membros', '/pt/comunidades/ob_x/moderacao', '/pt/comunidades/ob_x/apelar', '/pt/paginas/ob_x/gerir', '/pt/t/ob_x/editar']
  it.each(FORA)('%s', (caminho) => {
    expect(politicaDaRota(caminho, true).index).toBe(false)
    expect(cabecalhoRobots(politicaDaRota(caminho, true))).toMatch(/^noindex/)
  })
  it('perfil de rover e busca não entram no índice, mas os links deles podem ser seguidos', () => {
    expect(politicaDaRota('/pt/r/max', true)).toEqual({ index: false, follow: true, arquivo: false })
    expect(politicaDaRota('/pt/buscar', true)).toEqual({ index: false, follow: true, arquivo: false })
    expect(politicaDaRota('/pt/aprovar', true)).toEqual({ index: false, follow: false, arquivo: false })
    expect(politicaDaRota('/pt/inicio', true)).toEqual({ index: false, follow: false, arquivo: false })
  })
  it('o painel "Meu rover" está no registro, fora do sitemap e fora do índice; a capa (/pt) continua aberta', () => {
    const r = ROTAS.find((x) => x.caminho === '/inicio')
    expect(r).toMatchObject({ id: 'meuRover', indexavel: false, secao: null })
    expect(politicaDaRota('/pt', true).index).toBe(true)
    expect(foraDoIndice('/inicio')).toBe(true)
    expect(foraDoIndice('/inicios')).toBe(false)
    expect(disallowsDeRobots()).toEqual(expect.arrayContaining(['/*/inicio$', '/*/inicio/', '/*/inicio?']))
  })
  it('conteúdo público ao lado dessas rotas continua aberto (sem colisão de prefixo)', () => {
    for (const ok of ['/pt/regras', '/pt/rss.xml', '/pt/recursos', '/pt/comunidades', '/pt/comunidades/ob_x', '/pt/comunidades/ob_x/sobre', '/pt/comunidades/ob_x/registro', '/pt/t/ob_x', '/pt/paginas/ob_x', '/pt/p/ob_x', '/pt/appendice', '/pt/amigosde']) {
      expect(politicaDaRota(ok, true).index, ok).toBe(true)
    }
  })
  it('a consulta e a barra final não escapam da lista', () => {
    expect(foraDoIndice('/aprovar?x=1')).toBe(true)
    expect(foraDoIndice('/aprovar/')).toBe(true)
    expect(foraDoIndice('/buscar?q=oi')).toBe(true)
  })
  it('cada padrão vira regex que casa a própria rota e não casa a vizinha', () => {
    expect(padraoParaRegex('/r/**').test('/r/max')).toBe(true)
    expect(padraoParaRegex('/r/**').test('/regras')).toBe(false)
    expect(padraoParaRegex('/comunidades/*/gerir').test('/comunidades/ob_x/gerir')).toBe(true)
    expect(padraoParaRegex('/comunidades/*/gerir').test('/comunidades/ob_x/y/gerir')).toBe(false)
    expect(padraoParaRegex('/buscar').test('/buscar')).toBe(true)
    expect(padraoParaRegex('/buscar').test('/buscarx')).toBe(false)
  })
  it('o robots.txt tem três linhas precisas por padrão (exata, filhos, consulta) e nenhuma por prefixo solto', () => {
    const d = disallowsDeRobots()
    expect(d).toHaveLength(ROTAS_FORA_DO_INDICE.length * 3)
    expect(d).toContain('/*/aprovar$')
    expect(d).toContain('/*/aprovar/')
    expect(d).toContain('/*/aprovar?')
    expect(d).toContain('/*/r/')
    expect(d).not.toContain('/*/r')
    for (const linha of d) expect(linha, linha).toMatch(/^\/\*\/[^\s]+(\$|\/|\?)$/)
  })
})

describe('proxy: endereços sem idioma', () => {
  it('arquivos de máquina e imagens passam sem redirecionar', () => {
    for (const c of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt', '/og/pt/ajuda', '/marca/icone.svg', '/saude']) {
      const res = proxy(new NextRequest(`https://x.test${c}`))
      expect(res.status, c).toBe(200)
      expect(res.headers.get('location'), c).toBeNull()
    }
  })
  it('página sem idioma redireciona (307) para o idioma do navegador, e um idioma ainda sem texto cai no inglês', () => {
    const r1 = proxy(new NextRequest('https://x.test/ajuda', { headers: { 'accept-language': 'en-US,en;q=0.9' } }))
    expect(r1.status).toBe(307)
    expect(r1.headers.get('location')).toBe('https://x.test/en/ajuda')
    const fr = proxy(new NextRequest('https://x.test/ajuda', { headers: { 'accept-language': 'fr-FR,fr;q=0.9' } }))
    expect(fr.headers.get('location')).toBe('https://x.test/fr/ajuda')
    // com os 12 idiomas prontos não há mais idioma pendente na vida real: simula um para provar que o caminho de queda para o inglês segue vivo
    const antes = META.ko.pronto
    META.ko.pronto = false
    try {
      const r2 = proxy(new NextRequest('https://x.test/ko/ajuda'))
      expect(r2.headers.get('location')).toBe('https://x.test/en/ajuda')
    } finally {
      META.ko.pronto = antes
    }
  })
})

describe('proxy: conteúdo que não existe', () => {
  it('verbete e guia inexistentes viram 404 reescrito, noindex, com o endereço do pedido intacto', () => {
    for (const c of ['/pt/glossario/nao-existe', '/en/guias/nao-existe']) {
      const res = proxy(new NextRequest(`https://x.test${c}`))
      expect(res.status, c).toBe(404)
      expect(res.headers.get('x-middleware-rewrite'), c).toContain('/__nao-encontrado')
      expect(res.headers.get('x-robots-tag'), c).toBe('noindex, nofollow')
    }
  })
  it('a rota interna do 404 também sai do índice, para o cabeçalho final não dizer index', () => {
    expect(foraDoIndice('/__nao-encontrado')).toBe(true)
    expect(cabecalhoRobots(politicaDaRota('/pt/__nao-encontrado', true))).toContain('noindex')
  })
  it('verbete que existe segue normal', () => {
    const res = proxy(new NextRequest('https://x.test/pt/glossario/rover'))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })
})
