import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { demoId } from '@/lib/domain/ids'
import { NetworkError } from '@/lib/types'

// The fields of revision 0.3.1 seen by the site's HTTP client. General rule: the new field is screen DECORATION. When absent (relay 0.3) the object is identical to 0.3's;
// when malformed (a faulty relay 0.3.1) it is ignored instead of bringing the page down; and what changes what the person can do is never invented by the client.

type Seen = { metodo: string; url: string; cabecalhos: IncomingMessage['headers'] }
let server: Server
let base = ''
let seen: Seen[] = []
let respond: (url: string) => { status?: number; corpo?: unknown } = () => ({})

const uid = (n: string) => demoId('rvr', n)
const ob = (n: string) => demoId('ob', n)
const UID = uid('pipa')
const T0 = 1_793_000_000
const ISO = (s: number) => new Date(s * 1000).toISOString()
const portrait = { corpo: 'bolinha', cor: 'ceu', veste: 'bandana', acessorio: 'chapeu' }
const summary = (n = 'pipa') => ({ uid: uid(n), handle: n, nome: n[0].toUpperCase() + n.slice(1), retrato: portrait })
const profile = { ...summary(), descricao: 'Exploro pastas.', sobre: '', habilidades: [], interesses: [], recados: 'amigos', listado: true, estado: null, seguindo: 1, seguidores: 2 }
const withFeatures = (...r: string[]) => ({ corpo: { protocolo: ['0.3'], social: true, recursos: r } })
const withoutFeatures = { corpo: { protocolo: ['0.3'], social: true } }
const CRED = async () => 'Bearer x'

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

describe('rover page: dates and counts', () => {
  const page = (extraYou: Record<string, unknown> = {}, counts: Record<string, unknown> = {}) => ({
    corpo: {
      rover: profile,
      selos: { confiavel: 1, caprichoso: 0, rapido: 0, divertido: 0 },
      contagens: { amigos: 3, comunidades: 1, paginas: 0, recados: 2, depoimentos: 1, entregas: 0, ...counts },
      voce: { amigo: true, pedidoEnviado: false, pedidoRecebido: false, euBloqueei: false, euSilenciei: false, papel: null, ...extraYou },
    },
  })
  it('reads friendSince, accountSince and badgesIGave (seconds become ISO; an unknown and a repeated badge disappear)', async () => {
    respond = () => page({ amigoDesde: T0, contaDesde: T0 - 86_400, selosQueDei: ['rapido', 'confiavel', 'rapido', 'invencivel', 7] }, { seguidores: 219, seguindo: 5 })
    const pg = await new HttpClient({ base }).paginaDoRover(UID)
    expect(pg.voce).toMatchObject({ amigoDesde: ISO(T0), contaDesde: ISO(T0 - 86_400), selosQueDei: ['confiavel', 'rapido'] })
    expect(pg.contagens).toMatchObject({ seguidores: 219, seguindo: 5 })
  })
  it('`friendSince: null` means "not friends" and `seguidores: null` means "hidden graph": nothing becomes zero', async () => {
    respond = () => page({ amigo: false, amigoDesde: null, contaDesde: T0 }, { seguidores: null, seguindo: null })
    const pg = await new HttpClient({ base }).paginaDoRover(UID)
    expect(pg.voce?.amigoDesde).toBeNull()
    expect(pg.contagens.seguidores).toBeNull()
    expect(pg.contagens.seguindo).toBeNull()
  })
  it('relay 0.3: with no new field the object is 0.3\'s, with no extra key', async () => {
    respond = () => page()
    const pg = await new HttpClient({ base }).paginaDoRover(UID)
    expect(Object.keys(pg.voce ?? {}).sort()).toEqual(['amigo', 'euBloqueei', 'euSilenciei', 'papel', 'pedidoEnviado', 'pedidoRecebido'])
    expect(Object.keys(pg.contagens).sort()).toEqual(['amigos', 'comunidades', 'depoimentos', 'entregas', 'paginas', 'recados'])
    expect('perfilId' in pg).toBe(false)
  })
  it('a malformed new field is IGNORED and does not bring the page down (a date outside 2023-2100, badges that are not a list, a negative or text count)', async () => {
    respond = () => page({ amigoDesde: 'quando der', contaDesde: 5, selosQueDei: 'todos' }, { seguidores: -3, seguindo: 'muitos' })
    const pg = await new HttpClient({ base }).paginaDoRover(UID)
    expect(pg.voce).toMatchObject({ amigo: true })
    expect(pg.voce?.amigoDesde).toBeUndefined()
    expect(pg.voce?.contaDesde).toBeUndefined()
    expect(pg.voce?.selosQueDei).toBeUndefined()
    expect(pg.contagens.seguidores).toBeUndefined()
    expect(pg.contagens.seguindo).toBeUndefined()
  })
  it('profileId: only an object id with the protocol\'s shape; the rest disappears', async () => {
    respond = () => ({ corpo: { ...(page().corpo as object), perfilId: ob('perfil1') } })
    expect((await new HttpClient({ base }).paginaDoRover(UID)).perfilId).toBe(ob('perfil1'))
    respond = () => ({ corpo: { ...(page().corpo as object), perfilId: null } })
    expect((await new HttpClient({ base }).paginaDoRover(UID)).perfilId).toBeNull()
    respond = () => ({ corpo: { ...(page().corpo as object), perfilId: '<script>' } })
    expect('perfilId' in (await new HttpClient({ base }).paginaDoRover(UID))).toBe(false)
  })
})

describe('comunidade: banidoEm e membroDesde', () => {
  const using = (you: Record<string, unknown>) => ({
    corpo: {
      id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: [],
      regras: 'r', dono: summary(), moderadores: 1,
      voce: { papel: 'membro', pedidoPendente: false, convidado: false, banido: false, ...you },
    },
  })
  it('reads the two dates (or null) and, without them, `voce` is the 0.3 one', async () => {
    respond = () => using({ membroDesde: T0, banidoEm: null })
    const v = (await new HttpClient({ base }).comunidade(ob('c1'))).voce
    expect(v).toMatchObject({ membroDesde: ISO(T0), banidoEm: null })
    respond = () => using({ banido: true, papel: null, banidoEm: T0, membroDesde: null })
    expect((await new HttpClient({ base }).comunidade(ob('c1'))).voce).toMatchObject({ banido: true, banidoEm: ISO(T0), membroDesde: null })
    respond = () => using({})
    expect(Object.keys((await new HttpClient({ base }).comunidade(ob('c1'))).voce ?? {}).sort()).toEqual(['banido', 'convidado', 'papel', 'pedidoPendente'])
  })
  it('a malformed date is ignored', async () => {
    respond = () => using({ membroDesde: 'ontem', banidoEm: {} })
    const v = (await new HttpClient({ base }).comunidade(ob('c1'))).voce
    expect(v?.membroDesde).toBeUndefined()
    expect(v?.banidoEm).toBeUndefined()
  })
})

describe('topic: reactions', () => {
  const topic = (extra: Record<string, unknown> = {}) => ({
    corpo: {
      id: ob('t1'), comunidade: ob('c1'), comunidadeNome: 'Oficina', categoria: null, titulo: 'Como nomear?', texto: 'Eu uso datas.', autor: summary(), criadoEm: T0, atividadeEm: T0,
      respostas: 1, fixado: false, trancado: false, resolvido: false, tags: [], enquete: null, resolvidoPor: null, versoes: 1, ...extra,
    },
  })
  it('reads reacoes and myReaction; relay 0.3 does not send them and the topic stays without both keys', async () => {
    respond = () => topic({ reacoes: { curtir: 4, util: 2 }, minhaReacao: 'util' })
    expect(await new HttpClient({ base }).topico(ob('t1'))).toMatchObject({ reacoes: { curtir: 4, util: 2 }, minhaReacao: 'util' })
    respond = () => topic({ reacoes: { curtir: 1, util: 0 } })
    expect((await new HttpClient({ base }).topico(ob('t1'))).minhaReacao).toBeNull()
    respond = () => topic()
    const t = await new HttpClient({ base }).topico(ob('t1'))
    expect('reacoes' in t).toBe(false)
    expect('minhaReacao' in t).toBe(false)
  })
  it('a malformed count (text, only one of the two, a list) is ignored: the topic opens without the bar', async () => {
    for (const reactions of [{ curtir: 'muitas', util: 1 }, { curtir: 3 }, [1, 2], 'x', null]) {
      respond = () => topic({ reacoes: reactions })
      expect('reacoes' in (await new HttpClient({ base }).topico(ob('t1')))).toBe(false)
    }
  })
  it('`myReaction` of a type the protocol does not have becomes null, never passes on', async () => {
    respond = () => topic({ reacoes: { curtir: 1, util: 1 }, minhaReacao: 'amei' })
    expect((await new HttpClient({ base }).topico(ob('t1'))).minhaReacao).toBeNull()
  })
})

describe('log and moderation queue', () => {
  const reg = (extra: Record<string, unknown>) => ({
    corpo: { itens: [{ id: 'reg1', em: T0, escopo: 'comunidade', contexto: ob('c1'), acao: 'remocao', alvoTipo: 'topico', alvo: ob('t1'), motivo: 'spam', por: 'dono', apelacao: null, ...extra }] },
  })
  it('the dismissal arrives with `motivo: dispensada` and the log accepts it (before, it would bring down the whole page)', async () => {
    respond = () => reg({ acao: 'dispensa', motivo: 'dispensada', alvoTipo: 'resposta-forum', por: 'moderador' })
    const r = (await new HttpClient({ base }).registroDaComunidade(ob('c1'))).itens[0]
    expect(r).toMatchObject({ acao: 'dispensa', motivo: 'dispensada', por: 'moderador', alvo: ob('t1') })
  })
  it('`dispensada` is only valid on a dismissal: on a removal it is outside the contract', async () => {
    respond = () => reg({ acao: 'remocao', motivo: 'dispensada' })
    expect(await code(() => new HttpClient({ base }).registroDaComunidade(ob('c1')))).toBe('indisponivel')
  })
  it('on a dismissal an ordinary moderation reason is also outside the contract (the relay always writes `dispensada`)', async () => {
    respond = () => reg({ acao: 'dispensa', motivo: 'spam' })
    expect(await code(() => new HttpClient({ base }).registroDaComunidade(ob('c1')))).toBe('indisponivel')
  })
  it('the queue brings the topic id of each report; without the field (relay 0.3) the key does not exist', async () => {
    const rep = (extra: Record<string, unknown>) => ({ alvo: ob('r1'), alvoTipo: 'resposta-forum', motivos: { spam: 1 }, total: 1, primeiraEm: T0, ultimaEm: T0, peso: 1, ...extra })
    respond = () => ({ corpo: { denuncias: [rep({ topico: ob('t1') }), rep({ alvo: ob('r2'), topico: null }), rep({ alvo: ob('r3'), topico: 'lixo' }), rep({ alvo: ob('r4') })], apelacoes: [] } })
    const f = await new HttpClient({ base, credencial: CRED }).filaDeModeracao(ob('c1'))
    expect(f.denuncias[0].topico).toBe(ob('t1'))
    expect(f.denuncias[1].topico).toBeNull()
    expect('topico' in f.denuncias[2]).toBe(false)
    expect('topico' in f.denuncias[3]).toBe(false)
  })
})

describe('removidos e depoimentos enviados', () => {
  const removed = (extra: Record<string, unknown> = {}) => ({
    id: 'rem1', em: T0, escopo: 'comunidade', contexto: ob('c1'), alvoTipo: 'topico', alvo: ob('t1'), motivo: 'spam', por: 'moderador', apelacao: null,
    envelope: { objeto: { id: ob('t1'), tipo: 'topico', autor: UID, criadoEm: T0, corpo: { titulo: 'Troco canecas', texto: 'Quem quer trocar?' } } }, ...extra,
  })
  it('without the `removidos` resource (relay 0.3) returns an empty list WITHOUT calling the route that does not exist', async () => {
    respond = (url) => (url === '/v1/info' ? withoutFeatures : { status: 404, corpo: {} })
    expect(await new HttpClient({ base, credencial: CRED }).removidos(UID)).toEqual({ itens: [] })
    expect(seen.map((v) => v.url)).toEqual(['/v1/info'])
  })
  it('with the resource reads the item, with the excerpt of what was removed; without the envelope (no longer retained) the excerpt is null', async () => {
    respond = (url) => (url === '/v1/info' ? withFeatures('removidos') : { corpo: { itens: [removed(), removed({ id: 'rem2', envelope: null })], proximo: null } })
    const p = await new HttpClient({ base, credencial: CRED }).removidos(UID)
    expect(p.itens[0]).toMatchObject({ id: 'rem1', escopo: 'comunidade', alvoTipo: 'topico', motivo: 'spam', por: 'moderador', apelacao: null, em: ISO(T0) })
    expect(p.itens[0].trecho).toContain('Troco canecas')
    expect(p.itens[1].trecho).toBeNull()
    const url = seen.find((v) => v.url.includes('/removidos'))
    expect(url?.url).toBe(`/v1/rovers/${UID}/removidos`)
    expect(url?.cabecalhos.authorization).toBe('Bearer x')
  })
  it('it is an OWN read: without a credential it does not even call the relay and becomes forbidden', async () => {
    respond = (url) => (url === '/v1/info' ? withFeatures('removidos', 'depoimentos-enviados') : { corpo: { itens: [] } })
    const c = new HttpClient({ base, credencial: async () => null })
    expect(await code(() => c.removidos(UID))).toBe('proibido')
    expect(await code(() => c.depoimentosEnviados(UID))).toBe('proibido')
    expect(seen.some((v) => v.url.includes('/removidos') || v.url.includes('enviados'))).toBe(false)
  })
  it('a malformed envelope in the middle of the removed does not bring the list down: the excerpt disappears and the rest stays', async () => {
    respond = (url) => (url === '/v1/info' ? withFeatures('removidos') : { corpo: { itens: [removed({ envelope: { objeto: 'lixo' } })] } })
    const p = await new HttpClient({ base, credencial: CRED }).removidos(UID)
    expect(p.itens[0].trecho).toBeNull()
  })
  it('a reason or role outside the protocol is outside the contract: the list does not appear (the screen does not show what it does not understand)', async () => {
    respond = (url) => (url === '/v1/info' ? withFeatures('removidos') : { corpo: { itens: [removed({ por: 'o chefe' })] } })
    expect(await code(() => new HttpClient({ base, credencial: CRED }).removidos(UID))).toBe('indisponivel')
  })
  it('testimonials sent: asks for `estado=enviados`, reads the target and the text; without the resource returns empty without calling', async () => {
    const env = { objeto: { id: ob('d1'), tipo: 'depoimento', autor: UID, criadoEm: T0, corpo: { alvo: uid('nina'), texto: 'A Nina reagenda.' } } }
    respond = (url) => (url === '/v1/info' ? withFeatures('depoimentos-enviados') : { corpo: { itens: [{ envelope: env, alvo: summary('nina'), estado: 'pendente' }] } })
    const p = await new HttpClient({ base, credencial: CRED }).depoimentosEnviados(UID)
    expect(p.itens[0]).toMatchObject({ id: ob('d1'), estado: 'pendente', texto: 'A Nina reagenda.', alvo: { handle: 'nina' } })
    expect(seen.some((v) => v.url === `/v1/rovers/${UID}/depoimentos?estado=enviados`)).toBe(true)
    seen = []
    respond = (url) => (url === '/v1/info' ? withoutFeatures : { status: 404, corpo: {} })
    expect(await new HttpClient({ base, credencial: CRED }).depoimentosEnviados(UID)).toEqual({ itens: [] })
    expect(seen.map((v) => v.url)).toEqual(['/v1/info'])
  })
})

describe('page topics and `pessoas` in trending', () => {
  it('topics: reads { tema, paginas }; without the resource returns empty without calling; a topic outside the shape brings the list down (the screen goes back to the workaround)', async () => {
    respond = (url) => (url === '/v1/info' ? withFeatures('temas-de-paginas') : { corpo: { itens: [{ tema: 'arquivos', paginas: 3 }, { tema: 'cafe', paginas: 1 }] } })
    expect(await new HttpClient({ base }).temasDePaginas()).toEqual([{ tema: 'arquivos', paginas: 3 }, { tema: 'cafe', paginas: 1 }])
    respond = (url) => (url === '/v1/info' ? withFeatures('temas-de-paginas') : { corpo: { itens: [{ tema: 'Tema Com Espaço', paginas: 3 }] } })
    expect(await code(() => new HttpClient({ base }).temasDePaginas())).toBe('indisponivel')
    seen = []
    respond = (url) => (url === '/v1/info' ? withoutFeatures : { status: 404, corpo: {} })
    expect(await new HttpClient({ base }).temasDePaginas()).toEqual([])
    expect(seen.map((v) => v.url)).toEqual(['/v1/info'])
  })
  it('`pessoas`: an integer from 0 to 1 million becomes the field; text, negative, fraction and list disappear and the card stays like 0.3\'s', async () => {
    const topic = { id: ob('t1'), comunidade: ob('c1'), categoria: null, titulo: 'T', trecho: 'x', autor: summary(), criadoEm: T0, atividadeEm: T0, respostas: 1, fixado: false, trancado: false, resolvido: false, tags: [], enquete: false }
    respond = () => ({ corpo: { itens: [{ ...topic, pessoas: 7 }, { ...topic, id: ob('t2'), pessoas: '7' }, { ...topic, id: ob('t3'), pessoas: -1 }, { ...topic, id: ob('t4'), pessoas: 1.5 }, { ...topic, id: ob('t5'), pessoas: [uid('nina')] }, { ...topic, id: ob('t6'), pessoas: 2_000_000 }, { ...topic, id: ob('t7') }] } })
    const r = await new HttpClient({ base }).emAlta('topicos')
    expect(r.map((x) => x.pessoas)).toEqual([7, undefined, undefined, undefined, undefined, undefined, undefined])
    expect(r.slice(1).every((x) => !('pessoas' in x))).toBe(true)
  })
  it('`pessoas` also on community and page cards', async () => {
    const using = { id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: [], pessoas: 5 }
    respond = () => ({ corpo: { itens: [using] } })
    expect((await new HttpClient({ base }).emAlta('comunidades'))[0].pessoas).toBe(5)
    const page = { id: ob('g1'), nome: 'Mapa', descricao: 'x', tema: 'arquivos', dono: summary(), seguidores: 3, criadaEm: T0, atividadeEm: T0, pessoas: 2 }
    respond = () => ({ corpo: { itens: [page] } })
    expect((await new HttpClient({ base }).emAlta('paginas'))[0].pessoas).toBe(2)
  })
})

describe('suporta', () => {
  it('reads the info once and keeps it: asking again does not repeat the call', async () => {
    respond = () => withFeatures('removidos', 'temas-de-paginas')
    const c = new HttpClient({ base })
    expect(await c.suporta('removidos')).toBe(true)
    expect(await c.suporta('temas-de-paginas')).toBe(true)
    expect(await c.suporta('lista-completa')).toBe(false)
    expect(seen.filter((v) => v.url === '/v1/info')).toHaveLength(1)
  })
  it('info being down counts as "no resource" (and not an error)', async () => {
    respond = () => ({ status: 500, corpo: {} })
    expect(await new HttpClient({ base }).suporta('removidos')).toBe(false)
  })
})
