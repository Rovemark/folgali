import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClienteHttp } from '@/lib/cliente-http'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { ErroRede } from '@/lib/tipos'

// Os campos da revisão 0.3.1 vistos pelo cliente HTTP do site. Regra geral: o campo novo é ENFEITE de tela. Ausente (relé 0.3) o objeto é idêntico ao da 0.3;
// torto (relé 0.3.1 com defeito) é ignorado em vez de derrubar a página; e o que muda o que a pessoa pode fazer nunca é inventado pelo cliente.

type Visto = { metodo: string; url: string; cabecalhos: IncomingMessage['headers'] }
let servidor: Server
let base = ''
let vistos: Visto[] = []
let responder: (url: string) => { status?: number; corpo?: unknown } = () => ({})

const uid = (n: string) => idDeDemonstracao('rvr', n)
const ob = (n: string) => idDeDemonstracao('ob', n)
const UID = uid('pipa')
const T0 = 1_793_000_000
const ISO = (s: number) => new Date(s * 1000).toISOString()
const retrato = { corpo: 'bolinha', cor: 'ceu', veste: 'bandana', acessorio: 'chapeu' }
const resumo = (n = 'pipa') => ({ uid: uid(n), handle: n, nome: n[0].toUpperCase() + n.slice(1), retrato })
const perfil = { ...resumo(), descricao: 'Exploro pastas.', sobre: '', habilidades: [], interesses: [], recados: 'amigos', listado: true, estado: null, seguindo: 1, seguidores: 2 }
const comRecursos = (...r: string[]) => ({ corpo: { protocolo: ['0.3'], social: true, recursos: r } })
const semRecursos = { corpo: { protocolo: ['0.3'], social: true } }
const CRED = async () => 'Bearer x'

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

describe('página do rover: datas e contagens', () => {
  const pagina = (extraVoce: Record<string, unknown> = {}, contagens: Record<string, unknown> = {}) => ({
    corpo: {
      rover: perfil,
      selos: { confiavel: 1, caprichoso: 0, rapido: 0, divertido: 0 },
      contagens: { amigos: 3, comunidades: 1, paginas: 0, recados: 2, depoimentos: 1, entregas: 0, ...contagens },
      voce: { amigo: true, pedidoEnviado: false, pedidoRecebido: false, euBloqueei: false, euSilenciei: false, papel: null, ...extraVoce },
    },
  })
  it('lê amigoDesde, contaDesde e selosQueDei (segundos viram ISO; selo desconhecido e repetido somem)', async () => {
    responder = () => pagina({ amigoDesde: T0, contaDesde: T0 - 86_400, selosQueDei: ['rapido', 'confiavel', 'rapido', 'invencivel', 7] }, { seguidores: 219, seguindo: 5 })
    const pg = await new ClienteHttp({ base }).paginaDoRover(UID)
    expect(pg.voce).toMatchObject({ amigoDesde: ISO(T0), contaDesde: ISO(T0 - 86_400), selosQueDei: ['confiavel', 'rapido'] })
    expect(pg.contagens).toMatchObject({ seguidores: 219, seguindo: 5 })
  })
  it('`amigoDesde: null` quer dizer "não são amigos" e `seguidores: null` quer dizer "grafo escondido": nada vira zero', async () => {
    responder = () => pagina({ amigo: false, amigoDesde: null, contaDesde: T0 }, { seguidores: null, seguindo: null })
    const pg = await new ClienteHttp({ base }).paginaDoRover(UID)
    expect(pg.voce?.amigoDesde).toBeNull()
    expect(pg.contagens.seguidores).toBeNull()
    expect(pg.contagens.seguindo).toBeNull()
  })
  it('relé 0.3: sem nenhum campo novo o objeto é o da 0.3, sem chave nenhuma a mais', async () => {
    responder = () => pagina()
    const pg = await new ClienteHttp({ base }).paginaDoRover(UID)
    expect(Object.keys(pg.voce ?? {}).sort()).toEqual(['amigo', 'euBloqueei', 'euSilenciei', 'papel', 'pedidoEnviado', 'pedidoRecebido'])
    expect(Object.keys(pg.contagens).sort()).toEqual(['amigos', 'comunidades', 'depoimentos', 'entregas', 'paginas', 'recados'])
    expect('perfilId' in pg).toBe(false)
  })
  it('campo novo torto é IGNORADO e não derruba a página (data fora de 2023-2100, selos que não são lista, contagem negativa ou de texto)', async () => {
    responder = () => pagina({ amigoDesde: 'quando der', contaDesde: 5, selosQueDei: 'todos' }, { seguidores: -3, seguindo: 'muitos' })
    const pg = await new ClienteHttp({ base }).paginaDoRover(UID)
    expect(pg.voce).toMatchObject({ amigo: true })
    expect(pg.voce?.amigoDesde).toBeUndefined()
    expect(pg.voce?.contaDesde).toBeUndefined()
    expect(pg.voce?.selosQueDei).toBeUndefined()
    expect(pg.contagens.seguidores).toBeUndefined()
    expect(pg.contagens.seguindo).toBeUndefined()
  })
  it('perfilId: só id de objeto com a forma do protocolo; o resto some', async () => {
    responder = () => ({ corpo: { ...(pagina().corpo as object), perfilId: ob('perfil1') } })
    expect((await new ClienteHttp({ base }).paginaDoRover(UID)).perfilId).toBe(ob('perfil1'))
    responder = () => ({ corpo: { ...(pagina().corpo as object), perfilId: null } })
    expect((await new ClienteHttp({ base }).paginaDoRover(UID)).perfilId).toBeNull()
    responder = () => ({ corpo: { ...(pagina().corpo as object), perfilId: '<script>' } })
    expect('perfilId' in (await new ClienteHttp({ base }).paginaDoRover(UID))).toBe(false)
  })
})

describe('comunidade: banidoEm e membroDesde', () => {
  const com = (voce: Record<string, unknown>) => ({
    corpo: {
      id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: [],
      regras: 'r', dono: resumo(), moderadores: 1,
      voce: { papel: 'membro', pedidoPendente: false, convidado: false, banido: false, ...voce },
    },
  })
  it('lê as duas datas (ou nulo) e, sem elas, o `voce` é o da 0.3', async () => {
    responder = () => com({ membroDesde: T0, banidoEm: null })
    const v = (await new ClienteHttp({ base }).comunidade(ob('c1'))).voce
    expect(v).toMatchObject({ membroDesde: ISO(T0), banidoEm: null })
    responder = () => com({ banido: true, papel: null, banidoEm: T0, membroDesde: null })
    expect((await new ClienteHttp({ base }).comunidade(ob('c1'))).voce).toMatchObject({ banido: true, banidoEm: ISO(T0), membroDesde: null })
    responder = () => com({})
    expect(Object.keys((await new ClienteHttp({ base }).comunidade(ob('c1'))).voce ?? {}).sort()).toEqual(['banido', 'convidado', 'papel', 'pedidoPendente'])
  })
  it('data torta é ignorada', async () => {
    responder = () => com({ membroDesde: 'ontem', banidoEm: {} })
    const v = (await new ClienteHttp({ base }).comunidade(ob('c1'))).voce
    expect(v?.membroDesde).toBeUndefined()
    expect(v?.banidoEm).toBeUndefined()
  })
})

describe('tópico: reações', () => {
  const topico = (extra: Record<string, unknown> = {}) => ({
    corpo: {
      id: ob('t1'), comunidade: ob('c1'), comunidadeNome: 'Oficina', categoria: null, titulo: 'Como nomear?', texto: 'Eu uso datas.', autor: resumo(), criadoEm: T0, atividadeEm: T0,
      respostas: 1, fixado: false, trancado: false, resolvido: false, tags: [], enquete: null, resolvidoPor: null, versoes: 1, ...extra,
    },
  })
  it('lê reacoes e minhaReacao; relé 0.3 não manda e o tópico fica sem as duas chaves', async () => {
    responder = () => topico({ reacoes: { curtir: 4, util: 2 }, minhaReacao: 'util' })
    expect(await new ClienteHttp({ base }).topico(ob('t1'))).toMatchObject({ reacoes: { curtir: 4, util: 2 }, minhaReacao: 'util' })
    responder = () => topico({ reacoes: { curtir: 1, util: 0 } })
    expect((await new ClienteHttp({ base }).topico(ob('t1'))).minhaReacao).toBeNull()
    responder = () => topico()
    const t = await new ClienteHttp({ base }).topico(ob('t1'))
    expect('reacoes' in t).toBe(false)
    expect('minhaReacao' in t).toBe(false)
  })
  it('contagem torta (texto, uma só das duas, lista) é ignorada: o tópico abre sem a barra', async () => {
    for (const reacoes of [{ curtir: 'muitas', util: 1 }, { curtir: 3 }, [1, 2], 'x', null]) {
      responder = () => topico({ reacoes })
      expect('reacoes' in (await new ClienteHttp({ base }).topico(ob('t1')))).toBe(false)
    }
  })
  it('`minhaReacao` de um tipo que o protocolo não tem vira nulo, nunca passa adiante', async () => {
    responder = () => topico({ reacoes: { curtir: 1, util: 1 }, minhaReacao: 'amei' })
    expect((await new ClienteHttp({ base }).topico(ob('t1'))).minhaReacao).toBeNull()
  })
})

describe('registro e fila de moderação', () => {
  const reg = (extra: Record<string, unknown>) => ({
    corpo: { itens: [{ id: 'reg1', em: T0, escopo: 'comunidade', contexto: ob('c1'), acao: 'remocao', alvoTipo: 'topico', alvo: ob('t1'), motivo: 'spam', por: 'dono', apelacao: null, ...extra }] },
  })
  it('a dispensa chega com `motivo: dispensada` e o registro a aceita (antes derrubaria a página inteira)', async () => {
    responder = () => reg({ acao: 'dispensa', motivo: 'dispensada', alvoTipo: 'resposta-forum', por: 'moderador' })
    const r = (await new ClienteHttp({ base }).registroDaComunidade(ob('c1'))).itens[0]
    expect(r).toMatchObject({ acao: 'dispensa', motivo: 'dispensada', por: 'moderador', alvo: ob('t1') })
  })
  it('`dispensada` só vale na dispensa: numa remoção é fora do contrato', async () => {
    responder = () => reg({ acao: 'remocao', motivo: 'dispensada' })
    expect(await codigo(() => new ClienteHttp({ base }).registroDaComunidade(ob('c1')))).toBe('indisponivel')
  })
  it('numa dispensa um motivo de moderação comum também é fora do contrato (o relé grava sempre `dispensada`)', async () => {
    responder = () => reg({ acao: 'dispensa', motivo: 'spam' })
    expect(await codigo(() => new ClienteHttp({ base }).registroDaComunidade(ob('c1')))).toBe('indisponivel')
  })
  it('a fila traz o id do tópico de cada denúncia; sem o campo (relé 0.3) a chave não existe', async () => {
    const den = (extra: Record<string, unknown>) => ({ alvo: ob('r1'), alvoTipo: 'resposta-forum', motivos: { spam: 1 }, total: 1, primeiraEm: T0, ultimaEm: T0, peso: 1, ...extra })
    responder = () => ({ corpo: { denuncias: [den({ topico: ob('t1') }), den({ alvo: ob('r2'), topico: null }), den({ alvo: ob('r3'), topico: 'lixo' }), den({ alvo: ob('r4') })], apelacoes: [] } })
    const f = await new ClienteHttp({ base, credencial: CRED }).filaDeModeracao(ob('c1'))
    expect(f.denuncias[0].topico).toBe(ob('t1'))
    expect(f.denuncias[1].topico).toBeNull()
    expect('topico' in f.denuncias[2]).toBe(false)
    expect('topico' in f.denuncias[3]).toBe(false)
  })
})

describe('removidos e depoimentos enviados', () => {
  const removido = (extra: Record<string, unknown> = {}) => ({
    id: 'rem1', em: T0, escopo: 'comunidade', contexto: ob('c1'), alvoTipo: 'topico', alvo: ob('t1'), motivo: 'spam', por: 'moderador', apelacao: null,
    envelope: { objeto: { id: ob('t1'), tipo: 'topico', autor: UID, criadoEm: T0, corpo: { titulo: 'Troco canecas', texto: 'Quem quer trocar?' } } }, ...extra,
  })
  it('sem o recurso `removidos` (relé 0.3) devolve lista vazia SEM chamar a rota que não existe', async () => {
    responder = (url) => (url === '/v1/info' ? semRecursos : { status: 404, corpo: {} })
    expect(await new ClienteHttp({ base, credencial: CRED }).removidos(UID)).toEqual({ itens: [] })
    expect(vistos.map((v) => v.url)).toEqual(['/v1/info'])
  })
  it('com o recurso lê o item, com o trecho do que foi removido; sem o envelope (já não retido) o trecho é nulo', async () => {
    responder = (url) => (url === '/v1/info' ? comRecursos('removidos') : { corpo: { itens: [removido(), removido({ id: 'rem2', envelope: null })], proximo: null } })
    const p = await new ClienteHttp({ base, credencial: CRED }).removidos(UID)
    expect(p.itens[0]).toMatchObject({ id: 'rem1', escopo: 'comunidade', alvoTipo: 'topico', motivo: 'spam', por: 'moderador', apelacao: null, em: ISO(T0) })
    expect(p.itens[0].trecho).toContain('Troco canecas')
    expect(p.itens[1].trecho).toBeNull()
    const url = vistos.find((v) => v.url.includes('/removidos'))
    expect(url?.url).toBe(`/v1/rovers/${UID}/removidos`)
    expect(url?.cabecalhos.authorization).toBe('Bearer x')
  })
  it('é leitura PRÓPRIA: sem credencial nem chama o relé e vira proibido', async () => {
    responder = (url) => (url === '/v1/info' ? comRecursos('removidos', 'depoimentos-enviados') : { corpo: { itens: [] } })
    const c = new ClienteHttp({ base, credencial: async () => null })
    expect(await codigo(() => c.removidos(UID))).toBe('proibido')
    expect(await codigo(() => c.depoimentosEnviados(UID))).toBe('proibido')
    expect(vistos.some((v) => v.url.includes('/removidos') || v.url.includes('enviados'))).toBe(false)
  })
  it('um envelope torto no meio do removido não derruba a lista: o trecho some e o resto fica', async () => {
    responder = (url) => (url === '/v1/info' ? comRecursos('removidos') : { corpo: { itens: [removido({ envelope: { objeto: 'lixo' } })] } })
    const p = await new ClienteHttp({ base, credencial: CRED }).removidos(UID)
    expect(p.itens[0].trecho).toBeNull()
  })
  it('motivo ou papel fora do protocolo é fora do contrato: a lista não aparece (a tela não mostra o que não entende)', async () => {
    responder = (url) => (url === '/v1/info' ? comRecursos('removidos') : { corpo: { itens: [removido({ por: 'o chefe' })] } })
    expect(await codigo(() => new ClienteHttp({ base, credencial: CRED }).removidos(UID))).toBe('indisponivel')
  })
  it('depoimentos enviados: pede `estado=enviados`, lê o destino e o texto; sem o recurso devolve vazio sem chamar', async () => {
    const env = { objeto: { id: ob('d1'), tipo: 'depoimento', autor: UID, criadoEm: T0, corpo: { alvo: uid('nina'), texto: 'A Nina reagenda.' } } }
    responder = (url) => (url === '/v1/info' ? comRecursos('depoimentos-enviados') : { corpo: { itens: [{ envelope: env, alvo: resumo('nina'), estado: 'pendente' }] } })
    const p = await new ClienteHttp({ base, credencial: CRED }).depoimentosEnviados(UID)
    expect(p.itens[0]).toMatchObject({ id: ob('d1'), estado: 'pendente', texto: 'A Nina reagenda.', alvo: { handle: 'nina' } })
    expect(vistos.some((v) => v.url === `/v1/rovers/${UID}/depoimentos?estado=enviados`)).toBe(true)
    vistos = []
    responder = (url) => (url === '/v1/info' ? semRecursos : { status: 404, corpo: {} })
    expect(await new ClienteHttp({ base, credencial: CRED }).depoimentosEnviados(UID)).toEqual({ itens: [] })
    expect(vistos.map((v) => v.url)).toEqual(['/v1/info'])
  })
})

describe('temas de páginas e `pessoas` no em alta', () => {
  it('temas: lê { tema, paginas }; sem o recurso devolve vazio sem chamar; tema fora da forma derruba a lista (a tela volta ao contorno)', async () => {
    responder = (url) => (url === '/v1/info' ? comRecursos('temas-de-paginas') : { corpo: { itens: [{ tema: 'arquivos', paginas: 3 }, { tema: 'cafe', paginas: 1 }] } })
    expect(await new ClienteHttp({ base }).temasDePaginas()).toEqual([{ tema: 'arquivos', paginas: 3 }, { tema: 'cafe', paginas: 1 }])
    responder = (url) => (url === '/v1/info' ? comRecursos('temas-de-paginas') : { corpo: { itens: [{ tema: 'Tema Com Espaço', paginas: 3 }] } })
    expect(await codigo(() => new ClienteHttp({ base }).temasDePaginas())).toBe('indisponivel')
    vistos = []
    responder = (url) => (url === '/v1/info' ? semRecursos : { status: 404, corpo: {} })
    expect(await new ClienteHttp({ base }).temasDePaginas()).toEqual([])
    expect(vistos.map((v) => v.url)).toEqual(['/v1/info'])
  })
  it('`pessoas`: inteiro de 0 a 1 milhão vira o campo; texto, negativo, fração e lista somem e o cartão fica como o da 0.3', async () => {
    const topico = { id: ob('t1'), comunidade: ob('c1'), categoria: null, titulo: 'T', trecho: 'x', autor: resumo(), criadoEm: T0, atividadeEm: T0, respostas: 1, fixado: false, trancado: false, resolvido: false, tags: [], enquete: false }
    responder = () => ({ corpo: { itens: [{ ...topico, pessoas: 7 }, { ...topico, id: ob('t2'), pessoas: '7' }, { ...topico, id: ob('t3'), pessoas: -1 }, { ...topico, id: ob('t4'), pessoas: 1.5 }, { ...topico, id: ob('t5'), pessoas: [uid('nina')] }, { ...topico, id: ob('t6'), pessoas: 2_000_000 }, { ...topico, id: ob('t7') }] } })
    const r = await new ClienteHttp({ base }).emAlta('topicos')
    expect(r.map((x) => x.pessoas)).toEqual([7, undefined, undefined, undefined, undefined, undefined, undefined])
    expect(r.slice(1).every((x) => !('pessoas' in x))).toBe(true)
  })
  it('`pessoas` também nos cartões de comunidade e de página', async () => {
    const com = { id: ob('c1'), nome: 'Oficina', descricao: 'x', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: [], pessoas: 5 }
    responder = () => ({ corpo: { itens: [com] } })
    expect((await new ClienteHttp({ base }).emAlta('comunidades'))[0].pessoas).toBe(5)
    const pag = { id: ob('g1'), nome: 'Mapa', descricao: 'x', tema: 'arquivos', dono: resumo(), seguidores: 3, criadaEm: T0, atividadeEm: T0, pessoas: 2 }
    responder = () => ({ corpo: { itens: [pag] } })
    expect((await new ClienteHttp({ base }).emAlta('paginas'))[0].pessoas).toBe(2)
  })
})

describe('suporta', () => {
  it('lê o info uma vez e guarda: perguntar de novo não repete a chamada', async () => {
    responder = () => comRecursos('removidos', 'temas-de-paginas')
    const c = new ClienteHttp({ base })
    expect(await c.suporta('removidos')).toBe(true)
    expect(await c.suporta('temas-de-paginas')).toBe(true)
    expect(await c.suporta('lista-completa')).toBe(false)
    expect(vistos.filter((v) => v.url === '/v1/info')).toHaveLength(1)
  })
  it('info fora do ar vale "nenhum recurso" (e não erro)', async () => {
    responder = () => ({ status: 500, corpo: {} })
    expect(await new ClienteHttp({ base }).suporta('removidos')).toBe(false)
  })
})
