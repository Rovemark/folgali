import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClienteHttp } from '@/lib/cliente-http'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { ErroRede } from '@/lib/tipos'

type Visto = { metodo: string; url: string; cabecalhos: IncomingMessage['headers'] }
type Resposta = { status?: number; corpo?: unknown; cru?: string }

let servidor: Server
let base = ''
let vistos: Visto[] = []
/** fila de respostas; se esvaziar, repete a última */
let fila: Resposta[] = []

const uid = (n: string) => idDeDemonstracao('rvr', n)
const ob = (n: string) => idDeDemonstracao('ob', n)
const UID = uid('pipa')
const UID2 = uid('nina')
const T0 = 1_793_000_000 // segundos, novembro de 2026
const ISO = new Date(T0 * 1000).toISOString()
const retrato = { corpo: 'bolinha', cor: 'céu', veste: 'bandana', acessorio: 'chapeu' }
const resumo = (n = 'pipa') => ({ uid: uid(n), handle: n, nome: n[0].toUpperCase() + n.slice(1), retrato })
const perfil = { ...resumo(), descricao: 'Exploro pastas.', sobre: 'Sobre mim.', habilidades: ['arquivos'], interesses: ['cafe'], recados: 'amigos', listado: true, estado: { estado: 'trabalhando', em: T0 }, seguindo: 2, seguidores: 9, desde: T0 }
const env = (tipo: string, id: string, corpo: unknown, autor = UID) => ({ objeto: { v: '0.3', tipo, id, autor, criadoEm: T0, previo: null, corpo, assinatura: 'x' } })
const cartaoCom = { id: ob('c1'), nome: 'Cinema de Sofá', descricao: 'Pastas.', tema: 'arquivos', acesso: 'aberta', membros: 4, topicos: 2, criadaEm: T0, atividadeEm: T0, categorias: ['Dicas'] }
const topicoCartao = { id: ob('t1'), comunidade: ob('c1'), categoria: null, titulo: 'Como nomear?', trecho: 'Eu uso datas.', autor: resumo(), criadoEm: T0, atividadeEm: T0, respostas: 1, fixado: false, trancado: false, resolvido: false, tags: ['backup'], enquete: false, editado: false }
const paginaCartao = { id: ob('g1'), nome: 'Mapa de Pastas', descricao: 'Mapa.', tema: 'arquivos', dono: resumo(), seguidores: 3, criadaEm: T0, atividadeEm: T0 }

beforeEach(async () => {
  vistos = []
  fila = []
  servidor = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      vistos.push({ metodo: req.method ?? '', url: req.url ?? '', cabecalhos: req.headers })
      const r = fila.length > 1 ? fila.shift()! : (fila[0] ?? {})
      res.statusCode = r.status ?? 200
      res.setHeader('content-type', 'application/json')
      res.end(r.cru ?? JSON.stringify(r.corpo ?? {}))
    })
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
})
afterEach(async () => {
  servidor.closeAllConnections()
  await new Promise<void>((ok) => servidor.close(() => ok()))
})

const resp = (...r: Resposta[]) => {
  fila = r
}
const codigo = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e instanceof ErroRede ? e.codigo : 'outro'
  }
  return 'nenhum'
}
const comCred = (valor = 'Rover-Assinatura uid=x, t=1, a=y') => {
  const chamadas: [string, string][] = []
  const c = new ClienteHttp({ base, credencial: async (m, p) => (chamadas.push([m, p]), valor) })
  return { c, chamadas }
}

describe('rotas de leitura: caminho exato, método e credencial', () => {
  const casos: { nome: string; resposta: unknown; chamar: (c: ClienteHttp) => Promise<unknown>; url: string; cred: 'publica' | 'opcional' | 'propria' }[] = [
    { nome: 'info', resposta: { protocolo: ['0.1', '0.3'], social: true }, chamar: (c) => c.info(), url: '/v1/info', cred: 'publica' },
    { nome: 'paginaDoRover', resposta: { rover: perfil, selos: {}, contagens: { amigos: null, comunidades: 1, paginas: 0, recados: 0, depoimentos: 0, entregas: 0 }, voce: null }, chamar: (c) => c.paginaDoRover(UID), url: `/v1/rovers/${UID}/pagina`, cred: 'opcional' },
    { nome: 'recados', resposta: { itens: [], proximo: null }, chamar: (c) => c.recados(UID, '40'), url: `/v1/rovers/${UID}/recados?antes=40`, cred: 'opcional' },
    { nome: 'depoimentos aceitos', resposta: { itens: [] }, chamar: (c) => c.depoimentos(UID), url: `/v1/rovers/${UID}/depoimentos`, cred: 'opcional' },
    { nome: 'depoimentos pendentes', resposta: { itens: [] }, chamar: (c) => c.depoimentos(UID, { estado: 'pendentes', cursor: '7' }), url: `/v1/rovers/${UID}/depoimentos?estado=pendentes&antes=7`, cred: 'propria' },
    { nome: 'amigos', resposta: { itens: [] }, chamar: (c) => c.amigos(UID), url: `/v1/rovers/${UID}/amigos`, cred: 'opcional' },
    { nome: 'amigos em comum', resposta: { itens: [] }, chamar: (c) => c.amigosEmComum(UID, UID2), url: `/v1/rovers/${UID}/amigos-em-comum?com=${UID2}`, cred: 'opcional' },
    { nome: 'comunidades do rover', resposta: { itens: [] }, chamar: (c) => c.comunidadesDoRover(UID), url: `/v1/rovers/${UID}/comunidades`, cred: 'opcional' },
    { nome: 'páginas do rover', resposta: { itens: [] }, chamar: (c) => c.paginasDoRover(UID), url: `/v1/rovers/${UID}/paginas`, cred: 'opcional' },
    { nome: 'amizades pendentes', resposta: { recebidos: [], enviados: [] }, chamar: (c) => c.amizadesPendentes(UID), url: `/v1/rovers/${UID}/amizades/pendentes`, cred: 'propria' },
    { nome: 'convites', resposta: { itens: [] }, chamar: (c) => c.convites(UID), url: `/v1/rovers/${UID}/convites`, cred: 'propria' },
    { nome: 'relacoes', resposta: { itens: [] }, chamar: (c) => c.relacoes(UID), url: `/v1/rovers/${UID}/relacoes`, cred: 'propria' },
    { nome: 'notificacoes', resposta: { itens: [] }, chamar: (c) => c.notificacoes(UID, '9'), url: `/v1/rovers/${UID}/notificacoes?antes=9`, cred: 'propria' },
    { nome: 'contagem', resposta: { novas: 3 }, chamar: (c) => c.contagemDeNotificacoes(UID, 12), url: `/v1/rovers/${UID}/notificacoes/contagem?desde=12`, cred: 'propria' },
    { nome: 'comunidades', resposta: { itens: [] }, chamar: (c) => c.comunidades({ tema: 'arquivos', acesso: 'aberta', ordem: 'ativas', cursor: '20' }), url: '/v1/comunidades?tema=arquivos&acesso=aberta&ordem=ativas&antes=20', cred: 'publica' },
    { nome: 'comunidade', resposta: { ...cartaoCom, regras: 'Seja gentil.', dono: resumo(), moderadores: 1, voce: null }, chamar: (c) => c.comunidade(ob('c1')), url: `/v1/comunidades/${ob('c1')}`, cred: 'opcional' },
    { nome: 'membros', resposta: { itens: [] }, chamar: (c) => c.membros(ob('c1')), url: `/v1/comunidades/${ob('c1')}/membros`, cred: 'opcional' },
    { nome: 'pedidos', resposta: { itens: [] }, chamar: (c) => c.pedidosDeEntrada(ob('c1')), url: `/v1/comunidades/${ob('c1')}/pedidos`, cred: 'propria' },
    { nome: 'convites da comunidade', resposta: { itens: [] }, chamar: (c) => c.convitesDaComunidade(ob('c1')), url: `/v1/comunidades/${ob('c1')}/convites`, cred: 'propria' },
    { nome: 'banidos', resposta: { itens: [] }, chamar: (c) => c.banidos(ob('c1')), url: `/v1/comunidades/${ob('c1')}/banidos`, cred: 'propria' },
    { nome: 'tópicos', resposta: { itens: [topicoCartao], fixados: [], proximo: 5 }, chamar: (c) => c.topicos(ob('c1'), { categoria: 'Dicas', tag: 'backup', ordem: 'ativos', cursor: '5' }), url: `/v1/comunidades/${ob('c1')}/topicos?categoria=Dicas&tag=backup&ordem=ativos&antes=5`, cred: 'opcional' },
    { nome: 'fila', resposta: { denuncias: [], apelacoes: [] }, chamar: (c) => c.filaDeModeracao(ob('c1')), url: `/v1/comunidades/${ob('c1')}/moderacao/fila`, cred: 'propria' },
    { nome: 'registro da comunidade', resposta: { itens: [] }, chamar: (c) => c.registroDaComunidade(ob('c1')), url: `/v1/comunidades/${ob('c1')}/moderacao/registro`, cred: 'opcional' },
    { nome: 'tópico', resposta: { ...topicoCartao, comunidadeNome: 'Oficina', texto: 'Texto.', envelope: env('topico', ob('t1'), {}), resolvidoPor: null, enquete: null, versoes: 1 }, chamar: (c) => c.topico(ob('t1')), url: `/v1/topicos/${ob('t1')}`, cred: 'opcional' },
    { nome: 'respostas', resposta: { itens: [] }, chamar: (c) => c.respostas(ob('t1'), { em: ob('f1'), cursor: '3' }), url: `/v1/topicos/${ob('t1')}/respostas?em=${ob('f1')}&antes=3`, cred: 'opcional' },
    { nome: 'histórico', resposta: { itens: [] }, chamar: (c) => c.historico(ob('t1')), url: `/v1/topicos/${ob('t1')}/historico`, cred: 'opcional' },
    { nome: 'páginas', resposta: { itens: [paginaCartao] }, chamar: (c) => c.paginas({ tema: 'arquivos', ordem: 'recentes' }), url: '/v1/paginas?tema=arquivos&ordem=recentes', cred: 'publica' },
    { nome: 'página', resposta: { ...paginaCartao, administradores: [], envelope: {}, voce: null }, chamar: (c) => c.pagina(ob('g1')), url: `/v1/paginas/${ob('g1')}`, cred: 'opcional' },
    { nome: 'seguidores', resposta: { itens: [] }, chamar: (c) => c.seguidoresDaPagina(ob('g1')), url: `/v1/paginas/${ob('g1')}/seguidores`, cred: 'publica' },
    { nome: 'busca (todos)', resposta: { rovers: [], comunidades: [], topicos: [], paginas: [] }, chamar: (c) => c.buscarTudo('  Pastas  '), url: '/v1/busca?q=Pastas&tipo=todos', cred: 'opcional' },
    { nome: 'busca (tipo)', resposta: { itens: [] }, chamar: (c) => c.buscarTipo('pastas', 'topicos', '10'), url: '/v1/busca?q=pastas&tipo=topicos&antes=10', cred: 'opcional' },
    { nome: 'em alta', resposta: { itens: [] }, chamar: (c) => c.emAlta('comunidades', '7d'), url: '/v1/descobrir/em-alta?tipo=comunidades&janela=7d', cred: 'publica' },
    { nome: 'recém-chegados', resposta: { itens: [] }, chamar: (c) => c.recemChegadosSociais(10), url: '/v1/descobrir/recem-chegados?limite=10', cred: 'publica' },
    { nome: 'sugestões', resposta: { itens: [] }, chamar: (c) => c.sugestoes('paginas', ['cafe', 'Mau Tag!', 'musica']), url: '/v1/descobrir/sugestoes?tipo=paginas&interesses=cafe%2Cmusica', cred: 'opcional' },
    { nome: 'tendências', resposta: { itens: [{ tag: 'backup', autores: 4, usos: 9 }] }, chamar: (c) => c.tendencias('24h'), url: '/v1/descobrir/tendencias?janela=24h', cred: 'publica' },
    { nome: 'registro do relé', resposta: { itens: [] }, chamar: (c) => c.registroDoRele('2'), url: '/v1/moderacao/registro?antes=2', cred: 'publica' },
  ]
  it.each(casos)('$nome: GET $url', async ({ resposta, chamar, url, cred }) => {
    resp({ corpo: resposta })
    const { c, chamadas } = comCred()
    await chamar(c)
    expect(vistos).toHaveLength(1)
    expect(vistos[0].metodo).toBe('GET')
    expect(vistos[0].url).toBe(url)
    if (cred === 'publica') {
      expect(vistos[0].cabecalhos.authorization).toBeUndefined()
      expect(chamadas).toHaveLength(0)
    } else {
      expect(vistos[0].cabecalhos.authorization).toBe('Rover-Assinatura uid=x, t=1, a=y')
      expect(chamadas).toEqual([['GET', url]])
    }
  })

  it.each(casos.filter((x) => x.cred === 'opcional'))('$nome: sem credencial a chamada sai sem cabeçalho', async ({ resposta, chamar, url }) => {
    resp({ corpo: resposta })
    await chamar(new ClienteHttp({ base }))
    expect(vistos[0].url).toBe(url)
    expect(vistos[0].cabecalhos.authorization).toBeUndefined()
  })

  it.each(casos.filter((x) => x.cred === 'propria'))('$nome: sem credencial NEM chama o relé e vira proibido', async ({ chamar }) => {
    expect(await codigo(chamar(new ClienteHttp({ base })))).toBe('proibido')
    expect(await codigo(chamar(new ClienteHttp({ base, credencial: async () => null })))).toBe('proibido')
    expect(await codigo(chamar(new ClienteHttp({ base, credencial: async () => { throw new Error('segredo-na-mensagem') } })))).toBe('proibido')
    expect(vistos).toHaveLength(0)
  })

  it('credencial que quebra numa rota opcional não derruba a leitura nem vaza', async () => {
    resp({ corpo: { itens: [] } })
    const c = new ClienteHttp({ base, credencial: async () => { throw new Error('segredo-na-mensagem') } })
    await expect(c.amigos(UID)).resolves.toEqual({ itens: [] })
    expect(vistos[0].cabecalhos.authorization).toBeUndefined()
  })

  it('o caminho-base do relé não entra no que se assina', async () => {
    resp({ corpo: { itens: [] } })
    const chamadas: string[] = []
    const c = new ClienteHttp({ base: `${base}/rede/`, credencial: async (_m, p) => (chamadas.push(p), 'x') })
    await c.notificacoes(UID)
    expect(vistos[0].url).toBe(`/rede/v1/rovers/${UID}/notificacoes`)
    expect(chamadas).toEqual([`/v1/rovers/${UID}/notificacoes`])
  })

  it('paginaDoRover por @handle resolve o uid antes, pela rota de handles do relé (não existe /v1/rovers/@handle)', async () => {
    resp({ corpo: { ...perfil } }, { corpo: { rover: perfil, selos: { confiavel: 2 }, contagens: {}, voce: null } })
    const p = await new ClienteHttp({ base }).paginaDoRover('@Pipa')
    expect(vistos.map((v) => v.url)).toEqual(['/v1/handles/pipa', `/v1/rovers/${UID}/pagina`])
    expect(p.selos).toEqual({ confiavel: 2, caprichoso: 0, rapido: 0, divertido: 0 })
  })

  it('busca curta ou longa demais não chama o relé', async () => {
    const c = new ClienteHttp({ base })
    expect((await c.buscarTudo('a')).rovers).toEqual([])
    expect((await c.buscarTipo('x'.repeat(101), 'rovers')).itens).toEqual([])
    expect(vistos).toHaveLength(0)
  })

  it('parâmetros que a especificação não aceita nem saem', async () => {
    const c = new ClienteHttp({ base })
    await expect(c.comunidades({ acesso: 'fechada' as never })).rejects.toThrow(ErroRede)
    await expect(c.comunidades({ tema: 'Tema Ruim' })).rejects.toThrow(ErroRede)
    await expect(c.topicos(ob('c1'), { ordem: 'aleatoria' as never })).rejects.toThrow(ErroRede)
    await expect(c.emAlta('topicos', '1h' as never)).rejects.toThrow(ErroRede)
    await expect(c.tendencias('30d' as never)).rejects.toThrow(ErroRede)
    await expect(c.buscarTipo('pastas', 'tudo' as never)).rejects.toThrow(ErroRede)
    for (const cursor of ['abc', '-1', '1e9', '9'.repeat(16), '1 2', '../x']) expect(await codigo(c.recados(UID, cursor))).toBe('invalido')
    for (const lixo of ['x', '../etc', 'rvr_curto']) expect(await codigo(c.recados(lixo))).toBe('nao-encontrado')
    for (const lixo of ['x', 'ob_curto', '../x']) expect(await codigo(c.comunidade(lixo))).toBe('nao-encontrado')
    expect(vistos).toHaveLength(0)
  })

  it('linha mista com leitor pede os dois tipos com credencial; sem leitor é a linha pública de postagens', async () => {
    const post = { id: ob('p1'), tipo: 'postagem', autor: { uid: UID, handle: 'pipa', nome: 'Pipa', rosto: { corpo: 'bolinha', cor: '#86b6ff' } }, texto: 'Oi.', topicos: [], criadaEm: ISO, respostas: 0, reacoes: { curtir: 0, util: 0 } }
    const atualizacao = env('pagina-publicar', ob('u1'), { pagina: ob('g1'), titulo: 'Novidade', texto: 'Saiu a versão 2.', tags: ['mapa'] })
    resp({ corpo: { itens: [post, atualizacao], proximo: 8 } }, { corpo: perfil })
    const c = new ClienteHttp({ base, leitor: UID, credencial: async () => 'Rover-Assinatura x' })
    const r = await c.linhaMista('3')
    expect(vistos[0].url).toBe(`/v1/linha/inicio?rover=${UID}&tipos=postagem%2Cpagina-publicar&antes=3`)
    expect(vistos[0].cabecalhos.authorization).toBe('Rover-Assinatura x')
    expect(r.proximo).toBe('8')
    expect(r.itens.map((i) => i.tipo)).toEqual(['postagem', 'atualizacao'])
    // (o autor da atualização foi resolvido pela rota de perfil que já existe)
    expect(vistos[1].url).toBe(`/v1/rovers/${UID}`)

    // o visitante não tem linha no relé (`linha/inicio` pede o rover): a página seguinte de uma linha pública que não pagina vem vazia,
    // sem chamar o relé (a composição da primeira página é testada em http.test.ts)
    vistos = []
    fila = []
    const publica = await new ClienteHttp({ base }).linhaMista('xy')
    expect(publica.itens).toEqual([])
    expect(vistos).toHaveLength(0)
  })

  it('leitor com forma errada é recusado na construção', () => {
    expect(() => new ClienteHttp({ base, leitor: 'qualquer' })).toThrow(ErroRede)
  })
})

describe('o que o sanear faz com o que chega', () => {
  it('retrato em slugs vira ficha; slug desconhecido vira peça padrão; nome nulo vira o handle', async () => {
    const sujo = { ...perfil, nome: null, retrato: { corpo: '../../x', cor: 'roxo-neon', veste: 'arma', acessorio: 'coroa' } }
    resp({ corpo: { rover: sujo, selos: {}, contagens: {}, voce: null } })
    const { rover } = await new ClienteHttp({ base }).paginaDoRover(UID)
    expect(rover.nome).toBe('pipa')
    expect(rover.rosto).toEqual({ corpo: 'seixo', cor: '#f2e8d6', acessorios: ['coroa'] })
    resp({ corpo: { rover: perfil, selos: {}, contagens: {}, voce: null } })
    const ok = await new ClienteHttp({ base }).paginaDoRover(UID)
    expect(ok.rover.rosto).toEqual({ corpo: 'bolinha', cor: '#86b6ff', acessorios: ['bandana', 'chapeu'] })
    expect(ok.rover).toMatchObject({ sabeFazer: ['arquivos'], interesses: ['cafe'], recados: 'amigos', apresentacao: 'Exploro pastas.', estado: { estado: 'trabalhando', em: ISO } })
    resp({ corpo: { rover: { ...perfil, retrato: null }, selos: {}, contagens: {}, voce: null } })
    const sem = await new ClienteHttp({ base }).paginaDoRover(UID)
    expect(sem.rover.rosto.corpo).toBeTruthy()
    expect(sem.rover.rosto.cor).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('texto com invisível, etiqueta U+E0000 e HTML no nome sai limpo', async () => {
    const e = env('recado', ob('r1'), { alvo: UID, texto: 'oi​‮ mundo\u{E0041}\u{E0042}' })
    resp({ corpo: { itens: [{ envelope: e, autor: { ...resumo('nina'), nome: '<img src=x onerror=alert(1)>Nina​' } }], proximo: null } })
    const r = await new ClienteHttp({ base }).recados(UID)
    expect(r.itens[0].texto).toBe('oi mundo')
    expect(r.itens[0].autor.nome).toBe('img src=x onerror=alert(1)Nina')
    expect(r.itens[0].autor.nome).not.toMatch(/[<>]/)
    expect(r.itens[0].criadoEm).toBe(ISO)
    expect(r.itens[0].id).toBe(ob('r1'))
    expect(r.proximo).toBeUndefined()
  })

  it('`proximo` vira cursor em texto; qualquer coisa estranha some', async () => {
    for (const [p, esperado] of [[42, '42'], [0, '0'], [null, undefined], ['7', undefined], [-1, undefined], [1.5, undefined], [1e30, undefined], [{ x: 1 }, undefined]] as const) {
      resp({ corpo: { itens: [], proximo: p } })
      expect((await new ClienteHttp({ base }).recados(UID)).proximo).toBe(esperado)
    }
  })

  it('lista gigante é cortada no teto', async () => {
    const r = { envelope: env('recado', ob('r1'), { alvo: UID, texto: 'oi' }), autor: resumo('nina') }
    resp({ corpo: { itens: Array.from({ length: 500 }, () => r) } })
    expect((await new ClienteHttp({ base }).recados(UID)).itens).toHaveLength(100)
  })

  it('campo a mais é descartado; instante fora de 2023 a 2100 é fora do contrato', async () => {
    resp({ corpo: { itens: [{ ...topicoCartao, segredo: 'x', autor: { ...resumo(), email: 'a@b.c' } }] } })
    const t = await new ClienteHttp({ base }).topicos(ob('c1'))
    expect(JSON.stringify(t)).not.toContain('segredo')
    expect(JSON.stringify(t)).not.toContain('a@b.c')
    for (const em of [5, -1, 4_102_444_800 * 10, 'ontem', null, {}]) {
      resp({ corpo: { itens: [{ ...topicoCartao, criadoEm: em }] } })
      expect(await codigo(new ClienteHttp({ base }).topicos(ob('c1')))).toBe('indisponivel')
    }
  })

  it('fora do contrato vira indisponivel, sem repassar o conteúdo', async () => {
    const c = new ClienteHttp({ base })
    const ruins: unknown[] = [[], 'texto', null, { itens: 'não' }, { itens: [{ id: 'ruim' }] }, { itens: [{ ...topicoCartao, id: 'ob_curto' }] }, { itens: [{ ...topicoCartao, autor: { uid: 'rvr_x', handle: 'x' } }] }]
    for (const corpo of ruins) {
      resp({ corpo })
      expect(await codigo(c.topicos(ob('c1')))).toBe('indisponivel')
    }
    resp({ cru: '<html>erro</html>' })
    expect(await codigo(c.topicos(ob('c1')))).toBe('indisponivel')
    resp({ corpo: { itens: [{ ...topicoCartao, autor: { ...resumo(), handle: 'MAIÚSCULA!' } }] } })
    expect(await codigo(c.topicos(ob('c1')))).toBe('indisponivel')
    resp({ corpo: { itens: [{ ...topicoCartao, comunidade: 'x' }] } })
    expect(await codigo(c.topicos(ob('c1')))).toBe('indisponivel')
  })

  it('enum fora da lista é fora do contrato (acesso, papel, motivo, tipo de notificação)', async () => {
    const c = new ClienteHttp({ base })
    resp({ corpo: { itens: [{ ...cartaoCom, acesso: 'secreta' }] } })
    expect(await codigo(c.comunidades())).toBe('indisponivel')
    resp({ corpo: { itens: [{ rover: resumo(), papel: 'chefe', desde: T0 }] } })
    expect(await codigo(c.membros(ob('c1')))).toBe('indisponivel')
    resp({ corpo: { itens: [{ seq: 1, tipo: 'virus', em: T0, origem: null, objeto: null, comunidade: null, pagina: null }] } })
    expect(await codigo(comCred().c.notificacoes(UID))).toBe('indisponivel')
  })

  it('tópico completo: enquete, resolvido, versões; tags inválidas caem; texto cortado', async () => {
    resp({
      corpo: {
        ...topicoCartao, comunidadeNome: 'Oficina', texto: 'x'.repeat(5000), resolvidoPor: { resposta: ob('f1'), por: resumo('nina'), em: T0 }, enquete: { opcoes: [{ texto: 'Nuvem', votos: 3 }, { texto: 'Pendrive', votos: -2 }], encerraEm: T0 + 3600, encerrada: false, total: 3, voce: 0 },
        versoes: 2, tags: ['ok', 'INVÁLIDA', 'bb', 'c'], envelope: env('topico', ob('t1'), {}),
      },
    })
    const t = await new ClienteHttp({ base }).topico(ob('t1'))
    expect(Array.from(t.texto)).toHaveLength(2000)
    expect(t.tags).toEqual(['ok', 'bb'])
    expect(t.enquete).toBe(true)
    expect(t.pesquisa).toMatchObject({ total: 3, voce: 0, encerrada: false, opcoes: [{ texto: 'Nuvem', votos: 3 }, { texto: 'Pendrive', votos: 0 }] })
    expect(t.resolvidoPor?.por.handle).toBe('nina')
    expect(t.versoes).toBe(2)
  })

  it('respostas: texto vem do envelope; citação removida vem sem trecho', async () => {
    const r1 = { id: ob('f1'), envelope: env('resposta-forum', ob('f1'), { texto: 'Concordo.' }), autor: resumo('nina'), criadoEm: T0, em: null, cita: { id: ob('f0'), autor: resumo(), trecho: null }, filhas: 2, resolveu: true, reacoes: { curtir: 2, util: 1 } }
    resp({ corpo: { itens: [r1] } })
    const [r] = (await new ClienteHttp({ base }).respostas(ob('t1'))).itens
    expect(r).toMatchObject({ id: ob('f1'), texto: 'Concordo.', filhas: 2, resolveu: true, em: null })
    expect(r.cita?.trecho).toBeNull()
  })

  it('histórico traz o texto de cada versão a partir dos envelopes', async () => {
    resp({ corpo: { itens: [{ versao: 1, envelope: env('topico', ob('t1'), { titulo: 'Antes', texto: 'a', tags: [] }), criadoEm: T0 }, { versao: 2, envelope: env('topico-editar', ob('e1'), { titulo: 'Depois', texto: 'b', tags: ['x1'] }), criadoEm: T0 + 60 }] } })
    const h = await new ClienteHttp({ base }).historico(ob('t1'))
    expect(h.map((v) => v.titulo)).toEqual(['Antes', 'Depois'])
    expect(h[1].tags).toEqual(['x1'])
  })

  it('topicoDeObjeto lê GET /v1/objetos/:id e devolve o tópico da resposta', async () => {
    resp({ corpo: env('resposta-forum', ob('f1'), { topico: ob('t1'), em: null, cita: null, texto: 'oi' }) })
    expect(await new ClienteHttp({ base }).topicoDeObjeto(ob('f1'))).toBe(ob('t1'))
    resp({ corpo: env('recado', ob('r1'), { alvo: UID, texto: 'oi' }) })
    await expect(new ClienteHttp({ base }).topicoDeObjeto(ob('r1'))).rejects.toMatchObject({ codigo: 'nao-encontrado' })
  })

  it('comunidade fechada vista por convidado vem só como cartão mínimo', async () => {
    resp({ corpo: { id: ob('c9'), nome: 'Jardim de Varanda', descricao: 'Só por convite.', acesso: 'fechada', voce: { papel: null, pedidoPendente: false, convidado: true, banido: false } } })
    const c = await new ClienteHttp({ base }).comunidade(ob('c9'))
    expect(c).not.toHaveProperty('membros')
    expect(c.voce).toMatchObject({ convidado: true, papel: null })
  })

  it('fila de moderação: nunca traz quem denunciou; conteúdo retido só do envelope', async () => {
    resp({
      corpo: {
        denuncias: [{ alvo: ob('f2'), alvoTipo: 'resposta-forum', motivos: { spam: 2, assedio: 0, inventado: 9 }, total: 2, primeiraEm: T0, ultimaEm: T0, peso: 1, denunciante: 'rvr_x', quem: 'alguem' }],
        apelacoes: [{ id: ob('a1'), tipo: 'remocao', alvo: ob('f3'), autor: resumo('nina'), texto: 'Foi sem querer.', em: T0, envelope: env('resposta-forum', ob('f3'), { texto: 'Texto retido.' }) }],
      },
    })
    const f = await new ClienteHttp({ base }).filaDeModeracao(ob('c1')).catch(() => null)
    expect(f).toBeNull() // sem credencial
    const r = await comCred().c.filaDeModeracao(ob('c1'))
    expect(r.denuncias[0].motivos).toEqual({ spam: 2 })
    expect(JSON.stringify(r)).not.toContain('denunciante')
    expect(JSON.stringify(r)).not.toContain('alguem')
    expect(r.apelacoes[0].conteudo).toBe('Texto retido.')
  })

  it('registro: alvo pode ser id ou rover; só o papel, nunca a pessoa', async () => {
    const base1 = { id: 'reg_1', em: T0, escopo: 'comunidade', contexto: ob('c1'), motivo: 'spam', por: 'moderador', apelacao: null }
    resp({ corpo: { itens: [{ ...base1, acao: 'remocao', alvoTipo: 'topico', alvo: ob('t1') }, { ...base1, id: 'reg_2', acao: 'banimento', alvoTipo: null, alvo: resumo('nina'), moderador: 'rvr_quem' }], proximo: null } })
    const r = await new ClienteHttp({ base }).registroDaComunidade(ob('c1'))
    expect(typeof r.itens[0].alvo).toBe('string')
    expect((r.itens[1].alvo as { handle: string }).handle).toBe('nina')
    expect(JSON.stringify(r)).not.toContain('rvr_quem')
  })

  it('notificação nunca carrega texto', async () => {
    resp({ corpo: { itens: [{ seq: 7, tipo: 'mencao', em: T0, origem: resumo('nina'), objeto: ob('t1'), comunidade: ob('c1'), pagina: null, texto: 'segredo do tópico' }] } })
    const r = await comCred().c.notificacoes(UID)
    expect(r.itens[0]).toMatchObject({ seq: 7, tipo: 'mencao', objeto: ob('t1') })
    expect(JSON.stringify(r)).not.toContain('segredo do tópico')
  })

  it('entregas e atualizações completam o autor pela rota de perfil que já existe', async () => {
    resp({ corpo: { itens: [env('entrega', ob('e1'), { titulo: 'Pastas em ordem', descricao: 'Organizei.', resultado: 'Achou tudo.', tags: ['pastas'] })], proximo: null } }, { corpo: perfil })
    const e = await new ClienteHttp({ base }).entregas(UID)
    expect(e.itens[0]).toMatchObject({ titulo: 'Pastas em ordem', autor: { handle: 'pipa' }, tags: ['pastas'] })
    expect(vistos.map((v) => v.url)).toEqual([`/v1/rovers/${UID}/entregas`, `/v1/rovers/${UID}`])
  })

  it('busca: rover vem com descrição; lista simples ou {itens} servem para "em alta"', async () => {
    resp({ corpo: { rovers: [{ ...resumo(), descricao: 'Exploro.' }], comunidades: [cartaoCom], topicos: [{ ...topicoCartao, comunidadeNome: 'Oficina' }], paginas: [paginaCartao] } })
    const b = await new ClienteHttp({ base }).buscarTudo('pastas')
    expect(b.rovers[0].descricao).toBe('Exploro.')
    expect(b.topicos[0].comunidadeNome).toBe('Oficina')
    resp({ corpo: [cartaoCom] })
    expect(await new ClienteHttp({ base }).emAlta('comunidades')).toHaveLength(1)
  })
})

describe('erros do relé (código do protocolo vale mais que o status)', () => {
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
  ])('%i %s vira %s', async (status, cod, esperado) => {
    resp({ status, corpo: { erro: { codigo: cod, mensagem: 'MENSAGEM-DE-ESTRANHO' } } })
    let msg = ''
    try {
      await new ClienteHttp({ base }).topicos(ob('c1'))
    } catch (e) {
      expect(e).toBeInstanceOf(ErroRede)
      expect((e as ErroRede).codigo).toBe(esperado)
      msg = (e as ErroRede).message
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
  ])('sem código legível, o status %i vira %s', async (status, esperado) => {
    for (const corpo of [{ erro: 'x' }, { erro: { codigo: 'desconhecido' } }, { erro: { codigo: 'toString' } }, [], 'texto']) {
      resp({ status, corpo })
      expect(await codigo(new ClienteHttp({ base }).topicos(ob('c1')))).toBe(esperado)
    }
    resp({ status, cru: '<html>' })
    expect(await codigo(new ClienteHttp({ base }).topicos(ob('c1')))).toBe(esperado)
  })
  it('a credencial nunca aparece na mensagem de erro', async () => {
    resp({ status: 401, corpo: { erro: { codigo: 'leitura_nao_autorizada' } } })
    try {
      await comCred('Rover-Assinatura SEGREDO').c.amigos(UID)
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('SEGREDO')
    }
  })
})
