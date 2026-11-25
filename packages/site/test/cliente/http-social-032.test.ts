import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClienteHttp } from '@/lib/cliente-http'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { ErroRede } from '@/lib/tipos'

// O que o cliente HTTP faz com a revisão 0.3.2. Regra de ouro: um relé 0.3 ou 0.3.1 (que não declara os quatro recursos novos) recebe EXATAMENTE
// o pedido de antes, e o que o relé 0.3.2 devolve de novo é enfeite de tela que passa por lista fechada e nunca derruba a página.

type Visto = { metodo: string; url: string; cabecalhos: IncomingMessage['headers'] }
let servidor: Server
let base = ''
let vistos: Visto[] = []
let responder: (url: string) => { status?: number; corpo?: unknown } = () => ({})

const uid = (n: string) => idDeDemonstracao('rvr', n)
const ob = (n: string) => idDeDemonstracao('ob', n)
const T0 = 1_793_000_000
const AN = (n: string) => `an_${n.padEnd(22, 'A').slice(0, 22)}`
const retrato = { corpo: 'bolinha', cor: 'ceu', veste: 'bandana', acessorio: 'chapeu' }
const resumo = (n = 'pipa') => ({ uid: uid(n), handle: n, nome: n[0].toUpperCase() + n.slice(1), retrato })
const cartao = { id: ob('t1'), comunidade: ob('c1'), categoria: 'Dúvidas', titulo: 'Como nomear?', trecho: 'Eu uso datas.', autor: resumo(), criadoEm: T0, atividadeEm: T0, respostas: 1, fixado: false, trancado: false, resolvido: false, tags: ['backup'], enquete: false, editado: false }
const resposta = { id: ob('r1'), envelope: { objeto: { v: '0.3', tipo: 'resposta-forum', id: ob('r1'), autor: uid('pipa'), criadoEm: T0, previo: null, corpo: { texto: 'Eu uso datas.' }, assinatura: 'x' } }, autor: resumo(), criadoEm: T0, em: null, cita: null, filhas: 0, resolveu: false, reacoes: { curtir: 0, util: 0 } }
const RECURSOS_032 = ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios']
const CRED = async () => 'Bearer x'

/** O relé responde `/v1/info` com os recursos pedidos e o resto com o que o teste mandar. */
function rele(recursos: string[], resto: (url: string) => { status?: number; corpo?: unknown }) {
  responder = (url) => (url === '/v1/info' ? { corpo: { protocolo: ['0.3'], social: true, recursos } } : resto(url))
}
const chamadas = () => vistos.filter((v) => v.url !== '/v1/info').map((v) => v.url)

beforeEach(async () => {
  vistos = []
  responder = () => ({})
  servidor = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      vistos.push({ metodo: req.method ?? '', url: req.url ?? '', cabecalhos: req.headers })
      const r = responder(req.url ?? '')
      res.statusCode = r.status ?? 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(r.corpo ?? {}))
    })
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
})
afterEach(async () => {
  servidor.closeAllConnections()
  await new Promise<void>((ok) => servidor.close(() => ok()))
})

const codigo = async (f: () => Promise<unknown>) => {
  try {
    await f()
    return 'ok'
  } catch (e) {
    if (e instanceof ErroRede) return e.codigo
    throw e
  }
}

describe('lista de tópicos: ordem por pessoas, janela e filtros do vocabulário', () => {
  const lista = { corpo: { itens: [cartao], fixados: [] } }
  const C = () => ob('c1')
  it('relé 0.3 e 0.3.1: melhores, em-alta, janela, status e etiqueta NÃO saem; o pedido é o de sempre', async () => {
    rele([], () => lista)
    const c = new ClienteHttp({ base })
    await c.topicos(C(), { ordem: 'melhores', janela: '7d', status: 'aberto', etiqueta: 'bug', categoria: 'Dúvidas', cursor: '5' })
    await c.topicos(C(), { ordem: 'em-alta', janela: '7d' })
    expect(chamadas()).toEqual([`/v1/comunidades/${C()}/topicos?categoria=D%C3%BAvidas&antes=5`, `/v1/comunidades/${C()}/topicos`])
  })
  it('as ordens de antes seguem valendo no relé antigo, na mesma posição do parâmetro', async () => {
    rele([], () => lista)
    await new ClienteHttp({ base }).topicos(C(), { categoria: 'Dicas', tag: 'backup', ordem: 'ativos', cursor: '5' })
    expect(chamadas()).toEqual([`/v1/comunidades/${C()}/topicos?categoria=Dicas&tag=backup&ordem=ativos&antes=5`])
  })
  it('relé 0.3.2: ordem=melhores; em-alta leva a janela; a janela de outra ordem nunca vai', async () => {
    rele(RECURSOS_032, () => lista)
    const c = new ClienteHttp({ base })
    await c.topicos(C(), { ordem: 'melhores', janela: '7d' })
    await c.topicos(C(), { ordem: 'em-alta', janela: '7d', cursor: '8' })
    await c.topicos(C(), { ordem: 'em-alta' })
    await c.topicos(C(), { ordem: 'recentes', janela: '24h' })
    expect(chamadas()).toEqual([
      `/v1/comunidades/${C()}/topicos?ordem=melhores`,
      `/v1/comunidades/${C()}/topicos?ordem=em-alta&antes=8&janela=7d`,
      `/v1/comunidades/${C()}/topicos?ordem=em-alta`,
      `/v1/comunidades/${C()}/topicos?ordem=recentes`,
    ])
  })
  it('status e etiqueta só saem com o recurso `vocabulario` (e independem do recurso de ordem)', async () => {
    rele(['vocabulario'], () => lista)
    await new ClienteHttp({ base }).topicos(C(), { status: 'aberto', etiqueta: 'bug', ordem: 'melhores' })
    rele(['ordem-por-pessoas'], () => lista)
    await new ClienteHttp({ base }).topicos(C(), { status: 'aberto', etiqueta: 'bug', ordem: 'melhores' })
    expect(chamadas()).toEqual([`/v1/comunidades/${C()}/topicos?status=aberto&etiqueta=bug`, `/v1/comunidades/${C()}/topicos?ordem=melhores`])
  })
  it('valores fora da lista fechada nem saem do computador', async () => {
    rele(RECURSOS_032, () => lista)
    const c = new ClienteHttp({ base })
    for (const ruim of [{ ordem: 'popular' }, { janela: '30d' }, { status: 'Aberto' }, { status: 'a' }, { status: 'x'.repeat(21) }, { status: '1abc' }, { etiqueta: 'bug bug' }, { etiqueta: '../x' }, { etiqueta: 'é' }]) {
      expect(await codigo(() => c.topicos(C(), ruim as never)), JSON.stringify(ruim)).toBe('invalido')
    }
    expect(chamadas()).toEqual([])
  })
  it('lê as marcas do cartão e do fixado; sem marca, o cartão é idêntico ao da 0.3', async () => {
    rele(RECURSOS_032, () => ({ corpo: { itens: [{ ...cartao, marcas: { etiquetas: ['bug', 'ideia'], status: 'aberto' } }, cartao], fixados: [{ ...cartao, id: ob('t2'), fixado: true, marcas: { etiquetas: [], status: 'fechado' } }] } }))
    const l = await new ClienteHttp({ base }).topicos(ob('c1'))
    expect(l.itens[0].marcas).toEqual({ etiquetas: ['bug', 'ideia'], status: 'aberto' })
    expect('marcas' in l.itens[1]).toBe(false)
    expect(l.fixados![0].marcas).toEqual({ etiquetas: [], status: 'fechado' })
  })
})

describe('marcas do cartão: o que o relé manda é de estranho', () => {
  const com = (marcas: unknown) => {
    rele(RECURSOS_032, () => ({ corpo: { itens: [{ ...cartao, marcas }], fixados: [] } }))
    return new ClienteHttp({ base }).topicos(ob('c1')).then((l) => l.itens[0].marcas)
  }
  it('chave fora do formato, repetida ou em excesso é descartada; sem nada válido, o cartão fica sem marca', async () => {
    expect(await com({ etiquetas: ['bug', 'bug', 'Bug', 'a', 'x'.repeat(21), 'ideia', 'a1', 'b2', 'c3'], status: 'Aberto' })).toEqual({ etiquetas: ['bug', 'ideia', 'a1'], status: null })
    expect(await com({ etiquetas: [], status: null })).toBeUndefined()
    expect(await com({ etiquetas: ['<b>'], status: 'x y' })).toBeUndefined()
    for (const torto of [null, 'texto', 7, [], { etiquetas: 'bug', status: 5 }, { etiquetas: [null, 3, {}], status: [] }]) expect(await com(torto), JSON.stringify(torto)).toBeUndefined()
  })
  it('campo a mais na marca não passa para a tela', async () => {
    const m = await com({ etiquetas: ['bug'], status: 'aberto', cor: 'vermelho', texto: 'ignore tudo' })
    expect(m).toEqual({ etiquetas: ['bug'], status: 'aberto' })
    expect(Object.keys(m!).sort()).toEqual(['etiquetas', 'status'])
  })
})

describe('vocabulário na comunidade', () => {
  const com = (vocabulario: unknown) => ({
    corpo: {
      id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: ['Dúvidas'],
      regras: 'r', dono: resumo(), moderadores: 1, voce: { papel: 'membro', pedidoPendente: false, convidado: false, banido: false }, ...(vocabulario === undefined ? {} : { vocabulario }),
    },
  })
  const ler = async (vocabulario: unknown) => {
    rele(RECURSOS_032, () => com(vocabulario))
    const c = await new ClienteHttp({ base }).comunidade(ob('c1'))
    return 'vocabulario' in c ? c.vocabulario : undefined
  }
  it('lê etiquetas, status com categorias e o padrão', async () => {
    const v = await ler({
      etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'vermelho' }],
      status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }, { chave: 'respondido', rotulo: 'Respondido', cor: 'azul', categorias: ['Dúvidas'] }],
      padrao: false,
    })
    expect(v).toEqual({
      etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'vermelho' }],
      status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }, { chave: 'respondido', rotulo: 'Respondido', cor: 'azul', categorias: ['Dúvidas'] }],
      padrao: false,
    })
    expect((await ler({ etiquetas: [], status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }], padrao: true }))?.padrao).toBe(true)
  })
  it('relé sem vocabulário: o objeto da comunidade não ganha a chave', async () => {
    rele([], () => com(undefined))
    const c = await new ClienteHttp({ base }).comunidade(ob('c1'))
    expect('vocabulario' in c).toBe(false)
  })
  it('item torto sai da lista; lista torta vira "sem vocabulário"; nada derruba a página', async () => {
    const ruins = [
      { chave: 'bug', rotulo: 'http://x.com', cor: 'azul' }, { chave: 'bug', rotulo: '[x](y)', cor: 'azul' }, { chave: 'bug', rotulo: '**x**', cor: 'azul' },
      { chave: 'bug', rotulo: 'Dois  espaços', cor: 'azul' }, { chave: 'bug', rotulo: ' Borda', cor: 'azul' }, { chave: 'bug', rotulo: 'Linha\nnova', cor: 'azul' },
      { chave: 'bug', rotulo: 'a'.repeat(25), cor: 'azul' }, { chave: 'bug', rotulo: 'B', cor: 'azul' }, { chave: 'bug', rotulo: 'Bug', cor: 'dourado' },
      { chave: 'bug', rotulo: 'Bug', cor: '#ff0000' }, { chave: 'Bug', rotulo: 'Bug', cor: 'azul' }, { chave: 'b', rotulo: 'Bug', cor: 'azul' },
      { chave: 'bug', rotulo: 7, cor: 'azul' }, { chave: 'bug', rotulo: 'Bug' }, null, 'texto', 7, [],
    ]
    const v = await ler({ etiquetas: [{ chave: 'ok', rotulo: 'Está bem', cor: 'cinza' }, ...ruins], status: ruins.map((r) => (typeof r === 'object' && r !== null && !Array.isArray(r) ? { ...r, categorias: null } : r)), padrao: false })
    expect(v?.etiquetas).toEqual([{ chave: 'ok', rotulo: 'Está bem', cor: 'cinza' }])
    expect(v?.status).toEqual([])
    for (const torta of [null, 'x', 5, [], { etiquetas: 'x', status: [] }, { etiquetas: [], status: 'x' }, { etiquetas: [] }, { status: [] }]) {
      expect(await ler(torta), JSON.stringify(torta)).toBeUndefined()
    }
  })
  it('limites: até 8 etiquetas e 6 status, sem chave repetida', async () => {
    const e = Array.from({ length: 12 }, (_, i) => ({ chave: `e${i}`, rotulo: `Etiqueta ${i}`, cor: 'azul' }))
    const s = Array.from({ length: 12 }, (_, i) => ({ chave: `s${i}`, rotulo: `Status ${i}`, cor: 'verde', categorias: null }))
    const v = await ler({ etiquetas: [e[0], ...e], status: [s[0], ...s], padrao: false })
    expect(v?.etiquetas.map((x) => x.chave)).toEqual(e.slice(0, 8).map((x) => x.chave))
    expect(v?.status.map((x) => x.chave)).toEqual(s.slice(0, 6).map((x) => x.chave))
  })
  it('categorias do status: vazia, torta ou só de lixo derruba o item; até 8; texto limpo', async () => {
    const st = (categorias: unknown) => ({ chave: 'x1', rotulo: 'Status', cor: 'verde', categorias })
    const v = await ler({ etiquetas: [], status: [st([]), st('Dúvidas'), st([1, 2]), st(undefined), st(['<b>Dúvidas</b>', 'Dicas']), st(Array.from({ length: 12 }, (_, i) => `C${i}`)).valueOf()], padrao: false })
    // o item com a mesma chave só entra uma vez: o primeiro válido (a lista com marcação limpa)
    expect(v?.status).toHaveLength(1)
    expect(v?.status[0].categorias).toEqual(['bDúvidas/b', 'Dicas'])
    const todos = await ler({ etiquetas: [], status: [{ chave: 'y1', rotulo: 'Todos', cor: 'verde', categorias: Array.from({ length: 12 }, (_, i) => `C${i}`) }], padrao: false })
    expect(todos?.status[0].categorias).toHaveLength(8)
  })
})

describe('respostas do tópico: ordem por pessoas', () => {
  const T = () => ob('t1')
  const lista = { corpo: { itens: [resposta] } }
  it('`antigas` nunca vai (é a ordem do relé 0.3); as outras só com o recurso; a janela só no em-alta', async () => {
    rele(RECURSOS_032, () => lista)
    const c = new ClienteHttp({ base })
    await c.respostas(T(), { ordem: 'antigas', janela: '7d' })
    await c.respostas(T(), { ordem: 'melhores', janela: '7d' })
    await c.respostas(T(), { ordem: 'em-alta', janela: '7d', cursor: '3' })
    await c.respostas(T(), { ordem: 'recentes', em: ob('r1') })
    expect(chamadas()).toEqual([
      `/v1/topicos/${T()}/respostas`,
      `/v1/topicos/${T()}/respostas?ordem=melhores`,
      `/v1/topicos/${T()}/respostas?antes=3&ordem=em-alta&janela=7d`,
      `/v1/topicos/${T()}/respostas?em=${ob('r1')}&ordem=recentes`,
    ])
  })
  it('relé sem o recurso: o pedido é o de sempre', async () => {
    rele([], () => lista)
    await new ClienteHttp({ base }).respostas(T(), { ordem: 'melhores', janela: '7d', em: ob('r1'), cursor: '4' })
    expect(chamadas()).toEqual([`/v1/topicos/${T()}/respostas?em=${ob('r1')}&antes=4`])
  })
  it('ordem ou janela fora da lista nem sai', async () => {
    rele(RECURSOS_032, () => lista)
    const c = new ClienteHttp({ base })
    expect(await codigo(() => c.respostas(T(), { ordem: 'popular' as never }))).toBe('invalido')
    expect(await codigo(() => c.respostas(T(), { ordem: 'em-alta', janela: '1h' as never }))).toBe('invalido')
    expect(chamadas()).toEqual([])
  })
})

describe('busca de tópicos: ordem', () => {
  const lista = { corpo: { itens: [cartao] } }
  it('relevância é o padrão e não vai; as outras só com o recurso e só na busca de tópicos', async () => {
    rele(RECURSOS_032, () => lista)
    const c = new ClienteHttp({ base })
    await c.buscarTipo('pasta', 'topicos')
    await c.buscarTipo('pasta', 'topicos', undefined, { ordem: 'relevancia' })
    await c.buscarTipo('pasta', 'topicos', '10', { ordem: 'em-alta', janela: '7d' })
    await c.buscarTipo('pasta', 'topicos', undefined, { ordem: 'melhores', janela: '7d' })
    expect(chamadas()).toEqual([
      '/v1/busca?q=pasta&tipo=topicos',
      '/v1/busca?q=pasta&tipo=topicos',
      '/v1/busca?q=pasta&tipo=topicos&antes=10&ordem=em-alta&janela=7d',
      '/v1/busca?q=pasta&tipo=topicos&ordem=melhores',
    ])
  })
  it('relé sem o recurso: a busca é a de antes', async () => {
    rele([], () => lista)
    await new ClienteHttp({ base }).buscarTipo('pasta', 'topicos', undefined, { ordem: 'melhores' })
    expect(chamadas()).toEqual(['/v1/busca?q=pasta&tipo=topicos'])
  })
  it('ordem em outro tipo de busca, ou fora da lista, nem sai (no relé 0.3.2 seria erro)', async () => {
    rele(RECURSOS_032, () => lista)
    const c = new ClienteHttp({ base })
    const fora = c.buscarTipo as unknown as (q: string, t: string, cur?: string, o?: unknown) => Promise<unknown>
    expect(await codigo(() => fora.call(c, 'pasta', 'rovers', undefined, { ordem: 'melhores' }))).toBe('invalido')
    expect(await codigo(() => fora.call(c, 'pasta', 'topicos', undefined, { ordem: 'popular' }))).toBe('invalido')
    expect(await codigo(() => fora.call(c, 'pasta', 'topicos', undefined, { ordem: 'em-alta', janela: '1h' }))).toBe('invalido')
    expect(chamadas()).toEqual([])
  })
})

describe('anúncios do relé', () => {
  const an = (n: string, extra: Record<string, unknown> = {}) => ({ id: AN(n), titulo: 'Aviso', texto: 'Texto do aviso.', em: T0, fixado: false, ...extra })
  it('relé sem o recurso: lista vazia, e a rota que não existe nem é chamada', async () => {
    rele([], () => ({ corpo: { itens: [an('x')] } }))
    expect(await new ClienteHttp({ base }).anuncios()).toEqual({ itens: [] })
    expect(chamadas()).toEqual([])
  })
  it('com o recurso: rota pública (sem cabeçalho de credencial), cursor numérico, campos limpos e `em` vira ISO', async () => {
    rele(RECURSOS_032, () => ({ corpo: { itens: [an('fixado', { fixado: true, titulo: 'Fixado <b>x</b>' }), an('novo', { em: T0 + 60 })], proximo: 12 } }))
    const p = await new ClienteHttp({ base, credencial: CRED }).anuncios('7')
    expect(chamadas()).toEqual(['/v1/anuncios?antes=7'])
    expect(vistos.find((v) => v.url.startsWith('/v1/anuncios'))!.cabecalhos.authorization).toBeUndefined()
    expect(p.proximo).toBe('12')
    expect(p.itens[0]).toEqual({ id: AN('fixado'), titulo: 'Fixado bx/b', texto: 'Texto do aviso.', criadoEm: new Date(T0 * 1000).toISOString(), fixado: true })
    expect(p.itens[1].criadoEm).toBe(new Date((T0 + 60) * 1000).toISOString())
    expect(Object.keys(p.itens[0]).sort()).toEqual(['criadoEm', 'fixado', 'id', 'texto', 'titulo'])
  })
  it('cursor fora do formato nem sai; id fora do formato, ou item sem texto, vira "fora do contrato" (a página mostra o erro, não um anúncio torto)', async () => {
    rele(RECURSOS_032, () => ({ corpo: { itens: [an('x')] } }))
    expect(await codigo(() => new ClienteHttp({ base }).anuncios('abc'))).toBe('invalido')
    for (const ruim of [an('x', { id: 'an_curto' }), an('x', { id: ob('t1') }), an('x', { texto: 5 }), an('x', { titulo: null }), an('x', { em: 'ontem' })]) {
      rele(RECURSOS_032, () => ({ corpo: { itens: [ruim] } }))
      expect(await codigo(() => new ClienteHttp({ base }).anuncios()), JSON.stringify(ruim)).toBe('indisponivel')
    }
  })
  it('texto de anúncio é texto: invisíveis saem, quebras de linha ficam, o limite é o do protocolo', async () => {
    rele(RECURSOS_032, () => ({ corpo: { itens: [an('x', { texto: `linha um​\nlinha dois${'z'.repeat(2100)}`, titulo: `${'T'.repeat(150)}\nquebra` })] } }))
    const [a] = (await new ClienteHttp({ base }).anuncios()).itens
    expect(a.texto.startsWith('linha um\nlinha dois')).toBe(true)
    expect(Array.from(a.texto)).toHaveLength(2000)
    expect(a.titulo).not.toContain('\n')
    expect(Array.from(a.titulo).length).toBeLessThanOrEqual(100)
  })
})

describe('painel de início', () => {
  const painel = {
    agora: T0, voce: { uid: uid('lumi'), contaDesde: T0 - 1000, atestadoExpiraEm: T0 + 5000 },
    avisos: { total: 7, porTipo: { recado: 2, 'resposta-no-topico': 5 } },
    atividade: [{ tipo: 'topico', id: ob('t1'), respostas: 3, reacoes: 2 }],
    pendencias: { amizades: { n: 1, uids: [uid('pipa')] }, depoimentos: 1, convites: [{ comunidade: ob('c1') }], pedidosDeEntrada: [{ comunidade: ob('c2'), n: 2 }] },
    moderacao: [{ comunidade: ob('c2'), denuncias: 2, apelacoes: 1 }],
    anuncios: { novos: 1, ultimo: { id: AN('novo'), em: T0 - 10 } },
  }
  it('sem o recurso: nulo, e nada é chamado', async () => {
    rele([], () => ({ corpo: painel }))
    expect(await new ClienteHttp({ base, credencial: CRED }).inicio()).toBeNull()
    expect(chamadas()).toEqual([])
  })
  it('sem a credencial do rover: nulo, e a chamada NEM SAI do computador (rota própria)', async () => {
    rele(RECURSOS_032, () => ({ corpo: painel }))
    expect(await new ClienteHttp({ base }).inicio()).toBeNull()
    expect(chamadas()).toEqual([])
  })
  it('com recurso e credencial: lê só ids, contagens e carimbos; `desde` em segundos vai no pedido', async () => {
    rele(RECURSOS_032, () => ({ corpo: painel }))
    const p = await new ClienteHttp({ base, credencial: CRED }).inicio(T0 - 60)
    expect(chamadas()).toEqual([`/v1/inicio?desde=${T0 - 60}`])
    expect(vistos.find((v) => v.url.startsWith('/v1/inicio'))!.cabecalhos.authorization).toBe('Bearer x')
    expect(p).toEqual({
      agora: T0, avisos: { total: 7, porTipo: { recado: 2, 'resposta-no-topico': 5 } },
      atividade: [{ tipo: 'topico', id: ob('t1'), respostas: 3, reacoes: 2 }],
      pendencias: { amizades: { n: 1, uids: [uid('pipa')] }, depoimentos: 1, convites: [ob('c1')], pedidosDeEntrada: [{ comunidade: ob('c2'), n: 2 }] },
      moderacao: [{ comunidade: ob('c2'), denuncias: 2, apelacoes: 1 }],
      anuncios: { novos: 1, ultimo: { id: AN('novo'), em: T0 - 10 } },
      atestadoExpiraEm: T0 + 5000,
    })
  })
  it('sem `desde` o pedido não leva parâmetro; `desde` inválido (negativo, quebrado, longe demais) é descartado em vez de enviado', async () => {
    rele(RECURSOS_032, () => ({ corpo: painel }))
    const c = new ClienteHttp({ base, credencial: CRED })
    await c.inicio()
    await c.inicio(0)
    await c.inicio(-1)
    await c.inicio(1.5)
    await c.inicio(Number.NaN)
    await c.inicio(4_102_444_801)
    await c.inicio(4_102_444_800)
    expect(chamadas()).toEqual(['/v1/inicio', '/v1/inicio?desde=0', '/v1/inicio', '/v1/inicio', '/v1/inicio', '/v1/inicio', '/v1/inicio?desde=4102444800'])
  })
  it('o que não é do molde (texto, título, nome, campo desconhecido) nunca passa', async () => {
    rele(RECURSOS_032, () => ({
      corpo: {
        ...painel, segredo: 'x', texto: 'Texto de alguém', titulo: 'Título de alguém',
        avisos: { total: 1, porTipo: { recado: 1, 'Tipo Torto': 9, '<script>': 1 }, trecho: 'o que ele disse' },
        atividade: [{ tipo: 'topico', id: ob('t1'), respostas: 1, reacoes: 0, titulo: 'Meu tópico', trecho: 'oi' }, { tipo: 'pagina', id: ob('t2'), respostas: 9, reacoes: 9 }],
        pendencias: { amizades: { n: 2, uids: [uid('pipa'), 'rvr_torto', 7], nomes: ['Pipa'] }, depoimentos: 0, convites: [{ comunidade: ob('c1'), nome: 'Comunidade Secreta' }], pedidosDeEntrada: [] },
      },
    }))
    const p = (await new ClienteHttp({ base, credencial: CRED }).inicio())!
    const json = JSON.stringify(p)
    for (const vazou of ['Texto de alguém', 'Título de alguém', 'Meu tópico', 'o que ele disse', 'Comunidade Secreta', 'Pipa', 'segredo', 'script', 'Tipo Torto', 'trecho']) expect(json).not.toContain(vazou)
    expect(p.avisos.porTipo).toEqual({ recado: 1 })
    expect(p.atividade).toEqual([{ tipo: 'topico', id: ob('t1'), respostas: 1, reacoes: 0 }])
    expect(p.pendencias.amizades.uids).toEqual([uid('pipa')])
  })
  it('listas passam do teto do protocolo? são cortadas (20 atividades, 10 convites, 10 uids, 20 comunidades)', async () => {
    const muitos = (n: number, f: (i: number) => unknown) => Array.from({ length: n }, (_, i) => f(i))
    rele(RECURSOS_032, () => ({
      corpo: {
        ...painel,
        atividade: muitos(30, (i) => ({ tipo: 'topico', id: ob(`t${i}`), respostas: 1, reacoes: 0 })),
        pendencias: {
          amizades: { n: 40, uids: muitos(15, (i) => uid(`r${i}`)) }, depoimentos: 2,
          convites: muitos(15, (i) => ({ comunidade: ob(`c${i}`) })), pedidosDeEntrada: muitos(25, (i) => ({ comunidade: ob(`c${i}`), n: 1 })),
        },
        moderacao: muitos(25, (i) => ({ comunidade: ob(`c${i}`), denuncias: 1, apelacoes: 0 })),
      },
    }))
    const p = (await new ClienteHttp({ base, credencial: CRED }).inicio())!
    expect(p.atividade).toHaveLength(20)
    expect(p.pendencias.amizades.uids).toHaveLength(10)
    expect(p.pendencias.amizades.n).toBe(40)
    expect(p.pendencias.convites).toHaveLength(10)
    expect(p.pendencias.pedidosDeEntrada).toHaveLength(20)
    expect(p.moderacao).toHaveLength(20)
  })
  it('credencial vencida (401) vira nulo, a tela cai no que já fazia; outro erro do relé continua erro', async () => {
    rele(RECURSOS_032, () => ({ status: 401, corpo: { erro: { codigo: 'leitura_nao_autorizada' } } }))
    expect(await new ClienteHttp({ base, credencial: CRED }).inicio()).toBeNull()
    rele(RECURSOS_032, () => ({ status: 500, corpo: {} }))
    expect(await codigo(() => new ClienteHttp({ base, credencial: CRED }).inicio())).toBe('indisponivel')
    rele(RECURSOS_032, () => ({ corpo: { agora: 'ontem' } }))
    expect((await new ClienteHttp({ base, credencial: CRED }).inicio())!.agora).toBe(0)
  })
  it('sem `voce.atestadoExpiraEm` o campo vem nulo (o relé 0.3.2 sempre manda, mas o cliente não inventa)', async () => {
    rele(RECURSOS_032, () => ({ corpo: { ...painel, voce: { uid: uid('lumi') } } }))
    expect((await new ClienteHttp({ base, credencial: CRED }).inicio())!.atestadoExpiraEm).toBeNull()
    rele(RECURSOS_032, () => ({ corpo: { agora: T0 } }))
    expect(await new ClienteHttp({ base, credencial: CRED }).inicio()).toMatchObject({ avisos: { total: 0, porTipo: {} }, atividade: [], moderacao: [], anuncios: { novos: 0, ultimo: null }, atestadoExpiraEm: null })
  })
})

// ---- furos que o medidor de mutação achou ----------------------------------------------------------------------------------------------

describe('credencial opcional e filtros soltos', () => {
  it('lista de tópicos, respostas e busca levam a credencial quando há (leitura opcional)', async () => {
    rele(RECURSOS_032, (url) => ({ corpo: url.includes('/respostas') ? { itens: [resposta] } : { itens: [cartao], fixados: [] } }))
    const c = new ClienteHttp({ base, credencial: CRED })
    await c.topicos(ob('c1'))
    await c.respostas(ob('t1'))
    await c.buscarTipo('pasta', 'topicos')
    const vs = vistos.filter((v) => v.url !== '/v1/info')
    expect(vs).toHaveLength(3)
    for (const v of vs) expect(v.cabecalhos.authorization, v.url).toBe('Bearer x')
  })
  it('só status, ou só etiqueta, também saem com o recurso `vocabulario`', async () => {
    rele(['vocabulario'], () => ({ corpo: { itens: [], fixados: [] } }))
    const c = new ClienteHttp({ base })
    await c.topicos(ob('c1'), { status: 'aberto' })
    await c.topicos(ob('c1'), { etiqueta: 'bug' })
    await c.topicos(ob('c1'), {})
    expect(chamadas()).toEqual([`/v1/comunidades/${ob('c1')}/topicos?status=aberto`, `/v1/comunidades/${ob('c1')}/topicos?etiqueta=bug`, `/v1/comunidades/${ob('c1')}/topicos`])
  })
  it('a busca de rovers continua devolvendo o rover com a descrição', async () => {
    rele([], () => ({ corpo: { itens: [{ ...resumo(), descricao: 'Exploro pastas.' }] } }))
    const p = await new ClienteHttp({ base }).buscarTipo('pipa', 'rovers')
    expect(p.itens[0]).toMatchObject({ handle: 'pipa', descricao: 'Exploro pastas.' })
  })
})

describe('saneamento: chaves, números e listas do vocabulário e do painel', () => {
  const comVoc = async (vocabulario: unknown) => {
    rele(RECURSOS_032, () => ({ corpo: { id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: [], regras: 'r', dono: resumo(), moderadores: 1, voce: null, vocabulario } }))
    const c = await new ClienteHttp({ base }).comunidade(ob('c1'))
    return 'vocabulario' in c ? c.vocabulario : undefined
  }
  const marcasDe = async (marcas: unknown) => {
    rele(RECURSOS_032, () => ({ corpo: { itens: [{ ...cartao, marcas }], fixados: [] } }))
    return (await new ClienteHttp({ base }).topicos(ob('c1'))).itens[0].marcas
  }
  it('chave que não é texto não vira a palavra "null" nem "undefined"', async () => {
    expect((await comVoc({ etiquetas: [{ chave: null, rotulo: 'Bug', cor: 'azul' }, { rotulo: 'Bug', cor: 'azul' }, { chave: 7, rotulo: 'Bug', cor: 'azul' }], status: [] }))?.etiquetas).toEqual([])
    expect(await marcasDe({ etiquetas: [null, undefined], status: null })).toBeUndefined()
    expect(await marcasDe({ etiquetas: ['bug'] })).toEqual({ etiquetas: ['bug'], status: null })
    expect(await marcasDe({ etiquetas: [], status: 7 })).toBeUndefined()
  })
  it('categorias em branco ou só de marcação somem; sem nenhuma que sobre, o status cai', async () => {
    const st = (categorias: unknown) => ({ chave: 'x1', rotulo: 'Status', cor: 'verde', categorias })
    expect((await comVoc({ etiquetas: [], status: [st(['', 'Dicas', '<>'])] }))?.status[0].categorias).toEqual(['Dicas'])
    expect((await comVoc({ etiquetas: [], status: [st(['', '<>', '  '])] }))?.status).toEqual([])
  })
  it('só os 16 primeiros itens de etiquetas e os 12 primeiros de status são lidos (o relé manda no máximo 8 e 6)', async () => {
    const lixo = Array.from({ length: 16 }, () => null)
    const bom = { chave: 'ok', rotulo: 'Está bem', cor: 'cinza' }
    expect((await comVoc({ etiquetas: [...lixo, bom], status: [] }))?.etiquetas).toEqual([])
    expect((await comVoc({ etiquetas: [...lixo.slice(1), bom], status: [] }))?.etiquetas).toEqual([bom])
    const bomS = { ...bom, categorias: null }
    expect((await comVoc({ etiquetas: [], status: [...Array.from({ length: 12 }, () => null), bomS] }))?.status).toEqual([])
    expect((await comVoc({ etiquetas: [], status: [...Array.from({ length: 11 }, () => null), bomS] }))?.status).toEqual([bomS])
  })
  it('a descrição da comunidade continua com várias linhas (o vocabulário não mudou isso)', async () => {
    rele(RECURSOS_032, () => ({ corpo: { id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: [], regras: 'um\ndois', dono: resumo(), moderadores: 1, voce: null } }))
    const c = await new ClienteHttp({ base }).comunidade(ob('c1'))
    expect('regras' in c && c.regras).toBe('um\ndois')
  })

  const ini = async (corpo: Record<string, unknown>) => {
    rele(RECURSOS_032, () => ({ corpo }))
    return (await new ClienteHttp({ base, credencial: CRED }).inicio())!
  }
  it('número que não é inteiro seguro e não negativo vira 0 (agora, carimbo do último anúncio, atestado)', async () => {
    for (const ruim of ['5', -3, 2.5, null, Number.POSITIVE_INFINITY, true, {}]) {
      const p = await ini({ agora: ruim, voce: { atestadoExpiraEm: ruim }, anuncios: { novos: 1, ultimo: { id: AN('x'), em: ruim } } })
      expect(p.agora, String(ruim)).toBe(0)
      expect(p.anuncios.ultimo?.em, String(ruim)).toBe(0)
      expect(p.atestadoExpiraEm, String(ruim)).toBe(typeof ruim === 'number' && Number.isFinite(ruim) ? 0 : null)
    }
    const zero = await ini({ agora: 0, anuncios: { novos: 0, ultimo: { id: AN('x'), em: 0 } } })
    expect(zero.agora).toBe(0)
    const ok = await ini({ agora: 17, voce: { atestadoExpiraEm: 18 }, anuncios: { novos: 1, ultimo: { id: AN('x'), em: 19 } } })
    expect([ok.agora, ok.atestadoExpiraEm, ok.anuncios.ultimo?.em]).toEqual([17, 18, 19])
  })
  it('uids de amizade que não vêm em lista viram lista vazia; id de anúncio que vem em lista não passa', async () => {
    expect((await ini({ pendencias: { amizades: { n: 1, uids: 'rvr_texto' } } })).pendencias.amizades.uids).toEqual([])
    expect((await ini({ pendencias: { amizades: { n: 1, uids: { 0: uid('pipa') } } } })).pendencias.amizades.uids).toEqual([])
    rele(RECURSOS_032, () => ({ corpo: { itens: [{ id: [AN('x')], titulo: 'T', texto: 'x', em: T0, fixado: false }] } }))
    expect(await codigo(() => new ClienteHttp({ base }).anuncios())).toBe('indisponivel')
  })
  it('tipos de aviso: no máximo 30 chaves; atividade aceita tópico e postagem, e só', async () => {
    const porTipo = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`tipo-${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, 1]))
    expect(Object.keys((await ini({ avisos: { total: 40, porTipo } })).avisos.porTipo)).toHaveLength(30)
    const a = await ini({ atividade: [{ tipo: 'postagem', id: ob('p1'), respostas: 2, reacoes: 1 }, { tipo: '', id: ob('p2'), respostas: 1, reacoes: 1 }, { tipo: 'topico', id: ob('t1'), respostas: 1, reacoes: 0 }] })
    expect(a.atividade.map((x) => x.tipo)).toEqual(['postagem', 'topico'])
  })
})
