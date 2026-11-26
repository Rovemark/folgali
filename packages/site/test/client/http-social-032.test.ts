import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { demoId } from '@/lib/domain/ids'
import { NetworkError } from '@/lib/types'

// What the HTTP client does with revision 0.3.2. Golden rule: a 0.3 or 0.3.1 relay (which does not declare the four new resources) receives EXACTLY
// the earlier request, and what relay 0.3.2 newly returns is screen decoration that goes through a closed list and never brings the page down.

type Seen = { metodo: string; url: string; cabecalhos: IncomingMessage['headers'] }
let server: Server
let base = ''
let seen: Seen[] = []
let respond: (url: string) => { status?: number; corpo?: unknown } = () => ({})

const uid = (n: string) => demoId('rvr', n)
const ob = (n: string) => demoId('ob', n)
const T0 = 1_793_000_000
const AN = (n: string) => `an_${n.padEnd(22, 'A').slice(0, 22)}`
const portrait = { corpo: 'bolinha', cor: 'ceu', veste: 'bandana', acessorio: 'chapeu' }
const summary = (n = 'pipa') => ({ uid: uid(n), handle: n, nome: n[0].toUpperCase() + n.slice(1), retrato: portrait })
const card = { id: ob('t1'), comunidade: ob('c1'), categoria: 'Dúvidas', titulo: 'Como nomear?', trecho: 'Eu uso datas.', autor: summary(), criadoEm: T0, atividadeEm: T0, respostas: 1, fixado: false, trancado: false, resolvido: false, tags: ['backup'], enquete: false, editado: false }
const reply = { id: ob('r1'), envelope: { objeto: { v: '0.3', tipo: 'resposta-forum', id: ob('r1'), autor: uid('pipa'), criadoEm: T0, previo: null, corpo: { texto: 'Eu uso datas.' }, assinatura: 'x' } }, autor: summary(), criadoEm: T0, em: null, cita: null, filhas: 0, resolveu: false, reacoes: { curtir: 0, util: 0 } }
const FEATURES_032 = ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios']
const CRED = async () => 'Bearer x'

/** The relay answers `/v1/info` with the requested resources and everything else with whatever the test sends. */
function relay(resources: string[], rest: (url: string) => { status?: number; corpo?: unknown }) {
  respond = (url) => (url === '/v1/info' ? { corpo: { protocolo: ['0.3'], social: true, recursos: resources } } : rest(url))
}
const calls = () => seen.filter((v) => v.url !== '/v1/info').map((v) => v.url)

beforeEach(async () => {
  seen = []
  respond = () => ({})
  server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      seen.push({ metodo: req.method ?? '', url: req.url ?? '', cabecalhos: req.headers })
      const r = respond(req.url ?? '')
      res.statusCode = r.status ?? 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(r.corpo ?? {}))
    })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((ok) => server.close(() => ok()))
})

const code = async (f: () => Promise<unknown>) => {
  try {
    await f()
    return 'ok'
  } catch (e) {
    if (e instanceof NetworkError) return e.codigo
    throw e
  }
}

describe('topic list: order by people, window and vocabulary filters', () => {
  const list = { corpo: { itens: [card], fixados: [] } }
  const C = () => ob('c1')
  it('relay 0.3 and 0.3.1: best, trending, window, status and label do NOT go out; the request is the usual one', async () => {
    relay([], () => list)
    const c = new HttpClient({ base })
    await c.topicos(C(), { ordem: 'melhores', janela: '7d', status: 'aberto', etiqueta: 'bug', categoria: 'Dúvidas', cursor: '5' })
    await c.topicos(C(), { ordem: 'em-alta', janela: '7d' })
    expect(calls()).toEqual([`/v1/comunidades/${C()}/topicos?categoria=D%C3%BAvidas&antes=5`, `/v1/comunidades/${C()}/topicos`])
  })
  it('the earlier orders keep working on the old relay, at the same parameter position', async () => {
    relay([], () => list)
    await new HttpClient({ base }).topicos(C(), { categoria: 'Dicas', tag: 'backup', ordem: 'ativos', cursor: '5' })
    expect(calls()).toEqual([`/v1/comunidades/${C()}/topicos?categoria=Dicas&tag=backup&ordem=ativos&antes=5`])
  })
  it('relay 0.3.2: ordem=melhores; trending takes the window; another order\'s window never goes', async () => {
    relay(FEATURES_032, () => list)
    const c = new HttpClient({ base })
    await c.topicos(C(), { ordem: 'melhores', janela: '7d' })
    await c.topicos(C(), { ordem: 'em-alta', janela: '7d', cursor: '8' })
    await c.topicos(C(), { ordem: 'em-alta' })
    await c.topicos(C(), { ordem: 'recentes', janela: '24h' })
    expect(calls()).toEqual([
      `/v1/comunidades/${C()}/topicos?ordem=melhores`,
      `/v1/comunidades/${C()}/topicos?ordem=em-alta&antes=8&janela=7d`,
      `/v1/comunidades/${C()}/topicos?ordem=em-alta`,
      `/v1/comunidades/${C()}/topicos?ordem=recentes`,
    ])
  })
  it('status and label only go out with the `vocabulario` resource (and do not depend on the order resource)', async () => {
    relay(['vocabulario'], () => list)
    await new HttpClient({ base }).topicos(C(), { status: 'aberto', etiqueta: 'bug', ordem: 'melhores' })
    relay(['ordem-por-pessoas'], () => list)
    await new HttpClient({ base }).topicos(C(), { status: 'aberto', etiqueta: 'bug', ordem: 'melhores' })
    expect(calls()).toEqual([`/v1/comunidades/${C()}/topicos?status=aberto&etiqueta=bug`, `/v1/comunidades/${C()}/topicos?ordem=melhores`])
  })
  it('values outside the closed list do not even leave the computer', async () => {
    relay(FEATURES_032, () => list)
    const c = new HttpClient({ base })
    for (const bad of [{ ordem: 'popular' }, { janela: '30d' }, { status: 'Aberto' }, { status: 'a' }, { status: 'x'.repeat(21) }, { status: '1abc' }, { etiqueta: 'bug bug' }, { etiqueta: '../x' }, { etiqueta: 'é' }]) {
      expect(await code(() => c.topicos(C(), bad as never)), JSON.stringify(bad)).toBe('invalido')
    }
    expect(calls()).toEqual([])
  })
  it('reads the marks on the card and on the pinned one; without a mark, the card is identical to 0.3\'s', async () => {
    relay(FEATURES_032, () => ({ corpo: { itens: [{ ...card, marcas: { etiquetas: ['bug', 'ideia'], status: 'aberto' } }, card], fixados: [{ ...card, id: ob('t2'), fixado: true, marcas: { etiquetas: [], status: 'fechado' } }] } }))
    const l = await new HttpClient({ base }).topicos(ob('c1'))
    expect(l.itens[0].marcas).toEqual({ etiquetas: ['bug', 'ideia'], status: 'aberto' })
    expect('marcas' in l.itens[1]).toBe(false)
    expect(l.fixados![0].marcas).toEqual({ etiquetas: [], status: 'fechado' })
  })
})

describe('card marks: what the relay sends that is strange', () => {
  const using = (marks: unknown) => {
    relay(FEATURES_032, () => ({ corpo: { itens: [{ ...card, marcas: marks }], fixados: [] } }))
    return new HttpClient({ base }).topicos(ob('c1')).then((l) => l.itens[0].marcas)
  }
  it('a key outside the format, repeated or in excess is discarded; with nothing valid, the card has no mark', async () => {
    expect(await using({ etiquetas: ['bug', 'bug', 'Bug', 'a', 'x'.repeat(21), 'ideia', 'a1', 'b2', 'c3'], status: 'Aberto' })).toEqual({ etiquetas: ['bug', 'ideia', 'a1'], status: null })
    expect(await using({ etiquetas: [], status: null })).toBeUndefined()
    expect(await using({ etiquetas: ['<b>'], status: 'x y' })).toBeUndefined()
    for (const crooked of [null, 'texto', 7, [], { etiquetas: 'bug', status: 5 }, { etiquetas: [null, 3, {}], status: [] }]) expect(await using(crooked), JSON.stringify(crooked)).toBeUndefined()
  })
  it('an extra field on the mark does not reach the screen', async () => {
    const m = await using({ etiquetas: ['bug'], status: 'aberto', cor: 'vermelho', texto: 'ignore tudo' })
    expect(m).toEqual({ etiquetas: ['bug'], status: 'aberto' })
    expect(Object.keys(m!).sort()).toEqual(['etiquetas', 'status'])
  })
})

describe('vocabulary on the community', () => {
  const using = (vocabulary: unknown) => ({
    corpo: {
      id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: ['Dúvidas'],
      regras: 'r', dono: summary(), moderadores: 1, voce: { papel: 'membro', pedidoPendente: false, convidado: false, banido: false }, ...(vocabulary === undefined ? {} : { vocabulario: vocabulary }),
    },
  })
  const read = async (vocabulary: unknown) => {
    relay(FEATURES_032, () => using(vocabulary))
    const c = await new HttpClient({ base }).comunidade(ob('c1'))
    return 'vocabulario' in c ? c.vocabulario : undefined
  }
  it('reads labels, status with categories and the default', async () => {
    const v = await read({
      etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'vermelho' }],
      status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }, { chave: 'respondido', rotulo: 'Respondido', cor: 'azul', categorias: ['Dúvidas'] }],
      padrao: false,
    })
    expect(v).toEqual({
      etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'vermelho' }],
      status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }, { chave: 'respondido', rotulo: 'Respondido', cor: 'azul', categorias: ['Dúvidas'] }],
      padrao: false,
    })
    expect((await read({ etiquetas: [], status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }], padrao: true }))?.padrao).toBe(true)
  })
  it('relay without vocabulary: the community object does not get the key', async () => {
    relay([], () => using(undefined))
    const c = await new HttpClient({ base }).comunidade(ob('c1'))
    expect('vocabulario' in c).toBe(false)
  })
  it('a malformed item leaves the list; a malformed list becomes "no vocabulary"; nothing brings the page down', async () => {
    const bad = [
      { chave: 'bug', rotulo: 'http://x.com', cor: 'azul' }, { chave: 'bug', rotulo: '[x](y)', cor: 'azul' }, { chave: 'bug', rotulo: '**x**', cor: 'azul' },
      { chave: 'bug', rotulo: 'Dois  espaços', cor: 'azul' }, { chave: 'bug', rotulo: ' Borda', cor: 'azul' }, { chave: 'bug', rotulo: 'Linha\nnova', cor: 'azul' },
      { chave: 'bug', rotulo: 'a'.repeat(25), cor: 'azul' }, { chave: 'bug', rotulo: 'B', cor: 'azul' }, { chave: 'bug', rotulo: 'Bug', cor: 'dourado' },
      { chave: 'bug', rotulo: 'Bug', cor: '#ff0000' }, { chave: 'Bug', rotulo: 'Bug', cor: 'azul' }, { chave: 'b', rotulo: 'Bug', cor: 'azul' },
      { chave: 'bug', rotulo: 7, cor: 'azul' }, { chave: 'bug', rotulo: 'Bug' }, null, 'texto', 7, [],
    ]
    const v = await read({ etiquetas: [{ chave: 'ok', rotulo: 'Está bem', cor: 'cinza' }, ...bad], status: bad.map((r) => (typeof r === 'object' && r !== null && !Array.isArray(r) ? { ...r, categorias: null } : r)), padrao: false })
    expect(v?.etiquetas).toEqual([{ chave: 'ok', rotulo: 'Está bem', cor: 'cinza' }])
    expect(v?.status).toEqual([])
    for (const crooked_ of [null, 'x', 5, [], { etiquetas: 'x', status: [] }, { etiquetas: [], status: 'x' }, { etiquetas: [] }, { status: [] }]) {
      expect(await read(crooked_), JSON.stringify(crooked_)).toBeUndefined()
    }
  })
  it('limits: up to 8 labels and 6 statuses, no repeated key', async () => {
    const e = Array.from({ length: 12 }, (_, i) => ({ chave: `e${i}`, rotulo: `Etiqueta ${i}`, cor: 'azul' }))
    const s = Array.from({ length: 12 }, (_, i) => ({ chave: `s${i}`, rotulo: `Status ${i}`, cor: 'verde', categorias: null }))
    const v = await read({ etiquetas: [e[0], ...e], status: [s[0], ...s], padrao: false })
    expect(v?.etiquetas.map((x) => x.chave)).toEqual(e.slice(0, 8).map((x) => x.chave))
    expect(v?.status.map((x) => x.chave)).toEqual(s.slice(0, 6).map((x) => x.chave))
  })
  it('status categories: empty, malformed or only junk brings the item down; up to 8; clean text', async () => {
    const st = (categories: unknown) => ({ chave: 'x1', rotulo: 'Status', cor: 'verde', categorias: categories })
    const v = await read({ etiquetas: [], status: [st([]), st('Dúvidas'), st([1, 2]), st(undefined), st(['<b>Dúvidas</b>', 'Dicas']), st(Array.from({ length: 12 }, (_, i) => `C${i}`)).valueOf()], padrao: false })
    // the item with the same key only enters once: the first valid one (the list with clean markup)
    expect(v?.status).toHaveLength(1)
    expect(v?.status[0].categorias).toEqual(['bDúvidas/b', 'Dicas'])
    const all = await read({ etiquetas: [], status: [{ chave: 'y1', rotulo: 'Todos', cor: 'verde', categorias: Array.from({ length: 12 }, (_, i) => `C${i}`) }], padrao: false })
    expect(all?.status[0].categorias).toHaveLength(8)
  })
})

describe('topic replies: order by people', () => {
  const T = () => ob('t1')
  const list = { corpo: { itens: [reply] } }
  it('`antigas` never goes (it is the 0.3 relay\'s order); the others only with the resource; the window only on trending', async () => {
    relay(FEATURES_032, () => list)
    const c = new HttpClient({ base })
    await c.respostas(T(), { ordem: 'antigas', janela: '7d' })
    await c.respostas(T(), { ordem: 'melhores', janela: '7d' })
    await c.respostas(T(), { ordem: 'em-alta', janela: '7d', cursor: '3' })
    await c.respostas(T(), { ordem: 'recentes', em: ob('r1') })
    expect(calls()).toEqual([
      `/v1/topicos/${T()}/respostas`,
      `/v1/topicos/${T()}/respostas?ordem=melhores`,
      `/v1/topicos/${T()}/respostas?antes=3&ordem=em-alta&janela=7d`,
      `/v1/topicos/${T()}/respostas?em=${ob('r1')}&ordem=recentes`,
    ])
  })
  it('relay without the resource: the request is the usual one', async () => {
    relay([], () => list)
    await new HttpClient({ base }).respostas(T(), { ordem: 'melhores', janela: '7d', em: ob('r1'), cursor: '4' })
    expect(calls()).toEqual([`/v1/topicos/${T()}/respostas?em=${ob('r1')}&antes=4`])
  })
  it('an order or window outside the list does not even go out', async () => {
    relay(FEATURES_032, () => list)
    const c = new HttpClient({ base })
    expect(await code(() => c.respostas(T(), { ordem: 'popular' as never }))).toBe('invalido')
    expect(await code(() => c.respostas(T(), { ordem: 'em-alta', janela: '1h' as never }))).toBe('invalido')
    expect(calls()).toEqual([])
  })
})

describe('topic search: order', () => {
  const list = { corpo: { itens: [card] } }
  it('relevance is the default and does not go; the others only with the resource and only on topic search', async () => {
    relay(FEATURES_032, () => list)
    const c = new HttpClient({ base })
    await c.buscarTipo('pasta', 'topicos')
    await c.buscarTipo('pasta', 'topicos', undefined, { ordem: 'relevancia' })
    await c.buscarTipo('pasta', 'topicos', '10', { ordem: 'em-alta', janela: '7d' })
    await c.buscarTipo('pasta', 'topicos', undefined, { ordem: 'melhores', janela: '7d' })
    expect(calls()).toEqual([
      '/v1/busca?q=pasta&tipo=topicos',
      '/v1/busca?q=pasta&tipo=topicos',
      '/v1/busca?q=pasta&tipo=topicos&antes=10&ordem=em-alta&janela=7d',
      '/v1/busca?q=pasta&tipo=topicos&ordem=melhores',
    ])
  })
  it('relay without the resource: the search is the earlier one', async () => {
    relay([], () => list)
    await new HttpClient({ base }).buscarTipo('pasta', 'topicos', undefined, { ordem: 'melhores' })
    expect(calls()).toEqual(['/v1/busca?q=pasta&tipo=topicos'])
  })
  it('an order on another kind of search, or outside the list, does not even go out (on relay 0.3.2 it would be an error)', async () => {
    relay(FEATURES_032, () => list)
    const c = new HttpClient({ base })
    const outside = c.buscarTipo as unknown as (q: string, t: string, cur?: string, o?: unknown) => Promise<unknown>
    expect(await code(() => outside.call(c, 'pasta', 'rovers', undefined, { ordem: 'melhores' }))).toBe('invalido')
    expect(await code(() => outside.call(c, 'pasta', 'topicos', undefined, { ordem: 'popular' }))).toBe('invalido')
    expect(await code(() => outside.call(c, 'pasta', 'topicos', undefined, { ordem: 'em-alta', janela: '1h' }))).toBe('invalido')
    expect(calls()).toEqual([])
  })
})

describe('relay announcements', () => {
  const an = (n: string, extra: Record<string, unknown> = {}) => ({ id: AN(n), titulo: 'Aviso', texto: 'Texto do aviso.', em: T0, fixado: false, ...extra })
  it('relay without the resource: empty list, and the route that does not exist is not even called', async () => {
    relay([], () => ({ corpo: { itens: [an('x')] } }))
    expect(await new HttpClient({ base }).anuncios()).toEqual({ itens: [] })
    expect(calls()).toEqual([])
  })
  it('with the resource: public route (no credential header), numeric cursor, clean fields and `em` becomes ISO', async () => {
    relay(FEATURES_032, () => ({ corpo: { itens: [an('fixado', { fixado: true, titulo: 'Fixado <b>x</b>' }), an('novo', { em: T0 + 60 })], proximo: 12 } }))
    const p = await new HttpClient({ base, credencial: CRED }).anuncios('7')
    expect(calls()).toEqual(['/v1/anuncios?antes=7'])
    expect(seen.find((v) => v.url.startsWith('/v1/anuncios'))!.cabecalhos.authorization).toBeUndefined()
    expect(p.proximo).toBe('12')
    expect(p.itens[0]).toEqual({ id: AN('fixado'), titulo: 'Fixado bx/b', texto: 'Texto do aviso.', criadoEm: new Date(T0 * 1000).toISOString(), fixado: true })
    expect(p.itens[1].criadoEm).toBe(new Date((T0 + 60) * 1000).toISOString())
    expect(Object.keys(p.itens[0]).sort()).toEqual(['criadoEm', 'fixado', 'id', 'texto', 'titulo'])
  })
  it('a cursor outside the format does not even go out; an id outside the format, or an item without text, becomes "outside the contract" (the page shows the error, not a malformed announcement)', async () => {
    relay(FEATURES_032, () => ({ corpo: { itens: [an('x')] } }))
    expect(await code(() => new HttpClient({ base }).anuncios('abc'))).toBe('invalido')
    for (const bad of [an('x', { id: 'an_curto' }), an('x', { id: ob('t1') }), an('x', { texto: 5 }), an('x', { titulo: null }), an('x', { em: 'ontem' })]) {
      relay(FEATURES_032, () => ({ corpo: { itens: [bad] } }))
      expect(await code(() => new HttpClient({ base }).anuncios()), JSON.stringify(bad)).toBe('indisponivel')
    }
  })
  it('announcement text is text: invisibles go out, line breaks stay, the limit is the protocol\'s', async () => {
    relay(FEATURES_032, () => ({ corpo: { itens: [an('x', { texto: `linha um​\nlinha dois${'z'.repeat(2100)}`, titulo: `${'T'.repeat(150)}\nquebra` })] } }))
    const [a] = (await new HttpClient({ base }).anuncios()).itens
    expect(a.texto.startsWith('linha um\nlinha dois')).toBe(true)
    expect(Array.from(a.texto)).toHaveLength(2000)
    expect(a.titulo).not.toContain('\n')
    expect(Array.from(a.titulo).length).toBeLessThanOrEqual(100)
  })
})

describe('home panel', () => {
  const panel = {
    agora: T0, voce: { uid: uid('lumi'), contaDesde: T0 - 1000, atestadoExpiraEm: T0 + 5000 },
    avisos: { total: 7, porTipo: { recado: 2, 'resposta-no-topico': 5 } },
    atividade: [{ tipo: 'topico', id: ob('t1'), respostas: 3, reacoes: 2 }],
    pendencias: { amizades: { n: 1, uids: [uid('pipa')] }, depoimentos: 1, convites: [{ comunidade: ob('c1') }], pedidosDeEntrada: [{ comunidade: ob('c2'), n: 2 }] },
    moderacao: [{ comunidade: ob('c2'), denuncias: 2, apelacoes: 1 }],
    anuncios: { novos: 1, ultimo: { id: AN('novo'), em: T0 - 10 } },
  }
  it('without the resource: null, and nothing is called', async () => {
    relay([], () => ({ corpo: panel }))
    expect(await new HttpClient({ base, credencial: CRED }).inicio()).toBeNull()
    expect(calls()).toEqual([])
  })
  it('without the rover\'s credential: null, and the call DOES NOT EVEN leave the computer (own route)', async () => {
    relay(FEATURES_032, () => ({ corpo: panel }))
    expect(await new HttpClient({ base }).inicio()).toBeNull()
    expect(calls()).toEqual([])
  })
  it('with the resource and the credential: reads only ids, counts and stamps; `desde` in seconds goes in the request', async () => {
    relay(FEATURES_032, () => ({ corpo: panel }))
    const p = await new HttpClient({ base, credencial: CRED }).inicio(T0 - 60)
    expect(calls()).toEqual([`/v1/inicio?desde=${T0 - 60}`])
    expect(seen.find((v) => v.url.startsWith('/v1/inicio'))!.cabecalhos.authorization).toBe('Bearer x')
    expect(p).toEqual({
      agora: T0, avisos: { total: 7, porTipo: { recado: 2, 'resposta-no-topico': 5 } },
      atividade: [{ tipo: 'topico', id: ob('t1'), respostas: 3, reacoes: 2 }],
      pendencias: { amizades: { n: 1, uids: [uid('pipa')] }, depoimentos: 1, convites: [ob('c1')], pedidosDeEntrada: [{ comunidade: ob('c2'), n: 2 }] },
      moderacao: [{ comunidade: ob('c2'), denuncias: 2, apelacoes: 1 }],
      anuncios: { novos: 1, ultimo: { id: AN('novo'), em: T0 - 10 } },
      atestadoExpiraEm: T0 + 5000,
    })
  })
  it('without `desde` the request carries no parameter; an invalid `desde` (negative, broken, too far) is discarded instead of sent', async () => {
    relay(FEATURES_032, () => ({ corpo: panel }))
    const c = new HttpClient({ base, credencial: CRED })
    await c.inicio()
    await c.inicio(0)
    await c.inicio(-1)
    await c.inicio(1.5)
    await c.inicio(Number.NaN)
    await c.inicio(4_102_444_801)
    await c.inicio(4_102_444_800)
    expect(calls()).toEqual(['/v1/inicio', '/v1/inicio?desde=0', '/v1/inicio', '/v1/inicio', '/v1/inicio', '/v1/inicio', '/v1/inicio?desde=4102444800'])
  })
  it('what is not in the mold (text, title, name, unknown field) never passes', async () => {
    relay(FEATURES_032, () => ({
      corpo: {
        ...panel, segredo: 'x', texto: 'Texto de alguém', titulo: 'Título de alguém',
        avisos: { total: 1, porTipo: { recado: 1, 'Tipo Torto': 9, '<script>': 1 }, trecho: 'o que ele disse' },
        atividade: [{ tipo: 'topico', id: ob('t1'), respostas: 1, reacoes: 0, titulo: 'Meu tópico', trecho: 'oi' }, { tipo: 'pagina', id: ob('t2'), respostas: 9, reacoes: 9 }],
        pendencias: { amizades: { n: 2, uids: [uid('pipa'), 'rvr_torto', 7], nomes: ['Pipa'] }, depoimentos: 0, convites: [{ comunidade: ob('c1'), nome: 'Comunidade Secreta' }], pedidosDeEntrada: [] },
      },
    }))
    const p = (await new HttpClient({ base, credencial: CRED }).inicio())!
    const json = JSON.stringify(p)
    for (const leaked of ['Texto de alguém', 'Título de alguém', 'Meu tópico', 'o que ele disse', 'Comunidade Secreta', 'Pipa', 'segredo', 'script', 'Tipo Torto', 'trecho']) expect(json).not.toContain(leaked)
    expect(p.avisos.porTipo).toEqual({ recado: 1 })
    expect(p.atividade).toEqual([{ tipo: 'topico', id: ob('t1'), respostas: 1, reacoes: 0 }])
    expect(p.pendencias.amizades.uids).toEqual([uid('pipa')])
  })
  it('do lists exceed the protocol ceiling? they are cut (20 activities, 10 invitations, 10 uids, 20 communities)', async () => {
    const many = (n: number, f: (i: number) => unknown) => Array.from({ length: n }, (_, i) => f(i))
    relay(FEATURES_032, () => ({
      corpo: {
        ...panel,
        atividade: many(30, (i) => ({ tipo: 'topico', id: ob(`t${i}`), respostas: 1, reacoes: 0 })),
        pendencias: {
          amizades: { n: 40, uids: many(15, (i) => uid(`r${i}`)) }, depoimentos: 2,
          convites: many(15, (i) => ({ comunidade: ob(`c${i}`) })), pedidosDeEntrada: many(25, (i) => ({ comunidade: ob(`c${i}`), n: 1 })),
        },
        moderacao: many(25, (i) => ({ comunidade: ob(`c${i}`), denuncias: 1, apelacoes: 0 })),
      },
    }))
    const p = (await new HttpClient({ base, credencial: CRED }).inicio())!
    expect(p.atividade).toHaveLength(20)
    expect(p.pendencias.amizades.uids).toHaveLength(10)
    expect(p.pendencias.amizades.n).toBe(40)
    expect(p.pendencias.convites).toHaveLength(10)
    expect(p.pendencias.pedidosDeEntrada).toHaveLength(20)
    expect(p.moderacao).toHaveLength(20)
  })
  it('an expired credential (401) becomes null, the screen falls back to what it already did; another relay error remains an error', async () => {
    relay(FEATURES_032, () => ({ status: 401, corpo: { erro: { codigo: 'leitura_nao_autorizada' } } }))
    expect(await new HttpClient({ base, credencial: CRED }).inicio()).toBeNull()
    relay(FEATURES_032, () => ({ status: 500, corpo: {} }))
    expect(await code(() => new HttpClient({ base, credencial: CRED }).inicio())).toBe('indisponivel')
    relay(FEATURES_032, () => ({ corpo: { agora: 'ontem' } }))
    expect((await new HttpClient({ base, credencial: CRED }).inicio())!.agora).toBe(0)
  })
  it('without `voce.atestadoExpiraEm` the field comes null (relay 0.3.2 always sends it, but the client does not invent it)', async () => {
    relay(FEATURES_032, () => ({ corpo: { ...panel, voce: { uid: uid('lumi') } } }))
    expect((await new HttpClient({ base, credencial: CRED }).inicio())!.atestadoExpiraEm).toBeNull()
    relay(FEATURES_032, () => ({ corpo: { agora: T0 } }))
    expect(await new HttpClient({ base, credencial: CRED }).inicio()).toMatchObject({ avisos: { total: 0, porTipo: {} }, atividade: [], moderacao: [], anuncios: { novos: 0, ultimo: null }, atestadoExpiraEm: null })
  })
})

// ---- holes the mutation testing found ----------------------------------------------------------------------------------------------

describe('credencial opcional e filtros soltos', () => {
  it('topic list, replies and search carry the credential when there is one (optional read)', async () => {
    relay(FEATURES_032, (url) => ({ corpo: url.includes('/respostas') ? { itens: [reply] } : { itens: [card], fixados: [] } }))
    const c = new HttpClient({ base, credencial: CRED })
    await c.topicos(ob('c1'))
    await c.respostas(ob('t1'))
    await c.buscarTipo('pasta', 'topicos')
    const vs = seen.filter((v) => v.url !== '/v1/info')
    expect(vs).toHaveLength(3)
    for (const v of vs) expect(v.cabecalhos.authorization, v.url).toBe('Bearer x')
  })
  it('only status, or only label, also go out with the `vocabulario` resource', async () => {
    relay(['vocabulario'], () => ({ corpo: { itens: [], fixados: [] } }))
    const c = new HttpClient({ base })
    await c.topicos(ob('c1'), { status: 'aberto' })
    await c.topicos(ob('c1'), { etiqueta: 'bug' })
    await c.topicos(ob('c1'), {})
    expect(calls()).toEqual([`/v1/comunidades/${ob('c1')}/topicos?status=aberto`, `/v1/comunidades/${ob('c1')}/topicos?etiqueta=bug`, `/v1/comunidades/${ob('c1')}/topicos`])
  })
  it('rover search keeps returning the rover with the description', async () => {
    relay([], () => ({ corpo: { itens: [{ ...summary(), descricao: 'Exploro pastas.' }] } }))
    const p = await new HttpClient({ base }).buscarTipo('pipa', 'rovers')
    expect(p.itens[0]).toMatchObject({ handle: 'pipa', descricao: 'Exploro pastas.' })
  })
})

describe('sanitizing: keys, numbers and lists of the vocabulary and the panel', () => {
  const withVocab = async (vocabulary: unknown) => {
    relay(FEATURES_032, () => ({ corpo: { id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: [], regras: 'r', dono: summary(), moderadores: 1, voce: null, vocabulario: vocabulary } }))
    const c = await new HttpClient({ base }).comunidade(ob('c1'))
    return 'vocabulario' in c ? c.vocabulario : undefined
  }
  const marksOf = async (marks: unknown) => {
    relay(FEATURES_032, () => ({ corpo: { itens: [{ ...card, marcas: marks }], fixados: [] } }))
    return (await new HttpClient({ base }).topicos(ob('c1'))).itens[0].marcas
  }
  it('a key that is not text does not become the word "null" or "undefined"', async () => {
    expect((await withVocab({ etiquetas: [{ chave: null, rotulo: 'Bug', cor: 'azul' }, { rotulo: 'Bug', cor: 'azul' }, { chave: 7, rotulo: 'Bug', cor: 'azul' }], status: [] }))?.etiquetas).toEqual([])
    expect(await marksOf({ etiquetas: [null, undefined], status: null })).toBeUndefined()
    expect(await marksOf({ etiquetas: ['bug'] })).toEqual({ etiquetas: ['bug'], status: null })
    expect(await marksOf({ etiquetas: [], status: 7 })).toBeUndefined()
  })
  it('blank categories or only markup disappear; with none left, the status drops', async () => {
    const st = (categories: unknown) => ({ chave: 'x1', rotulo: 'Status', cor: 'verde', categorias: categories })
    expect((await withVocab({ etiquetas: [], status: [st(['', 'Dicas', '<>'])] }))?.status[0].categorias).toEqual(['Dicas'])
    expect((await withVocab({ etiquetas: [], status: [st(['', '<>', '  '])] }))?.status).toEqual([])
  })
  it('only the first 16 label items and the first 12 status items are read (the relay sends at most 8 and 6)', async () => {
    const junk = Array.from({ length: 16 }, () => null)
    const good = { chave: 'ok', rotulo: 'Está bem', cor: 'cinza' }
    expect((await withVocab({ etiquetas: [...junk, good], status: [] }))?.etiquetas).toEqual([])
    expect((await withVocab({ etiquetas: [...junk.slice(1), good], status: [] }))?.etiquetas).toEqual([good])
    const goodS = { ...good, categorias: null }
    expect((await withVocab({ etiquetas: [], status: [...Array.from({ length: 12 }, () => null), goodS] }))?.status).toEqual([])
    expect((await withVocab({ etiquetas: [], status: [...Array.from({ length: 11 }, () => null), goodS] }))?.status).toEqual([goodS])
  })
  it('the community description keeps several lines (the vocabulary did not change that)', async () => {
    relay(FEATURES_032, () => ({ corpo: { id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: [], regras: 'um\ndois', dono: summary(), moderadores: 1, voce: null } }))
    const c = await new HttpClient({ base }).comunidade(ob('c1'))
    expect('regras' in c && c.regras).toBe('um\ndois')
  })

  const ini = async (body: Record<string, unknown>) => {
    relay(FEATURES_032, () => ({ corpo: body }))
    return (await new HttpClient({ base, credencial: CRED }).inicio())!
  }
  it('a number that is not a safe integer and not non-negative becomes 0 (now, the last announcement\'s stamp, attestation)', async () => {
    for (const bad of ['5', -3, 2.5, null, Number.POSITIVE_INFINITY, true, {}]) {
      const p = await ini({ agora: bad, voce: { atestadoExpiraEm: bad }, anuncios: { novos: 1, ultimo: { id: AN('x'), em: bad } } })
      expect(p.agora, String(bad)).toBe(0)
      expect(p.anuncios.ultimo?.em, String(bad)).toBe(0)
      expect(p.atestadoExpiraEm, String(bad)).toBe(typeof bad === 'number' && Number.isFinite(bad) ? 0 : null)
    }
    const zero = await ini({ agora: 0, anuncios: { novos: 0, ultimo: { id: AN('x'), em: 0 } } })
    expect(zero.agora).toBe(0)
    const ok = await ini({ agora: 17, voce: { atestadoExpiraEm: 18 }, anuncios: { novos: 1, ultimo: { id: AN('x'), em: 19 } } })
    expect([ok.agora, ok.atestadoExpiraEm, ok.anuncios.ultimo?.em]).toEqual([17, 18, 19])
  })
  it('friendship uids that do not come as a list become an empty list; an announcement id that comes as a list does not pass', async () => {
    expect((await ini({ pendencias: { amizades: { n: 1, uids: 'rvr_texto' } } })).pendencias.amizades.uids).toEqual([])
    expect((await ini({ pendencias: { amizades: { n: 1, uids: { 0: uid('pipa') } } } })).pendencias.amizades.uids).toEqual([])
    relay(FEATURES_032, () => ({ corpo: { itens: [{ id: [AN('x')], titulo: 'T', texto: 'x', em: T0, fixado: false }] } }))
    expect(await code(() => new HttpClient({ base }).anuncios())).toBe('indisponivel')
  })
  it('notice types: at most 30 keys; activity accepts topic and post, and only those', async () => {
    const byType = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`tipo-${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, 1]))
    expect(Object.keys((await ini({ avisos: { total: 40, porTipo: byType } })).avisos.porTipo)).toHaveLength(30)
    const a = await ini({ atividade: [{ tipo: 'postagem', id: ob('p1'), respostas: 2, reacoes: 1 }, { tipo: '', id: ob('p2'), respostas: 1, reacoes: 1 }, { tipo: 'topico', id: ob('t1'), respostas: 1, reacoes: 0 }] })
    expect(a.atividade.map((x) => x.tipo)).toEqual(['postagem', 'topico'])
  })
})
