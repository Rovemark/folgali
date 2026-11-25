import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClienteHttp } from '@/lib/cliente-http'
import { aprovar, selarToque, type Rascunho } from '@/lib/dominio/aprovacao'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { ErroRede } from '@/lib/tipos'

type Visto = { metodo: string; url: string; cabecalhos: IncomingMessage['headers']; corpo: string }
type Resposta = { status?: number; corpo?: unknown; cru?: string; demora?: number }

let servidor: Server
let base = ''
let vistos: Visto[] = []
let proxima: Resposta | ((url: string) => Resposta) = {}

const UID = idDeDemonstracao('rvr', 'pipa')
const OB = idDeDemonstracao('ob', 'p01')
const rosto = { corpo: 'bolinha', cor: '#86b6ff', acessorios: ['chapeu'] }
const perfilOk = { uid: UID, handle: 'pipa', nome: 'Pipa', rosto, apresentacao: 'Exploro pastas.', sabeFazer: ['achar duplicatas'], seguindo: 2, seguidores: 9, desde: '2026-10-01T00:00:00Z' }

beforeEach(async () => {
  vistos = []
  proxima = {}
  servidor = createServer((req, res) => {
    const partes: Buffer[] = []
    req.on('data', (c) => partes.push(c))
    req.on('end', () => {
      vistos.push({ metodo: req.method ?? '', url: req.url ?? '', cabecalhos: req.headers, corpo: Buffer.concat(partes).toString() })
      const r = typeof proxima === 'function' ? proxima(req.url ?? '') : proxima
      setTimeout(() => {
        res.statusCode = r.status ?? 200
        res.setHeader('content-type', 'application/json')
        if (r.status === 204) return res.end()
        res.end(r.cru ?? JSON.stringify(r.corpo ?? {}))
      }, r.demora ?? 0)
    })
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
})
afterEach(async () => {
  servidor.closeAllConnections()
  await new Promise<void>((ok) => servidor.close(() => ok()))
})

const codigo = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e instanceof ErroRede ? e.codigo : 'outro'
  }
  return 'nenhum'
}

describe('construção', () => {
  it('só aceita endereço http ou https válido', () => {
    expect(() => new ClienteHttp({ base: 'isto não é url' })).toThrow(ErroRede)
    expect(() => new ClienteHttp({ base: 'ftp://exemplo.com' })).toThrow(ErroRede)
    expect(() => new ClienteHttp({ base: 'file:///etc/passwd' })).toThrow(ErroRede)
    expect(new ClienteHttp({ base: 'https://rele.exemplo.com' }).modo).toBe('http')
  })
  it('tira a barra do fim, mantém o caminho-base e não vaza chaves na URL', async () => {
    proxima = { corpo: perfilOk }
    const c = new ClienteHttp({ base: `${base}/rede/` })
    await c.obterRover(UID)
    expect(vistos[0].url).toBe(`/rede/v1/rovers/${UID}`)
  })
})

// O relé real serve o perfil com `descricao`, `habilidades` e `retrato`, e as postagens como envelopes (objeto + aprovação), sem contagens.
const perfilRele = { uid: UID, handle: 'pipa', nome: 'Pipa', descricao: 'Exploro pastas.', habilidades: ['achar-duplicatas'], seguindo: 2, seguidores: 9, retrato: { corpo: 'bolinha', cor: 'ceu', veste: 'chapeu', acessorio: null }, desde: 1793000000 }
const envelope = (id: string, corpo: Record<string, unknown> = {}, tipo = 'postagem', autor = UID) => ({
  aprovacao: { tipo: 'aprovacao-humana' },
  objeto: { id, tipo, autor, criadoEm: 1793010579, previo: null, v: '0.3', assinatura: 'x', corpo: { texto: 'Olá, rede.', topicos: ['arquivos'], ...corpo } },
})
/** Responde por caminho: o perfil do autor e o que a chamada pediu. */
const rotas = (r: Record<string, Resposta>) => (url: string): Resposta => {
  const chave = Object.keys(r).find((k) => url === k || url.startsWith(k + '?'))
  return chave ? r[chave] : { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
}

describe('leitura', () => {
  it('obterRover por @handle usa a rota de handles do relé e por uid a de rovers', async () => {
    proxima = { corpo: perfilRele }
    const c = new ClienteHttp({ base })
    const p = await c.obterRover('@Pipa')
    expect(vistos[0].metodo).toBe('GET')
    expect(vistos[0].url).toBe('/v1/handles/pipa')
    expect(p).toMatchObject({ uid: UID, handle: 'pipa', nome: 'Pipa', seguidores: 9, apresentacao: 'Exploro pastas.', sabeFazer: ['achar-duplicatas'] })
    expect(p.rosto).toMatchObject({ corpo: 'bolinha', cor: '#86b6ff' })
    await c.obterRover(UID)
    expect(vistos[1].url).toBe(`/v1/rovers/${UID}`)
  })
  it('refs inválidas nem saem do computador', async () => {
    const c = new ClienteHttp({ base })
    for (const ref of ['../etc/passwd', 'a b', '@@', 'x', '']) expect(await codigo(c.obterRover(ref))).toBe('nao-encontrado')
    expect(vistos).toHaveLength(0)
  })
  it('postagens do rover: pede a página do relé, monta a postagem com o autor e diz que não há contagem', async () => {
    proxima = rotas({
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [envelope(OB), envelope(idDeDemonstracao('ob', 'r1'), { alvo: OB }, 'resposta')], proximo: 31 } },
      [`/v1/rovers/${UID}`]: { corpo: perfilRele },
    })
    const c = new ClienteHttp({ base })
    const r = await c.postagensDoRover(UID, { cursor: '40' })
    // o primeiro pedido é o `/v1/info` (os recursos da 0.3.1); sem recurso declarado, a lista é a de antes
    expect(vistos.filter((v) => v.url !== '/v1/info')[0].url).toBe(`/v1/rovers/${UID}/postagens?limite=20&antes=40`)
    expect(r.proximo).toBe('31')
    expect(r.itens.map((p) => p.tipo)).toEqual(['postagem', 'resposta'])
    expect(r.itens[0]).toMatchObject({ id: OB, texto: 'Olá, rede.', topicos: ['arquivos'], respostas: 0, reacoes: { curtir: 0, util: 0 } })
    expect(r.itens[0].autor).toMatchObject({ uid: UID, handle: 'pipa', nome: 'Pipa' })
    expect(r.itens[0].criadaEm).toBe(new Date(1793010579 * 1000).toISOString())
    expect(r.itens[1].respondeA).toBe(OB)
    const so = await c.postagensDoRover(UID, { tipo: 'resposta' })
    expect(so.itens.map((p) => p.tipo)).toEqual(['resposta'])
    expect(await codigo(c.postagensDoRover('lixo'))).toBe('nao-encontrado')
  })
  it('um autor que saiu da rede (404) some da página; o resto continua', async () => {
    const SAIU = idDeDemonstracao('rvr', 'saiu')
    proxima = rotas({
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [envelope(OB), envelope(idDeDemonstracao('ob', 'x9'), {}, 'postagem', SAIU)] } },
      [`/v1/rovers/${UID}`]: { corpo: perfilRele },
    })
    const r = await new ClienteHttp({ base }).postagensDoRover(UID)
    expect(r.itens.map((p) => p.id)).toEqual([OB])
    expect(r.proximo).toBeUndefined()
  })
  it('linha de quem olha: com o rover da pessoa usa a linha dele; visitante vê as postagens de quem chegou há pouco, em ordem', async () => {
    const OUTRO = idDeDemonstracao('rvr', 'nina')
    const antigo = envelope(idDeDemonstracao('ob', 'ant'), { texto: 'Mais antiga.' })
    antigo.objeto.criadoEm = 1793000000
    proxima = rotas({
      '/v1/linha/inicio': { corpo: { itens: [envelope(OB)], proximo: 7 } },
      '/v1/descobrir/recem-chegados': { corpo: { itens: [{ uid: UID }, { uid: OUTRO }] } },
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [antigo] } },
      [`/v1/rovers/${OUTRO}/postagens`]: { corpo: { itens: [envelope(idDeDemonstracao('ob', 'nov'), { texto: 'Mais nova.' }, 'postagem', OUTRO)] } },
      [`/v1/rovers/${UID}`]: { corpo: perfilRele },
      [`/v1/rovers/${OUTRO}`]: { corpo: { ...perfilRele, uid: OUTRO, handle: 'nina', nome: 'Nina' } },
    })
    const comLeitor = new ClienteHttp({ base, leitor: UID })
    const minha = await comLeitor.linhaInicio('9')
    expect(vistos.filter((v) => v.url !== '/v1/info')[0].url).toBe(`/v1/linha/inicio?rover=${UID}&limite=20&antes=9`)
    expect(minha.proximo).toBe('7')
    vistos = []
    const publica = await new ClienteHttp({ base }).linhaInicio()
    expect(publica.itens.map((p) => p.texto)).toEqual(['Mais nova.', 'Mais antiga.'])
    expect(publica.proximo).toBeUndefined()
    expect((await new ClienteHttp({ base }).linhaInicio('x')).itens).toEqual([])
  })
  it('linha mista: o visitante vê as postagens e as atualizações de página mais novas juntas; quem tem rover usa a linha dele', async () => {
    const PG = idDeDemonstracao('ob', 'pagina')
    const AT = idDeDemonstracao('ob', 'atual')
    const cartaoPagina = { id: PG, nome: 'Mapa de Pastas', descricao: 'x', tema: 'mapas', dono: { uid: UID, handle: 'pipa', nome: 'Pipa' }, seguidores: 1, criadaEm: 1793000000, atividadeEm: 1793000000 }
    const atualizacao = { aprovacao: { tipo: 'aprovacao-humana' }, objeto: { id: AT, tipo: 'pagina-publicar', autor: UID, criadoEm: 1793050000, previo: null, v: '0.3', assinatura: 'x', corpo: { pagina: PG, texto: 'Atualização do meio.', tags: ['mapas'] } } }
    const antiga = envelope(idDeDemonstracao('ob', 'ant'), { texto: 'Postagem antiga.' })
    antiga.objeto.criadoEm = 1793000000
    const nova = envelope(OB, { texto: 'Postagem nova.' })
    nova.objeto.criadoEm = 1793090000
    proxima = rotas({
      '/v1/descobrir/recem-chegados': { corpo: { itens: [{ uid: UID }] } },
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [nova, antiga] } },
      [`/v1/rovers/${UID}`]: { corpo: perfilRele },
      '/v1/paginas': { corpo: { itens: [cartaoPagina] } },
      [`/v1/paginas/${PG}/atualizacoes`]: { corpo: { itens: [atualizacao] } },
    })
    const r = await new ClienteHttp({ base }).linhaMista()
    expect(r.itens.map((i) => (i.tipo === 'postagem' ? i.postagem.texto : i.atualizacao.texto))).toEqual(['Postagem nova.', 'Atualização do meio.', 'Postagem antiga.'])
    expect(r.proximo).toBeUndefined()
    const dePagina = r.itens.find((i) => i.tipo === 'atualizacao')
    expect(dePagina?.tipo === 'atualizacao' && dePagina.atualizacao.paginaNome).toBe('Mapa de Pastas')
    expect((await new ClienteHttp({ base }).linhaMista('x')).itens).toEqual([])
    // sem nada para mostrar, a linha vem vazia e a página não quebra: um pedaço que falha não derruba o resto
    proxima = rotas({ '/v1/descobrir/recem-chegados': { status: 500 }, '/v1/paginas': { status: 500 } })
    expect((await new ClienteHttp({ base }).linhaMista()).itens).toEqual([])
    // com o rover da pessoa pareado é a linha dele, com `tipos`
    vistos = []
    proxima = { corpo: { itens: [] } }
    await new ClienteHttp({ base, leitor: UID, credencial: async () => 'Rover-Assinatura x' }).linhaMista()
    expect(vistos[0].url).toContain(`/v1/linha/inicio?rover=${UID}`)
    expect(vistos[0].url).toContain('tipos=postagem%2Cpagina-publicar')
  })
  it('linha do visitante sem recém-chegados: completa com quem participa das comunidades abertas', async () => {
    const CM = idDeDemonstracao('ob', 'comunidade')
    proxima = rotas({
      '/v1/descobrir/recem-chegados': { corpo: { itens: [] } },
      '/v1/comunidades': { corpo: { itens: [{ id: CM }, { id: 'lixo' }] } },
      [`/v1/comunidades/${CM}/membros`]: { corpo: { itens: [{ rover: { uid: UID }, papel: 'dono' }, { rover: { uid: 'lixo' } }] } },
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [envelope(OB, { texto: 'De quem participa.' })] } },
      [`/v1/rovers/${UID}`]: { corpo: perfilRele },
    })
    const r = await new ClienteHttp({ base }).linhaInicio()
    expect(r.itens.map((p) => p.texto)).toEqual(['De quem participa.'])
    expect(vistos.some((v) => v.url === `/v1/comunidades/${CM}/membros?limite=10`)).toBe(true)
    expect(vistos.some((v) => v.url.includes('/v1/comunidades/lixo'))).toBe(false)
    // recém-chegados que já enchem a lista de 12 dispensam a busca nas comunidades
    vistos = []
    // rótulos de letras: números colidiriam no preenchimento com zeros (n1 e n10 viram o mesmo id)
    const doze = Array.from({ length: 12 }, (_, i) => ({ uid: idDeDemonstracao('rvr', `n${String.fromCharCode(97 + i)}`) }))
    proxima = rotas({ '/v1/descobrir/recem-chegados': { corpo: { itens: doze } } })
    await new ClienteHttp({ base }).linhaInicio()
    expect(vistos.some((v) => v.url.startsWith('/v1/comunidades'))).toBe(false)
  })
  it('objeto: a postagem, o pai de uma resposta e a lista de respostas vazia (o relé não a serve)', async () => {
    const R1 = idDeDemonstracao('ob', 'r1')
    proxima = rotas({
      [`/v1/objetos/${R1}`]: { corpo: envelope(R1, { alvo: OB, texto: 'Respondendo.' }, 'resposta') },
      [`/v1/objetos/${OB}`]: { corpo: envelope(OB) },
      [`/v1/rovers/${UID}`]: { corpo: perfilRele },
    })
    const c = new ClienteHttp({ base })
    const d = await c.obterObjeto(R1)
    expect(d.postagem.tipo).toBe('resposta')
    expect(d.pai?.id).toBe(OB)
    expect(d.respostas).toEqual([])
    expect((await c.obterObjeto(OB)).pai).toBeUndefined()
    expect(await codigo(c.obterObjeto('lixo'))).toBe('nao-encontrado')
    proxima = rotas({ [`/v1/objetos/${OB}`]: { corpo: { objeto: { ...envelope(OB).objeto, tipo: 'perfil' } } } })
    expect(await codigo(c.obterObjeto(OB))).toBe('indisponivel')
  })
  it('busca de rovers e descobrir usam as rotas de busca e de descoberta do relé', async () => {
    const OUTRO = idDeDemonstracao('rvr', 'nina')
    proxima = rotas({
      '/v1/busca': { corpo: { itens: [{ uid: UID, handle: 'pipa', nome: 'Pipa', descricao: 'x' }] } },
      '/v1/descobrir/em-alta': { corpo: { itens: [{ id: OB, autor: { uid: UID } }, { id: OB, autor: { uid: UID } }] } },
      '/v1/descobrir/recem-chegados': { corpo: { itens: [{ uid: OUTRO }] } },
      [`/v1/rovers/${UID}`]: { corpo: perfilRele },
      [`/v1/rovers/${OUTRO}`]: { corpo: { ...perfilRele, uid: OUTRO, handle: 'nina', nome: 'Nina' } },
    })
    const c = new ClienteHttp({ base })
    expect((await c.buscar('  @PiPa ')).rovers.map((r) => r.handle)).toEqual(['pipa'])
    expect(vistos[0].url).toBe('/v1/busca?q=pipa&tipo=rovers&limite=20')
    const d = await c.descobrir()
    expect(d.emAlta.map((r) => r.handle)).toEqual(['pipa'])
    expect(d.recemChegados.map((r) => r.handle)).toEqual(['nina'])
    // a descoberta nunca derruba a página: sem tópicos em alta, só os recém-chegados
    proxima = rotas({ '/v1/descobrir/recem-chegados': { corpo: { itens: [{ uid: OUTRO }] } }, [`/v1/rovers/${OUTRO}`]: { corpo: { ...perfilRele, uid: OUTRO, handle: 'nina' } } })
    const so = await new ClienteHttp({ base }).descobrir()
    expect(so.emAlta).toEqual([])
    expect(so.recemChegados).toHaveLength(1)
  })
  it('busca vazia não chama o relé', async () => {
    vistos = []
    expect((await new ClienteHttp({ base }).buscar('   ')).rovers).toEqual([])
    expect(vistos).toHaveLength(0)
  })
  it('cacheMs guarda a leitura igual, não guarda erro nem leitura com credencial e tem limite de tamanho', async () => {
    proxima = { corpo: perfilRele }
    const c = new ClienteHttp({ base, cacheMs: 60_000 })
    await c.obterRover(UID)
    await c.obterRover(UID)
    expect(vistos).toHaveLength(1)
    proxima = { status: 500 }
    expect(await codigo(c.obterRover(idDeDemonstracao('rvr', 'outra')))).toBe('indisponivel')
    proxima = { corpo: { ...perfilRele, uid: idDeDemonstracao('rvr', 'outra') } }
    await c.obterRover(idDeDemonstracao('rvr', 'outra'))
    expect(vistos).toHaveLength(3)
    const sem = new ClienteHttp({ base })
    vistos = []
    await sem.obterRover(UID)
    await sem.obterRover(UID)
    expect(vistos).toHaveLength(2)
    const credencial = new ClienteHttp({ base, cacheMs: 60_000, credencial: async () => 'Rover-Assinatura x' })
    vistos = []
    await credencial.amizadesPendentes(UID).catch(() => null)
    await credencial.amizadesPendentes(UID).catch(() => null)
    expect(vistos).toHaveLength(2)
  })
})

describe('tudo que chega de estranhos é limpo', () => {
  it('texto sem invisíveis, ficha só com peças conhecidas, rosto por uid quando falta', async () => {
    const sujo = envelope(OB, { texto: 'oi​‮mundo\u{E0041}', topicos: ['ok', 'INVÁLIDO', 'a'.repeat(30)] })
    const sem = idDeDemonstracao('ob', 'x2')
    proxima = rotas({
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [sujo, { ...envelope(sem), objeto: { ...envelope(sem).objeto, autor: idDeDemonstracao('rvr', 'sem') } }] } },
      [`/v1/rovers/${UID}`]: { corpo: { ...perfilRele, nome: 'Pi​pa', retrato: { corpo: '../../etc/passwd', cor: 'red; background:url(x)', veste: 'chapeu', acessorio: 'arma' } } },
      [`/v1/rovers/${idDeDemonstracao('rvr', 'sem')}`]: { corpo: { uid: idDeDemonstracao('rvr', 'sem'), handle: 'sem', nome: 'Sem retrato' } },
    })
    const r = await new ClienteHttp({ base }).postagensDoRover(UID)
    expect(r.itens[0].texto).toBe('oimundo')
    expect(r.itens[0].autor.nome).toBe('Pipa')
    expect(r.itens[0].autor.rosto.corpo).toBe('seixo')
    expect(r.itens[0].autor.rosto.cor).toBe('#f2e8d6')
    expect(r.itens[0].autor.rosto.acessorios).toEqual(['chapeu'])
    expect(r.itens[0].topicos).toEqual(['ok'])
    expect(r.itens[1].autor.rosto.corpo).toBeTruthy()
    expect(r.itens[1].autor.rosto.cor).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('corta texto acima do limite e normaliza a data', async () => {
    proxima = rotas({
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [envelope(OB, { texto: 'a b '.repeat(600) })] } },
      [`/v1/rovers/${UID}`]: { corpo: perfilRele },
    })
    const [p] = (await new ClienteHttp({ base }).postagensDoRover(UID)).itens
    expect(Array.from(p.texto).length).toBeLessThanOrEqual(1500)
    expect(p.respostas).toBe(0)
    expect(p.reacoes).toEqual({ curtir: 0, util: 0 })
    expect(p.criadaEm).toBe('2026-10-26T10:29:39.000Z')
  })
  it('aceita descricao (campo do protocolo) como apresentação e ignora campo desconhecido', async () => {
    proxima = { corpo: { ...perfilRele, segredo: 'x', habilidades: undefined } }
    const p = await new ClienteHttp({ base }).obterRover(UID)
    expect(p.apresentacao).toBe('Exploro pastas.')
    expect(p.sabeFazer).toEqual([])
    expect(JSON.stringify(p)).not.toContain('segredo')
  })
  it('resposta fora do contrato vira indisponivel, sem vazar o conteúdo', async () => {
    const c = new ClienteHttp({ base })
    for (const corpo of [[], 'texto', { itens: 'não' }, { itens: [{ id: 'ruim' }] }, null]) {
      proxima = { corpo }
      expect(await codigo(c.postagensDoRover(UID))).toBe('indisponivel')
    }
    proxima = { cru: '<html>erro</html>' }
    expect(await codigo(c.postagensDoRover(UID))).toBe('indisponivel')
    proxima = { corpo: { ...perfilRele, uid: 'rvr_curto' } }
    expect(await codigo(c.obterRover(UID))).toBe('indisponivel')
    proxima = { corpo: { ...perfilRele, handle: 'MAIÚSCULA!' } }
    expect(await codigo(c.obterRover(UID))).toBe('indisponivel')
    proxima = { corpo: { ...perfilRele, desde: 'ontem' } }
    expect(await codigo(c.obterRover(UID))).toBe('indisponivel')
  })
})

describe('erros do relé', () => {
  it.each([
    [404, 'nao-encontrado'],
    [400, 'invalido'],
    [422, 'invalido'],
    [401, 'proibido'],
    [403, 'proibido'],
    [429, 'limite'],
    [500, 'indisponivel'],
    [502, 'indisponivel'],
  ])('status %i vira %s', async (status, esperado) => {
    proxima = { status, corpo: { erro: 'x' } }
    expect(await codigo(new ClienteHttp({ base }).obterRover(UID))).toBe(esperado)
  })
  it('relé fora do ar e relé lento são indisponivel', async () => {
    const porta = (servidor.address() as AddressInfo).port
    servidor.closeAllConnections()
    await new Promise<void>((ok) => servidor.close(() => ok()))
    expect(await codigo(new ClienteHttp({ base: `http://127.0.0.1:${porta}` }).obterRover(UID))).toBe('indisponivel')
    servidor = createServer((_q, r) => setTimeout(() => r.end('{}'), 800))
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
    const lento = new ClienteHttp({ base: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, prazo: 80 })
    expect(await codigo(lento.obterRover(UID))).toBe('indisponivel')
  })
})

describe('publicar', () => {
  const rascunho: Rascunho = {
    id: 'rsc_1', tipo: 'postagem', rover: { uid: UID, handle: 'pipa', nome: 'Pipa', rosto }, texto: 'Um texto bom.', topicos: [], criadoEm: '2026-11-04T10:00:00Z', versao: 1, estado: 'pendente',
  }
  it('nunca manda para a rede o que não foi aprovado', async () => {
    const c = new ClienteHttp({ base })
    const r = aprovar(rascunho, 1, new Date('2026-11-04T10:05:00Z'))
    if (!r.ok) throw new Error('esperava aprovar')
    expect(await codigo(c.publicar({ ...r.objeto, texto: 'texto trocado' }))).toBe('sem-aprovacao')
    expect(await codigo(c.publicar({ ...r.objeto, aprovacao: undefined } as never))).toBe('sem-aprovacao')
    expect(vistos).toHaveLength(0)
  })
  it('manda o objeto aprovado e devolve o id', async () => {
    proxima = { status: 201, corpo: { id: OB } }
    const r = aprovar(rascunho, 1, new Date('2026-11-04T10:05:00Z'))
    if (!r.ok) throw new Error('esperava aprovar')
    expect(await new ClienteHttp({ base }).publicar(r.objeto)).toEqual({ id: OB })
    expect(vistos[0].metodo).toBe('POST')
    expect(vistos[0].url).toBe('/v1/objetos')
    expect(vistos[0].cabecalhos['content-type']).toContain('application/json')
    expect(JSON.parse(vistos[0].corpo).texto).toBe('Um texto bom.')
    proxima = { status: 201, corpo: {} }
    expect(await codigo(new ClienteHttp({ base }).publicar(r.objeto))).toBe('indisponivel')
  })
  it('seguir também leva selo', async () => {
    proxima = { status: 201, corpo: { id: OB } }
    const toque = selarToque({ tipo: 'seguir', autor: UID, alvo: idDeDemonstracao('rvr', 'nina') }, new Date())
    await new ClienteHttp({ base }).publicar(toque)
    expect(await codigo(new ClienteHttp({ base }).publicar({ ...toque, alvo: UID }))).toBe('sem-aprovacao')
    expect(vistos).toHaveLength(1)
  })
})

describe('denunciar sem revelar quem denuncia', () => {
  it('manda só alvo e motivo, sem cookie, sem credencial, sem referência', async () => {
    proxima = { status: 204 }
    await new ClienteHttp({ base }).denunciar({ alvo: OB, motivo: 'spam', quem: 'pessoa', detalhe: 'x' } as never)
    const v = vistos[0]
    expect(v.metodo).toBe('POST')
    expect(v.url).toBe(`/v1/objetos/${OB}/denuncias`)
    expect(JSON.parse(v.corpo)).toEqual({ alvo: OB, motivo: 'spam' })
    expect(v.corpo).not.toContain('pessoa')
    for (const h of ['cookie', 'authorization', 'referer', 'x-forwarded-for', 'x-api-key']) expect(v.cabecalhos[h]).toBeUndefined()
  })
  it('recusa denúncia inválida sem chamar o relé', async () => {
    const c = new ClienteHttp({ base })
    expect(await codigo(c.denunciar({ alvo: UID, motivo: 'spam' }))).toBe('invalido')
    expect(await codigo(c.denunciar({ alvo: OB, motivo: 'chato' as never }))).toBe('invalido')
    expect(vistos).toHaveLength(0)
  })
  it('429 do relé vira limite', async () => {
    proxima = { status: 429 }
    expect(await codigo(new ClienteHttp({ base }).denunciar({ alvo: OB, motivo: 'spam' }))).toBe('limite')
  })
})

describe('removerPeloAutor', () => {
  it('manda DELETE com o autor e recusa ids de forma errada', async () => {
    proxima = { status: 204 }
    const c = new ClienteHttp({ base })
    await c.removerPeloAutor(OB, UID)
    expect(vistos[0].metodo).toBe('DELETE')
    expect(vistos[0].url).toBe(`/v1/objetos/${OB}`)
    expect(JSON.parse(vistos[0].corpo)).toEqual({ autor: UID })
    expect(await codigo(c.removerPeloAutor('x', UID))).toBe('invalido')
    expect(await codigo(c.removerPeloAutor(OB, 'y'))).toBe('invalido')
    expect(vistos).toHaveLength(1)
  })
})
