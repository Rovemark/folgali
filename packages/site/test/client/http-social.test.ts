import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { demoId } from '@/lib/domain/ids'
import { NetworkError } from '@/lib/types'

type Seen = { metodo: string; url: string; cabecalhos: IncomingMessage['headers'] }
type Reply = { status?: number; corpo?: unknown; cru?: string }

let server: Server
let base = ''
let seen: Seen[] = []
/** queue of answers; when it runs out, repeats the last */
let queue: Reply[] = []

const uid = (n: string) => demoId('rvr', n)
const ob = (n: string) => demoId('ob', n)
const UID = uid('pipa')
const UID2 = uid('nina')
const T0 = 1_793_000_000 // seconds, November 2026
const ISO = new Date(T0 * 1000).toISOString()
const portrait = { corpo: 'bolinha', cor: 'céu', veste: 'bandana', acessorio: 'chapeu' }
const summary = (n = 'pipa') => ({ uid: uid(n), handle: n, nome: n[0].toUpperCase() + n.slice(1), retrato: portrait })
const profile = { ...summary(), descricao: 'Exploro pastas.', sobre: 'Sobre mim.', habilidades: ['arquivos'], interesses: ['cafe'], recados: 'amigos', listado: true, estado: { estado: 'trabalhando', em: T0 }, seguindo: 2, seguidores: 9, desde: T0 }
const env = (type: string, id: string, body: unknown, author = UID) => ({ objeto: { v: '0.3', tipo: type, id, autor: author, criadoEm: T0, previo: null, corpo: body, assinatura: 'x' } })
const cardWith = { id: ob('c1'), nome: 'Cinema de Sofá', descricao: 'Pastas.', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: ['Dicas'] }
const topicCardItem = { id: ob('t1'), comunidade: ob('c1'), categoria: null, titulo: 'Como nomear?', trecho: 'Eu uso datas.', autor: summary(), criadoEm: T0, atividadeEm: T0, respostas: 1, fixado: false, trancado: false, resolvido: false, tags: ['backup'], enquete: false, editado: false }
const pageCardItem = { id: ob('g1'), nome: 'Mapa de Pastas', descricao: 'Mapa.', tema: 'arquivos', dono: summary(), seguidores: 3, criadaEm: T0, atividadeEm: T0 }

beforeEach(async () => {
  seen = []
  queue = []
  server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      seen.push({ metodo: req.method ?? '', url: req.url ?? '', cabecalhos: req.headers })
      const r = queue.length > 1 ? queue.shift()! : (queue[0] ?? {})
      res.statusCode = r.status ?? 200
      res.setHeader('content-type', 'application/json')
      res.end(r.cru ?? JSON.stringify(r.corpo ?? {}))
    })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((ok) => server.close(() => ok()))
})

const resp = (...r: Reply[]) => {
  queue = r
}
const code = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e instanceof NetworkError ? e.codigo : 'outro'
  }
  return 'nenhum'
}
const withCred = (value = 'Rover-Assinatura uid=x, t=1, a=y') => {
  const calls: [string, string][] = []
  const c = new HttpClient({ base, credencial: async (m, p) => (calls.push([m, p]), value) })
  return { c, calls }
}

describe('read routes: exact path, method and credential', () => {
  const cases: { nome: string; resposta: unknown; call: (c: HttpClient) => Promise<unknown>; url: string; cred: 'publica' | 'opcional' | 'propria' }[] = [
    { nome: 'info', resposta: { protocolo: ['0.1', '0.3'], social: true }, call: (c) => c.info(), url: '/v1/info', cred: 'publica' },
    { nome: 'paginaDoRover', resposta: { rover: profile, selos: {}, contagens: { amigos: null, comunidades: 1, paginas: 0, recados: 0, depoimentos: 0, entregas: 0 }, voce: null }, call: (c) => c.paginaDoRover(UID), url: `/v1/rovers/${UID}/pagina`, cred: 'opcional' },
    { nome: 'recados', resposta: { itens: [], proximo: null }, call: (c) => c.recados(UID, '40'), url: `/v1/rovers/${UID}/recados?antes=40`, cred: 'opcional' },
    { nome: 'depoimentos aceitos', resposta: { itens: [] }, call: (c) => c.depoimentos(UID), url: `/v1/rovers/${UID}/depoimentos`, cred: 'opcional' },
    { nome: 'depoimentos pendentes', resposta: { itens: [] }, call: (c) => c.depoimentos(UID, { estado: 'pendentes', cursor: '7' }), url: `/v1/rovers/${UID}/depoimentos?estado=pendentes&antes=7`, cred: 'propria' },
    { nome: 'amigos', resposta: { itens: [] }, call: (c) => c.amigos(UID), url: `/v1/rovers/${UID}/amigos`, cred: 'opcional' },
    { nome: 'amigos em comum', resposta: { itens: [] }, call: (c) => c.amigosEmComum(UID, UID2), url: `/v1/rovers/${UID}/amigos-em-comum?com=${UID2}`, cred: 'opcional' },
    { nome: 'comunidades do rover', resposta: { itens: [] }, call: (c) => c.comunidadesDoRover(UID), url: `/v1/rovers/${UID}/comunidades`, cred: 'opcional' },
    { nome: 'páginas do rover', resposta: { itens: [] }, call: (c) => c.paginasDoRover(UID), url: `/v1/rovers/${UID}/paginas`, cred: 'opcional' },
    { nome: 'amizades pendentes', resposta: { recebidos: [], enviados: [] }, call: (c) => c.amizadesPendentes(UID), url: `/v1/rovers/${UID}/amizades/pendentes`, cred: 'propria' },
    { nome: 'convites', resposta: { itens: [] }, call: (c) => c.convites(UID), url: `/v1/rovers/${UID}/convites`, cred: 'propria' },
    { nome: 'relacoes', resposta: { itens: [] }, call: (c) => c.relacoes(UID), url: `/v1/rovers/${UID}/relacoes`, cred: 'propria' },
    { nome: 'notificacoes', resposta: { itens: [] }, call: (c) => c.notificacoes(UID, '9'), url: `/v1/rovers/${UID}/notificacoes?antes=9`, cred: 'propria' },
    { nome: 'contagem', resposta: { novas: 3 }, call: (c) => c.contagemDeNotificacoes(UID, 12), url: `/v1/rovers/${UID}/notificacoes/contagem?desde=12`, cred: 'propria' },
    { nome: 'comunidades', resposta: { itens: [] }, call: (c) => c.comunidades({ tema: 'arquivos', acesso: 'aberta', ordem: 'ativas', cursor: '20' }), url: '/v1/comunidades?tema=arquivos&acesso=aberta&ordem=ativas&antes=20', cred: 'publica' },
    { nome: 'comunidade', resposta: { ...cardWith, regras: 'Seja gentil.', dono: summary(), moderadores: 1, voce: null }, call: (c) => c.comunidade(ob('c1')), url: `/v1/comunidades/${ob('c1')}`, cred: 'opcional' },
    { nome: 'membros', resposta: { itens: [] }, call: (c) => c.membros(ob('c1')), url: `/v1/comunidades/${ob('c1')}/membros`, cred: 'opcional' },
    { nome: 'pedidos', resposta: { itens: [] }, call: (c) => c.pedidosDeEntrada(ob('c1')), url: `/v1/comunidades/${ob('c1')}/pedidos`, cred: 'propria' },
    { nome: 'convites da comunidade', resposta: { itens: [] }, call: (c) => c.convitesDaComunidade(ob('c1')), url: `/v1/comunidades/${ob('c1')}/convites`, cred: 'propria' },
    { nome: 'banidos', resposta: { itens: [] }, call: (c) => c.banidos(ob('c1')), url: `/v1/comunidades/${ob('c1')}/banidos`, cred: 'propria' },
    { nome: 'tópicos', resposta: { itens: [topicCardItem], fixados: [], proximo: 5 }, call: (c) => c.topicos(ob('c1'), { categoria: 'Dicas', tag: 'backup', ordem: 'ativos', cursor: '5' }), url: `/v1/comunidades/${ob('c1')}/topicos?categoria=Dicas&tag=backup&ordem=ativos&antes=5`, cred: 'opcional' },
    { nome: 'fila', resposta: { denuncias: [], apelacoes: [] }, call: (c) => c.filaDeModeracao(ob('c1')), url: `/v1/comunidades/${ob('c1')}/moderacao/fila`, cred: 'propria' },
    { nome: 'registro da comunidade', resposta: { itens: [] }, call: (c) => c.registroDaComunidade(ob('c1')), url: `/v1/comunidades/${ob('c1')}/moderacao/registro`, cred: 'opcional' },
    { nome: 'tópico', resposta: { ...topicCardItem, comunidadeNome: 'Oficina', texto: 'Texto.', envelope: env('topico', ob('t1'), {}), resolvidoPor: null, enquete: null, versoes: 1 }, call: (c) => c.topico(ob('t1')), url: `/v1/topicos/${ob('t1')}`, cred: 'opcional' },
    { nome: 'respostas', resposta: { itens: [] }, call: (c) => c.respostas(ob('t1'), { em: ob('f1'), cursor: '3' }), url: `/v1/topicos/${ob('t1')}/respostas?em=${ob('f1')}&antes=3`, cred: 'opcional' },
    { nome: 'histórico', resposta: { itens: [] }, call: (c) => c.historico(ob('t1')), url: `/v1/topicos/${ob('t1')}/historico`, cred: 'opcional' },
    { nome: 'páginas', resposta: { itens: [pageCardItem] }, call: (c) => c.paginas({ tema: 'arquivos', ordem: 'recentes' }), url: '/v1/paginas?tema=arquivos&ordem=recentes', cred: 'publica' },
    { nome: 'página', resposta: { ...pageCardItem, administradores: [], envelope: {}, voce: null }, call: (c) => c.pagina(ob('g1')), url: `/v1/paginas/${ob('g1')}`, cred: 'opcional' },
    { nome: 'seguidores', resposta: { itens: [] }, call: (c) => c.seguidoresDaPagina(ob('g1')), url: `/v1/paginas/${ob('g1')}/seguidores`, cred: 'publica' },
    { nome: 'busca (todos)', resposta: { rovers: [], comunidades: [], topicos: [], paginas: [] }, call: (c) => c.buscarTudo('  Pastas  '), url: '/v1/busca?q=Pastas&tipo=todos', cred: 'opcional' },
    { nome: 'busca (tipo)', resposta: { itens: [] }, call: (c) => c.buscarTipo('pastas', 'topicos', '10'), url: '/v1/busca?q=pastas&tipo=topicos&antes=10', cred: 'opcional' },
    { nome: 'em alta', resposta: { itens: [] }, call: (c) => c.emAlta('comunidades', '7d'), url: '/v1/descobrir/em-alta?tipo=comunidades&janela=7d', cred: 'publica' },
    { nome: 'recém-chegados', resposta: { itens: [] }, call: (c) => c.recemChegadosSociais(10), url: '/v1/descobrir/recem-chegados?limite=10', cred: 'publica' },
    { nome: 'sugestões', resposta: { itens: [] }, call: (c) => c.sugestoes('paginas', ['cafe', 'Mau Tag!', 'musica']), url: '/v1/descobrir/sugestoes?tipo=paginas&interesses=cafe%2Cmusica', cred: 'opcional' },
    { nome: 'tendências', resposta: { itens: [{ tag: 'backup', autores: 4, usos: 9 }] }, call: (c) => c.tendencias('24h'), url: '/v1/descobrir/tendencias?janela=24h', cred: 'publica' },
    { nome: 'registro do relé', resposta: { itens: [] }, call: (c) => c.registroDoRele('2'), url: '/v1/moderacao/registro?antes=2', cred: 'publica' },
  ]
  it.each(cases)('$nome: GET $url', async ({ resposta: reply, call, url, cred }) => {
    resp({ corpo: reply })
    const { c, calls } = withCred()
    await call(c)
    expect(seen).toHaveLength(1)
    expect(seen[0].metodo).toBe('GET')
    expect(seen[0].url).toBe(url)
    if (cred === 'publica') {
      expect(seen[0].cabecalhos.authorization).toBeUndefined()
      expect(calls).toHaveLength(0)
    } else {
      expect(seen[0].cabecalhos.authorization).toBe('Rover-Assinatura uid=x, t=1, a=y')
      expect(calls).toEqual([['GET', url]])
    }
  })

  it.each(cases.filter((x) => x.cred === 'opcional'))('$nome: without a credential the call goes out without the header', async ({ resposta: reply, call, url }) => {
    resp({ corpo: reply })
    await call(new HttpClient({ base }))
    expect(seen[0].url).toBe(url)
    expect(seen[0].cabecalhos.authorization).toBeUndefined()
  })

  it.each(cases.filter((x) => x.cred === 'propria'))('$nome: without a credential it does NOT EVEN call the relay and becomes forbidden', async ({ call }) => {
    expect(await code(call(new HttpClient({ base })))).toBe('proibido')
    expect(await code(call(new HttpClient({ base, credencial: async () => null })))).toBe('proibido')
    expect(await code(call(new HttpClient({ base, credencial: async () => { throw new Error('segredo-na-mensagem') } })))).toBe('proibido')
    expect(seen).toHaveLength(0)
  })

  it('a credential that breaks on an optional route does not bring the read down or leak', async () => {
    resp({ corpo: { itens: [] } })
    const c = new HttpClient({ base, credencial: async () => { throw new Error('segredo-na-mensagem') } })
    await expect(c.amigos(UID)).resolves.toEqual({ itens: [] })
    expect(seen[0].cabecalhos.authorization).toBeUndefined()
  })

  it('the relay\'s base path is not part of what gets signed', async () => {
    resp({ corpo: { itens: [] } })
    const calls: string[] = []
    const c = new HttpClient({ base: `${base}/rede/`, credencial: async (_m, p) => (calls.push(p), 'x') })
    await c.notificacoes(UID)
    expect(seen[0].url).toBe(`/rede/v1/rovers/${UID}/notificacoes`)
    expect(calls).toEqual([`/v1/rovers/${UID}/notificacoes`])
  })

  it('roverPage by @handle resolves the uid first, through the relay\'s handles route (there is no /v1/rovers/@handle)', async () => {
    resp({ corpo: { ...profile } }, { corpo: { rover: profile, selos: { confiavel: 2 }, contagens: {}, voce: null } })
    const p = await new HttpClient({ base }).paginaDoRover('@Pipa')
    expect(seen.map((v) => v.url)).toEqual(['/v1/handles/pipa', `/v1/rovers/${UID}/pagina`])
    expect(p.selos).toEqual({ confiavel: 2, caprichoso: 0, rapido: 0, divertido: 0 })
  })

  it('a search that is too short or too long does not call the relay', async () => {
    const c = new HttpClient({ base })
    expect((await c.buscarTudo('a')).rovers).toEqual([])
    expect((await c.buscarTipo('x'.repeat(101), 'rovers')).itens).toEqual([])
    expect(seen).toHaveLength(0)
  })

  it('parameters the specification does not accept do not even go out', async () => {
    const c = new HttpClient({ base })
    await expect(c.comunidades({ acesso: 'fechada' as never })).rejects.toThrow(NetworkError)
    await expect(c.comunidades({ tema: 'Tema Ruim' })).rejects.toThrow(NetworkError)
    await expect(c.topicos(ob('c1'), { ordem: 'aleatoria' as never })).rejects.toThrow(NetworkError)
    await expect(c.emAlta('topicos', '1h' as never)).rejects.toThrow(NetworkError)
    await expect(c.tendencias('30d' as never)).rejects.toThrow(NetworkError)
    await expect(c.buscarTipo('pastas', 'tudo' as never)).rejects.toThrow(NetworkError)
    for (const cursor of ['abc', '-1', '1e9', '9'.repeat(16), '1 2', '../x']) expect(await code(c.recados(UID, cursor))).toBe('invalido')
    for (const junk of ['x', '../etc', 'rvr_curto']) expect(await code(c.recados(junk))).toBe('nao-encontrado')
    for (const junk of ['x', 'ob_curto', '../x']) expect(await code(c.comunidade(junk))).toBe('nao-encontrado')
    expect(seen).toHaveLength(0)
  })

  it('a mixed line with a reader asks for both types with a credential; without a reader it is the public posts line', async () => {
    const post = { id: ob('p1'), tipo: 'postagem', autor: { uid: UID, handle: 'pipa', nome: 'Pipa', rosto: { corpo: 'bolinha', cor: '#86b6ff' } }, texto: 'Oi.', topicos: [], criadaEm: ISO, respostas: 0, reacoes: { curtir: 0, util: 0 } }
    const update = env('pagina-publicar', ob('u1'), { pagina: ob('g1'), titulo: 'Novidade', texto: 'Saiu a versão 2.', tags: ['mapa'] })
    resp({ corpo: { itens: [post, update], proximo: 8 } }, { corpo: profile })
    const c = new HttpClient({ base, leitor: UID, credencial: async () => 'Rover-Assinatura x' })
    const r = await c.linhaMista('3')
    expect(seen[0].url).toBe(`/v1/linha/inicio?rover=${UID}&tipos=postagem%2Cpagina-publicar&antes=3`)
    expect(seen[0].cabecalhos.authorization).toBe('Rover-Assinatura x')
    expect(r.proximo).toBe('8')
    expect(r.itens.map((i) => i.tipo)).toEqual(['postagem', 'atualizacao'])
    // (the update's author was resolved by the profile route that already exists)
    expect(seen[1].url).toBe(`/v1/rovers/${UID}`)

    // the visitor has no line on the relay (`linha/inicio` asks for the rover): the next page of a public line that does not paginate comes empty,
    // without calling the relay (the composition of the first page is tested in http.test.ts)
    seen = []
    queue = []
    const publicKey = await new HttpClient({ base }).linhaMista('xy')
    expect(publicKey.itens).toEqual([])
    expect(seen).toHaveLength(0)
  })

  it('a reader with the wrong shape is refused at construction', () => {
    expect(() => new HttpClient({ base, leitor: 'qualquer' })).toThrow(NetworkError)
  })
})

describe('what the sanitizer does with what arrives', () => {
  it('a portrait in slugs becomes a sheet; an unknown slug becomes a default piece; a null name becomes the handle', async () => {
    const dirty = { ...profile, nome: null, retrato: { corpo: '../../x', cor: 'roxo-neon', veste: 'arma', acessorio: 'coroa' } }
    resp({ corpo: { rover: dirty, selos: {}, contagens: {}, voce: null } })
    const { rover } = await new HttpClient({ base }).paginaDoRover(UID)
    expect(rover.nome).toBe('pipa')
    expect(rover.rosto).toEqual({ corpo: 'seixo', cor: '#f2e8d6', acessorios: ['coroa'] })
    resp({ corpo: { rover: profile, selos: {}, contagens: {}, voce: null } })
    const ok = await new HttpClient({ base }).paginaDoRover(UID)
    expect(ok.rover.rosto).toEqual({ corpo: 'bolinha', cor: '#86b6ff', acessorios: ['bandana', 'chapeu'] })
    expect(ok.rover).toMatchObject({ sabeFazer: ['arquivos'], interesses: ['cafe'], recados: 'amigos', apresentacao: 'Exploro pastas.', estado: { estado: 'trabalhando', em: ISO } })
    resp({ corpo: { rover: { ...profile, retrato: null }, selos: {}, contagens: {}, voce: null } })
    const without = await new HttpClient({ base }).paginaDoRover(UID)
    expect(without.rover.rosto.corpo).toBeTruthy()
    expect(without.rover.rosto.cor).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('text with an invisible, a U+E0000 tag and HTML in the name comes out clean', async () => {
    const e = env('recado', ob('r1'), { alvo: UID, texto: 'oi​‮ mundo\u{E0041}\u{E0042}' })
    resp({ corpo: { itens: [{ envelope: e, autor: { ...summary('nina'), nome: '<img src=x onerror=alert(1)>Nina​' } }], proximo: null } })
    const r = await new HttpClient({ base }).recados(UID)
    expect(r.itens[0].texto).toBe('oi mundo')
    expect(r.itens[0].autor.nome).toBe('img src=x onerror=alert(1)Nina')
    expect(r.itens[0].autor.nome).not.toMatch(/[<>]/)
    expect(r.itens[0].criadoEm).toBe(ISO)
    expect(r.itens[0].id).toBe(ob('r1'))
    expect(r.proximo).toBeUndefined()
  })

  it('`proximo` becomes a text cursor; anything strange disappears', async () => {
    for (const [p, expected] of [[42, '42'], [0, '0'], [null, undefined], ['7', undefined], [-1, undefined], [1.5, undefined], [1e30, undefined], [{ x: 1 }, undefined]] as const) {
      resp({ corpo: { itens: [], proximo: p } })
      expect((await new HttpClient({ base }).recados(UID)).proximo).toBe(expected)
    }
  })

  it('a giant list is cut at the ceiling', async () => {
    const r = { envelope: env('recado', ob('r1'), { alvo: UID, texto: 'oi' }), autor: summary('nina') }
    resp({ corpo: { itens: Array.from({ length: 500 }, () => r) } })
    expect((await new HttpClient({ base }).recados(UID)).itens).toHaveLength(100)
  })

  it('an extra field is discarded; an instant outside 2023 to 2100 is outside the contract', async () => {
    resp({ corpo: { itens: [{ ...topicCardItem, segredo: 'x', autor: { ...summary(), email: 'a@b.c' } }] } })
    const t = await new HttpClient({ base }).topicos(ob('c1'))
    expect(JSON.stringify(t)).not.toContain('segredo')
    expect(JSON.stringify(t)).not.toContain('a@b.c')
    for (const at of [5, -1, 4_102_444_800 * 10, 'ontem', null, {}]) {
      resp({ corpo: { itens: [{ ...topicCardItem, criadoEm: at }] } })
      expect(await code(new HttpClient({ base }).topicos(ob('c1')))).toBe('indisponivel')
    }
  })

  it('outside the contract becomes indisponivel, without passing the content on', async () => {
    const c = new HttpClient({ base })
    const bad: unknown[] = [[], 'texto', null, { itens: 'não' }, { itens: [{ id: 'ruim' }] }, { itens: [{ ...topicCardItem, id: 'ob_curto' }] }, { itens: [{ ...topicCardItem, autor: { uid: 'rvr_x', handle: 'x' } }] }]
    for (const body of bad) {
      resp({ corpo: body })
      expect(await code(c.topicos(ob('c1')))).toBe('indisponivel')
    }
    resp({ cru: '<html>erro</html>' })
    expect(await code(c.topicos(ob('c1')))).toBe('indisponivel')
    resp({ corpo: { itens: [{ ...topicCardItem, autor: { ...summary(), handle: 'MAIÚSCULA!' } }] } })
    expect(await code(c.topicos(ob('c1')))).toBe('indisponivel')
    resp({ corpo: { itens: [{ ...topicCardItem, comunidade: 'x' }] } })
    expect(await code(c.topicos(ob('c1')))).toBe('indisponivel')
  })

  it('an enum outside the list is outside the contract (access, role, reason, notification type)', async () => {
    const c = new HttpClient({ base })
    resp({ corpo: { itens: [{ ...cardWith, acesso: 'secreta' }] } })
    expect(await code(c.comunidades())).toBe('indisponivel')
    resp({ corpo: { itens: [{ rover: summary(), papel: 'chefe', desde: T0 }] } })
    expect(await code(c.membros(ob('c1')))).toBe('indisponivel')
    resp({ corpo: { itens: [{ seq: 1, tipo: 'virus', em: T0, origem: null, objeto: null, comunidade: null, pagina: null }] } })
    expect(await code(withCred().c.notificacoes(UID))).toBe('indisponivel')
  })

  it('full topic: poll, solved, versions; invalid tags are dropped; text cut', async () => {
    resp({
      corpo: {
        ...topicCardItem, comunidadeNome: 'Oficina', texto: 'x'.repeat(5000), resolvidoPor: { resposta: ob('f1'), por: summary('nina'), em: T0 }, enquete: { opcoes: [{ texto: 'Nuvem', votos: 3 }, { texto: 'Pendrive', votos: -2 }], encerraEm: T0 + 3600, encerrada: false, total: 3, voce: 0 },
        versoes: 2, tags: ['ok', 'INVÁLIDA', 'bb', 'c'], envelope: env('topico', ob('t1'), {}),
      },
    })
    const t = await new HttpClient({ base }).topico(ob('t1'))
    expect(Array.from(t.texto)).toHaveLength(2000)
    expect(t.tags).toEqual(['ok', 'bb'])
    expect(t.enquete).toBe(true)
    expect(t.pesquisa).toMatchObject({ total: 3, voce: 0, encerrada: false, opcoes: [{ texto: 'Nuvem', votos: 3 }, { texto: 'Pendrive', votos: 0 }] })
    expect(t.resolvidoPor?.por.handle).toBe('nina')
    expect(t.versoes).toBe(2)
  })

  it('replies: text comes from the envelope; a removed quote comes without an excerpt', async () => {
    const r1 = { id: ob('f1'), envelope: env('resposta-forum', ob('f1'), { texto: 'Concordo.' }), autor: summary('nina'), criadoEm: T0, em: null, cita: { id: ob('f0'), autor: summary(), trecho: null }, filhas: 2, resolveu: true, reacoes: { curtir: 2, util: 1 } }
    resp({ corpo: { itens: [r1] } })
    const [r] = (await new HttpClient({ base }).respostas(ob('t1'))).itens
    expect(r).toMatchObject({ id: ob('f1'), texto: 'Concordo.', filhas: 2, resolveu: true, em: null })
    expect(r.cita?.trecho).toBeNull()
  })

  it('history brings the text of each version from the envelopes', async () => {
    resp({ corpo: { itens: [{ versao: 1, envelope: env('topico', ob('t1'), { titulo: 'Antes', texto: 'a', tags: [] }), criadoEm: T0 }, { versao: 2, envelope: env('topico-editar', ob('e1'), { titulo: 'Depois', texto: 'b', tags: ['x1'] }), criadoEm: T0 + 60 }] } })
    const h = await new HttpClient({ base }).historico(ob('t1'))
    expect(h.map((v) => v.titulo)).toEqual(['Antes', 'Depois'])
    expect(h[1].tags).toEqual(['x1'])
  })

  it('topicFromObject reads GET /v1/objetos/:id and returns the reply\'s topic', async () => {
    resp({ corpo: env('resposta-forum', ob('f1'), { topico: ob('t1'), em: null, cita: null, texto: 'oi' }) })
    expect(await new HttpClient({ base }).topicoDeObjeto(ob('f1'))).toBe(ob('t1'))
    resp({ corpo: env('recado', ob('r1'), { alvo: UID, texto: 'oi' }) })
    await expect(new HttpClient({ base }).topicoDeObjeto(ob('r1'))).rejects.toMatchObject({ codigo: 'nao-encontrado' })
  })

  it('a closed community seen by a guest comes only as a minimal card', async () => {
    resp({ corpo: { id: ob('c9'), nome: 'Jardim de Varanda', descricao: 'Só por convite.', acesso: 'fechada', voce: { papel: null, pedidoPendente: false, convidado: true, banido: false } } })
    const c = await new HttpClient({ base }).comunidade(ob('c9'))
    expect(c).not.toHaveProperty('membros')
    expect(c.voce).toMatchObject({ convidado: true, papel: null })
  })

  it('moderation queue: never brings who reported; retained content only from the envelope', async () => {
    resp({
      corpo: {
        denuncias: [{ alvo: ob('f2'), alvoTipo: 'resposta-forum', motivos: { spam: 2, assedio: 0, inventado: 9 }, total: 2, primeiraEm: T0, ultimaEm: T0, peso: 1, denunciante: 'rvr_x', quem: 'alguem' }],
        apelacoes: [{ id: ob('a1'), tipo: 'remocao', alvo: ob('f3'), autor: summary('nina'), texto: 'Foi sem querer.', em: T0, envelope: env('resposta-forum', ob('f3'), { texto: 'Texto retido.' }) }],
      },
    })
    const f = await new HttpClient({ base }).filaDeModeracao(ob('c1')).catch(() => null)
    expect(f).toBeNull() // without a credential
    const r = await withCred().c.filaDeModeracao(ob('c1'))
    expect(r.denuncias[0].motivos).toEqual({ spam: 2 })
    expect(JSON.stringify(r)).not.toContain('denunciante')
    expect(JSON.stringify(r)).not.toContain('alguem')
    expect(r.apelacoes[0].conteudo).toBe('Texto retido.')
  })

  it('log: the target can be an id or a rover; only the role, never the person', async () => {
    const base1 = { id: 'reg_1', em: T0, escopo: 'comunidade', contexto: ob('c1'), motivo: 'spam', por: 'moderador', apelacao: null }
    resp({ corpo: { itens: [{ ...base1, acao: 'remocao', alvoTipo: 'topico', alvo: ob('t1') }, { ...base1, id: 'reg_2', acao: 'banimento', alvoTipo: null, alvo: summary('nina'), moderador: 'rvr_quem' }], proximo: null } })
    const r = await new HttpClient({ base }).registroDaComunidade(ob('c1'))
    expect(typeof r.itens[0].alvo).toBe('string')
    expect((r.itens[1].alvo as { handle: string }).handle).toBe('nina')
    expect(JSON.stringify(r)).not.toContain('rvr_quem')
  })

  it('a notification never carries text', async () => {
    resp({ corpo: { itens: [{ seq: 7, tipo: 'mencao', em: T0, origem: summary('nina'), objeto: ob('t1'), comunidade: ob('c1'), pagina: null, texto: 'segredo do tópico' }] } })
    const r = await withCred().c.notificacoes(UID)
    expect(r.itens[0]).toMatchObject({ seq: 7, tipo: 'mencao', objeto: ob('t1') })
    expect(JSON.stringify(r)).not.toContain('segredo do tópico')
  })

  it('deliveries and updates complete the author through the profile route that already exists', async () => {
    resp({ corpo: { itens: [env('entrega', ob('e1'), { titulo: 'Pastas em ordem', descricao: 'Organizei.', resultado: 'Achou tudo.', tags: ['pastas'] })], proximo: null } }, { corpo: profile })
    const e = await new HttpClient({ base }).entregas(UID)
    expect(e.itens[0]).toMatchObject({ titulo: 'Pastas em ordem', autor: { handle: 'pipa' }, tags: ['pastas'] })
    expect(seen.map((v) => v.url)).toEqual([`/v1/rovers/${UID}/entregas`, `/v1/rovers/${UID}`])
  })

  it('search: the rover comes with a description; a simple list or {itens} works for "trending"', async () => {
    resp({ corpo: { rovers: [{ ...summary(), descricao: 'Exploro.' }], comunidades: [cardWith], topicos: [{ ...topicCardItem, comunidadeNome: 'Oficina' }], paginas: [pageCardItem] } })
    const b = await new HttpClient({ base }).buscarTudo('pastas')
    expect(b.rovers[0].descricao).toBe('Exploro.')
    expect(b.topicos[0].comunidadeNome).toBe('Oficina')
    resp({ corpo: [cardWith] })
    expect(await new HttpClient({ base }).emAlta('comunidades')).toHaveLength(1)
  })
})

describe('relay errors (the protocol code outweighs the status)', () => {
  it.each([
    [400, 'esquema', 'invalido'],
    [404, 'nao_encontrado', 'nao-encontrado'],
    [403, 'sem_permissao', 'sem-permissao'],
    [403, 'interacao_nao_permitida', 'interacao-nao-permitida'],
    [403, 'conta_nova', 'conta-nova'],
    [403, 'banido', 'banido'],
    [403, 'nao_e_membro', 'nao-e-membro'],
    [409, 'ja_existe', 'ja-existe'],
    [409, 'limite_de_estrutura', 'limite-de-estrutura'],
    [403, 'trancado', 'trancado'],
    [409, 'enquete_encerrada', 'enquete-encerrada'],
    [409, 'fora_da_janela', 'fora-da-janela'],
    [429, 'limite_de_taxa', 'limite'],
    [403, 'grafo_privado', 'grafo-privado'],
    [410, 'removido', 'removido'],
    [409, 'resposta_funda', 'resposta-funda'],
    [401, 'leitura_nao_autorizada', 'proibido'],
    [400, 'versao_nao_suportada', 'versao-nao-suportada'],
  ])('%i %s becomes %s', async (status, code, expected) => {
    resp({ status, corpo: { erro: { codigo: code, mensagem: 'MENSAGEM-DE-ESTRANHO' } } })
    let msg = ''
    try {
      await new HttpClient({ base }).topicos(ob('c1'))
    } catch (e) {
      expect(e).toBeInstanceOf(NetworkError)
      expect((e as NetworkError).codigo).toBe(expected)
      msg = (e as NetworkError).message
    }
    expect(msg).not.toContain('MENSAGEM-DE-ESTRANHO')
  })
  it.each([
    [404, 'nao-encontrado'],
    [410, 'removido'],
    [400, 'invalido'],
    [401, 'proibido'],
    [403, 'proibido'],
    [429, 'limite'],
    [500, 'indisponivel'],
  ])('without a readable code, status %i becomes %s', async (status, expected) => {
    for (const body of [{ erro: 'x' }, { erro: { codigo: 'desconhecido' } }, { erro: { codigo: 'toString' } }, [], 'texto']) {
      resp({ status, corpo: body })
      expect(await code(new HttpClient({ base }).topicos(ob('c1')))).toBe(expected)
    }
    resp({ status, cru: '<html>' })
    expect(await code(new HttpClient({ base }).topicos(ob('c1')))).toBe(expected)
  })
  it('the credential never appears in the error message', async () => {
    resp({ status: 401, corpo: { erro: { codigo: 'leitura_nao_autorizada' } } })
    try {
      await withCred('Rover-Assinatura SEGREDO').c.amigos(UID)
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('SEGREDO')
    }
  })
})
