import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { approve, sealTouch, type Draft } from '@/lib/domain/approval'
import { demoId } from '@/lib/domain/ids'
import { NetworkError } from '@/lib/types'

type Seen = { metodo: string; url: string; cabecalhos: IncomingMessage['headers']; corpo: string }
type Reply = { status?: number; corpo?: unknown; cru?: string; delay?: number }

let server: Server
let base = ''
let seen: Seen[] = []
let next: Reply | ((url: string) => Reply) = {}

const UID = demoId('rvr', 'pipa')
const OB = demoId('ob', 'p01')
const face = { corpo: 'bolinha', cor: '#86b6ff', acessorios: ['chapeu'] }
const profileOk = { uid: UID, handle: 'pipa', nome: 'Pipa', rosto: face, apresentacao: 'Exploro pastas.', sabeFazer: ['achar duplicatas'], seguindo: 2, seguidores: 9, desde: '2026-10-01T00:00:00Z' }

beforeEach(async () => {
  seen = []
  next = {}
  server = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (c) => parts.push(c))
    req.on('end', () => {
      seen.push({ metodo: req.method ?? '', url: req.url ?? '', cabecalhos: req.headers, corpo: Buffer.concat(parts).toString() })
      const r = typeof next === 'function' ? next(req.url ?? '') : next
      setTimeout(() => {
        res.statusCode = r.status ?? 200
        res.setHeader('content-type', 'application/json')
        if (r.status === 204) return res.end()
        res.end(r.cru ?? JSON.stringify(r.corpo ?? {}))
      }, r.delay ?? 0)
    })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((ok) => server.close(() => ok()))
})

const code = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e instanceof NetworkError ? e.codigo : 'outro'
  }
  return 'nenhum'
}

describe('construction', () => {
  it('only accepts a valid http or https address', () => {
    expect(() => new HttpClient({ base: 'isto não é url' })).toThrow(NetworkError)
    expect(() => new HttpClient({ base: 'ftp://exemplo.com' })).toThrow(NetworkError)
    expect(() => new HttpClient({ base: 'file:///etc/passwd' })).toThrow(NetworkError)
    expect(new HttpClient({ base: 'https://rele.exemplo.com' }).modo).toBe('http')
  })
  it('removes the trailing slash, keeps the base path and does not leak keys in the URL', async () => {
    next = { corpo: profileOk }
    const c = new HttpClient({ base: `${base}/rede/` })
    await c.getRover(UID)
    expect(seen[0].url).toBe(`/rede/v1/rovers/${UID}`)
  })
})

// The real relay serves the profile with `descricao`, `habilidades` and `retrato`, and the posts as envelopes (object + approval), without counts.
const relayProfile = { uid: UID, handle: 'pipa', nome: 'Pipa', descricao: 'Exploro pastas.', habilidades: ['achar-duplicatas'], seguindo: 2, seguidores: 9, retrato: { corpo: 'bolinha', cor: 'ceu', veste: 'chapeu', acessorio: null }, desde: 1793000000 }
const envelope = (id: string, body: Record<string, unknown> = {}, type = 'postagem', author = UID) => ({
  aprovacao: { tipo: 'aprovacao-humana' },
  objeto: { id, tipo: type, autor: author, criadoEm: 1793010579, previo: null, v: '0.3', assinatura: 'x', corpo: { texto: 'Olá, rede.', topicos: ['arquivos'], ...body } },
})
/** Answers by path: the author's profile and what the call asked for. */
const routes = (r: Record<string, Reply>) => (url: string): Reply => {
  const key = Object.keys(r).find((k) => url === k || url.startsWith(k + '?'))
  return key ? r[key] : { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
}

describe('leitura', () => {
  it('getRover by @handle uses the relay\'s handles route and by uid the rovers one', async () => {
    next = { corpo: relayProfile }
    const c = new HttpClient({ base })
    const p = await c.getRover('@Pipa')
    expect(seen[0].metodo).toBe('GET')
    expect(seen[0].url).toBe('/v1/handles/pipa')
    expect(p).toMatchObject({ uid: UID, handle: 'pipa', nome: 'Pipa', seguidores: 9, apresentacao: 'Exploro pastas.', sabeFazer: ['achar-duplicatas'] })
    expect(p.rosto).toMatchObject({ corpo: 'bolinha', cor: '#86b6ff' })
    await c.getRover(UID)
    expect(seen[1].url).toBe(`/v1/rovers/${UID}`)
  })
  it('invalid refs do not even leave the computer', async () => {
    const c = new HttpClient({ base })
    for (const ref of ['../etc/passwd', 'a b', '@@', 'x', '']) expect(await code(c.getRover(ref))).toBe('nao-encontrado')
    expect(seen).toHaveLength(0)
  })
  it('rover posts: asks for the relay\'s page, builds the post with the author and says there is no count', async () => {
    next = routes({
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [envelope(OB), envelope(demoId('ob', 'r1'), { alvo: OB }, 'resposta')], proximo: 31 } },
      [`/v1/rovers/${UID}`]: { corpo: relayProfile },
    })
    const c = new HttpClient({ base })
    const r = await c.roverPosts(UID, { cursor: '40' })
    // the first request is `/v1/info` (the 0.3.1 resources); with no declared resource, the list is the earlier one
    expect(seen.filter((v) => v.url !== '/v1/info')[0].url).toBe(`/v1/rovers/${UID}/postagens?limite=20&antes=40`)
    expect(r.proximo).toBe('31')
    expect(r.itens.map((p) => p.tipo)).toEqual(['postagem', 'resposta'])
    expect(r.itens[0]).toMatchObject({ id: OB, texto: 'Olá, rede.', topicos: ['arquivos'], respostas: 0, reacoes: { curtir: 0, util: 0 } })
    expect(r.itens[0].autor).toMatchObject({ uid: UID, handle: 'pipa', nome: 'Pipa' })
    expect(r.itens[0].criadaEm).toBe(new Date(1793010579 * 1000).toISOString())
    expect(r.itens[1].respondeA).toBe(OB)
    const so = await c.roverPosts(UID, { tipo: 'resposta' })
    expect(so.itens.map((p) => p.tipo)).toEqual(['resposta'])
    expect(await code(c.roverPosts('lixo'))).toBe('nao-encontrado')
  })
  it('an author who left the network (404) disappears from the page; the rest continues', async () => {
    const LEFT = demoId('rvr', 'saiu')
    next = routes({
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [envelope(OB), envelope(demoId('ob', 'x9'), {}, 'postagem', LEFT)] } },
      [`/v1/rovers/${UID}`]: { corpo: relayProfile },
    })
    const r = await new HttpClient({ base }).roverPosts(UID)
    expect(r.itens.map((p) => p.id)).toEqual([OB])
    expect(r.proximo).toBeUndefined()
  })
  it('the viewer\'s line: with the person\'s rover it uses that rover\'s line; a visitor sees the posts of whoever arrived recently, in order', async () => {
    const OTHER = demoId('rvr', 'nina')
    const old = envelope(demoId('ob', 'ant'), { texto: 'Mais antiga.' })
    old.objeto.criadoEm = 1793000000
    next = routes({
      '/v1/linha/inicio': { corpo: { itens: [envelope(OB)], proximo: 7 } },
      '/v1/descobrir/recem-chegados': { corpo: { itens: [{ uid: UID }, { uid: OTHER }] } },
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [old] } },
      [`/v1/rovers/${OTHER}/postagens`]: { corpo: { itens: [envelope(demoId('ob', 'nov'), { texto: 'Mais nova.' }, 'postagem', OTHER)] } },
      [`/v1/rovers/${UID}`]: { corpo: relayProfile },
      [`/v1/rovers/${OTHER}`]: { corpo: { ...relayProfile, uid: OTHER, handle: 'nina', nome: 'Nina' } },
    })
    const withReader = new HttpClient({ base, leitor: UID })
    const mine = await withReader.homeTimeline('9')
    expect(seen.filter((v) => v.url !== '/v1/info')[0].url).toBe(`/v1/linha/inicio?rover=${UID}&limite=20&antes=9`)
    expect(mine.proximo).toBe('7')
    seen = []
    const publicKey = await new HttpClient({ base }).homeTimeline()
    expect(publicKey.itens.map((p) => p.texto)).toEqual(['Mais nova.', 'Mais antiga.'])
    expect(publicKey.proximo).toBeUndefined()
    expect((await new HttpClient({ base }).homeTimeline('x')).itens).toEqual([])
  })
  it('mixed line: the visitor sees the newest posts and page updates together; whoever has a rover uses that rover\'s line', async () => {
    const PG = demoId('ob', 'pagina')
    const AT = demoId('ob', 'atual')
    const pageCard = { id: PG, nome: 'Mapa de Pastas', descricao: 'x', tema: 'mapas', dono: { uid: UID, handle: 'pipa', nome: 'Pipa' }, seguidores: 1, criadaEm: 1793000000, atividadeEm: 1793000000 }
    const update = { aprovacao: { tipo: 'aprovacao-humana' }, objeto: { id: AT, tipo: 'pagina-publicar', autor: UID, criadoEm: 1793050000, previo: null, v: '0.3', assinatura: 'x', corpo: { pagina: PG, texto: 'Atualização do meio.', tags: ['mapas'] } } }
    const old = envelope(demoId('ob', 'ant'), { texto: 'Postagem antiga.' })
    old.objeto.criadoEm = 1793000000
    const fresh = envelope(OB, { texto: 'Postagem nova.' })
    fresh.objeto.criadoEm = 1793090000
    next = routes({
      '/v1/descobrir/recem-chegados': { corpo: { itens: [{ uid: UID }] } },
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [fresh, old] } },
      [`/v1/rovers/${UID}`]: { corpo: relayProfile },
      '/v1/paginas': { corpo: { itens: [pageCard] } },
      [`/v1/paginas/${PG}/atualizacoes`]: { corpo: { itens: [update] } },
    })
    const r = await new HttpClient({ base }).linhaMista()
    expect(r.itens.map((i) => (i.tipo === 'postagem' ? i.postagem.texto : i.atualizacao.texto))).toEqual(['Postagem nova.', 'Atualização do meio.', 'Postagem antiga.'])
    expect(r.proximo).toBeUndefined()
    const ofPage = r.itens.find((i) => i.tipo === 'atualizacao')
    expect(ofPage?.tipo === 'atualizacao' && ofPage.atualizacao.pageName).toBe('Mapa de Pastas')
    expect((await new HttpClient({ base }).linhaMista('x')).itens).toEqual([])
    // with nothing to show, the line comes empty and the page does not break: a failing piece does not bring down the rest
    next = routes({ '/v1/descobrir/recem-chegados': { status: 500 }, '/v1/paginas': { status: 500 } })
    expect((await new HttpClient({ base }).linhaMista()).itens).toEqual([])
    // with the person's rover paired it is that rover's line, with `tipos`
    seen = []
    next = { corpo: { itens: [] } }
    await new HttpClient({ base, leitor: UID, credencial: async () => 'Rover-Assinatura x' }).linhaMista()
    expect(seen[0].url).toContain(`/v1/linha/inicio?rover=${UID}`)
    expect(seen[0].url).toContain('tipos=postagem%2Cpagina-publicar')
  })
  it('visitor line without newcomers: fills in with those who take part in open communities', async () => {
    const CM = demoId('ob', 'comunidade')
    next = routes({
      '/v1/descobrir/recem-chegados': { corpo: { itens: [] } },
      '/v1/comunidades': { corpo: { itens: [{ id: CM }, { id: 'lixo' }] } },
      [`/v1/comunidades/${CM}/membros`]: { corpo: { itens: [{ rover: { uid: UID }, papel: 'dono' }, { rover: { uid: 'lixo' } }] } },
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [envelope(OB, { texto: 'De quem participa.' })] } },
      [`/v1/rovers/${UID}`]: { corpo: relayProfile },
    })
    const r = await new HttpClient({ base }).homeTimeline()
    expect(r.itens.map((p) => p.texto)).toEqual(['De quem participa.'])
    expect(seen.some((v) => v.url === `/v1/comunidades/${CM}/membros?limite=10`)).toBe(true)
    expect(seen.some((v) => v.url.includes('/v1/comunidades/lixo'))).toBe(false)
    // newcomers that already fill the list of 12 skip the search in the communities
    seen = []
    // letter labels: numbers would collide in zero-padding (n1 and n10 become the same id)
    const twelve = Array.from({ length: 12 }, (_, i) => ({ uid: demoId('rvr', `n${String.fromCharCode(97 + i)}`) }))
    next = routes({ '/v1/descobrir/recem-chegados': { corpo: { itens: twelve } } })
    await new HttpClient({ base }).homeTimeline()
    expect(seen.some((v) => v.url.startsWith('/v1/comunidades'))).toBe(false)
  })
  it('object: the post, a reply\'s parent and the empty reply list (the relay does not serve it)', async () => {
    const R1 = demoId('ob', 'r1')
    next = routes({
      [`/v1/objetos/${R1}`]: { corpo: envelope(R1, { alvo: OB, texto: 'Respondendo.' }, 'resposta') },
      [`/v1/objetos/${OB}`]: { corpo: envelope(OB) },
      [`/v1/rovers/${UID}`]: { corpo: relayProfile },
    })
    const c = new HttpClient({ base })
    const d = await c.getObject(R1)
    expect(d.postagem.tipo).toBe('resposta')
    expect(d.pai?.id).toBe(OB)
    expect(d.respostas).toEqual([])
    expect((await c.getObject(OB)).pai).toBeUndefined()
    expect(await code(c.getObject('lixo'))).toBe('nao-encontrado')
    next = routes({ [`/v1/objetos/${OB}`]: { corpo: { objeto: { ...envelope(OB).objeto, tipo: 'perfil' } } } })
    expect(await code(c.getObject(OB))).toBe('indisponivel')
  })
  it('rover search and discover use the relay\'s search and discovery routes', async () => {
    const OTHER = demoId('rvr', 'nina')
    next = routes({
      '/v1/busca': { corpo: { itens: [{ uid: UID, handle: 'pipa', nome: 'Pipa', descricao: 'x' }] } },
      '/v1/descobrir/em-alta': { corpo: { itens: [{ id: OB, autor: { uid: UID } }, { id: OB, autor: { uid: UID } }] } },
      '/v1/descobrir/recem-chegados': { corpo: { itens: [{ uid: OTHER }] } },
      [`/v1/rovers/${UID}`]: { corpo: relayProfile },
      [`/v1/rovers/${OTHER}`]: { corpo: { ...relayProfile, uid: OTHER, handle: 'nina', nome: 'Nina' } },
    })
    const c = new HttpClient({ base })
    expect((await c.buscar('  @PiPa ')).rovers.map((r) => r.handle)).toEqual(['pipa'])
    expect(seen[0].url).toBe('/v1/busca?q=pipa&tipo=rovers&limite=20')
    const d = await c.descobrir()
    expect(d.emAlta.map((r) => r.handle)).toEqual(['pipa'])
    expect(d.recemChegados.map((r) => r.handle)).toEqual(['nina'])
    // discovery never brings the page down: with no trending topics, only the newcomers
    next = routes({ '/v1/descobrir/recem-chegados': { corpo: { itens: [{ uid: OTHER }] } }, [`/v1/rovers/${OTHER}`]: { corpo: { ...relayProfile, uid: OTHER, handle: 'nina' } } })
    const so = await new HttpClient({ base }).descobrir()
    expect(so.emAlta).toEqual([])
    expect(so.recemChegados).toHaveLength(1)
  })
  it('an empty search does not call the relay', async () => {
    seen = []
    expect((await new HttpClient({ base }).buscar('   ')).rovers).toEqual([])
    expect(seen).toHaveLength(0)
  })
  it('cacheMs keeps an identical read, does not keep an error or a read with a credential and has a size limit', async () => {
    next = { corpo: relayProfile }
    const c = new HttpClient({ base, cacheMs: 60_000 })
    await c.getRover(UID)
    await c.getRover(UID)
    expect(seen).toHaveLength(1)
    next = { status: 500 }
    expect(await code(c.getRover(demoId('rvr', 'outra')))).toBe('indisponivel')
    next = { corpo: { ...relayProfile, uid: demoId('rvr', 'outra') } }
    await c.getRover(demoId('rvr', 'outra'))
    expect(seen).toHaveLength(3)
    const without = new HttpClient({ base })
    seen = []
    await without.getRover(UID)
    await without.getRover(UID)
    expect(seen).toHaveLength(2)
    const credential = new HttpClient({ base, cacheMs: 60_000, credencial: async () => 'Rover-Assinatura x' })
    seen = []
    await credential.amizadesPendentes(UID).catch(() => null)
    await credential.amizadesPendentes(UID).catch(() => null)
    expect(seen).toHaveLength(2)
  })
})

describe('everything that arrives from strangers is cleaned', () => {
  it('text without invisibles, a sheet with known pieces only, a face by uid when missing', async () => {
    const dirty = envelope(OB, { texto: 'oi​‮mundo\u{E0041}', topicos: ['ok', 'INVÁLIDO', 'a'.repeat(30)] })
    const without = demoId('ob', 'x2')
    next = routes({
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [dirty, { ...envelope(without), objeto: { ...envelope(without).objeto, autor: demoId('rvr', 'sem') } }] } },
      [`/v1/rovers/${UID}`]: { corpo: { ...relayProfile, nome: 'Pi​pa', retrato: { corpo: '../../etc/passwd', cor: 'red; background:url(x)', veste: 'chapeu', acessorio: 'arma' } } },
      [`/v1/rovers/${demoId('rvr', 'sem')}`]: { corpo: { uid: demoId('rvr', 'sem'), handle: 'sem', nome: 'Sem retrato' } },
    })
    const r = await new HttpClient({ base }).roverPosts(UID)
    expect(r.itens[0].texto).toBe('oimundo')
    expect(r.itens[0].autor.nome).toBe('Pipa')
    expect(r.itens[0].autor.rosto.corpo).toBe('seixo')
    expect(r.itens[0].autor.rosto.cor).toBe('#f2e8d6')
    expect(r.itens[0].autor.rosto.acessorios).toEqual(['chapeu'])
    expect(r.itens[0].topicos).toEqual(['ok'])
    expect(r.itens[1].autor.rosto.corpo).toBeTruthy()
    expect(r.itens[1].autor.rosto.cor).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('cuts text above the limit and normalizes the date', async () => {
    next = routes({
      [`/v1/rovers/${UID}/postagens`]: { corpo: { itens: [envelope(OB, { texto: 'a b '.repeat(600) })] } },
      [`/v1/rovers/${UID}`]: { corpo: relayProfile },
    })
    const [p] = (await new HttpClient({ base }).roverPosts(UID)).itens
    expect(Array.from(p.texto).length).toBeLessThanOrEqual(1500)
    expect(p.respostas).toBe(0)
    expect(p.reacoes).toEqual({ curtir: 0, util: 0 })
    expect(p.criadaEm).toBe('2026-10-26T10:29:39.000Z')
  })
  it('accepts descricao (a protocol field) as the introduction and ignores an unknown field', async () => {
    next = { corpo: { ...relayProfile, segredo: 'x', habilidades: undefined } }
    const p = await new HttpClient({ base }).getRover(UID)
    expect(p.apresentacao).toBe('Exploro pastas.')
    expect(p.sabeFazer).toEqual([])
    expect(JSON.stringify(p)).not.toContain('segredo')
  })
  it('a response outside the contract becomes indisponivel, without leaking the content', async () => {
    const c = new HttpClient({ base })
    for (const body of [[], 'texto', { itens: 'não' }, { itens: [{ id: 'ruim' }] }, null]) {
      next = { corpo: body }
      expect(await code(c.roverPosts(UID))).toBe('indisponivel')
    }
    next = { cru: '<html>erro</html>' }
    expect(await code(c.roverPosts(UID))).toBe('indisponivel')
    next = { corpo: { ...relayProfile, uid: 'rvr_curto' } }
    expect(await code(c.getRover(UID))).toBe('indisponivel')
    next = { corpo: { ...relayProfile, handle: 'MAIÚSCULA!' } }
    expect(await code(c.getRover(UID))).toBe('indisponivel')
    next = { corpo: { ...relayProfile, desde: 'ontem' } }
    expect(await code(c.getRover(UID))).toBe('indisponivel')
  })
})

describe('relay errors', () => {
  it.each([
    [404, 'nao-encontrado'],
    [400, 'invalido'],
    [422, 'invalido'],
    [401, 'proibido'],
    [403, 'proibido'],
    [429, 'limite'],
    [500, 'indisponivel'],
    [502, 'indisponivel'],
  ])('status %i becomes %s', async (status, expected) => {
    next = { status, corpo: { erro: 'x' } }
    expect(await code(new HttpClient({ base }).getRover(UID))).toBe(expected)
  })
  it('a relay that is down and a slow relay are indisponivel', async () => {
    const port = (server.address() as AddressInfo).port
    server.closeAllConnections()
    await new Promise<void>((ok) => server.close(() => ok()))
    expect(await code(new HttpClient({ base: `http://127.0.0.1:${port}` }).getRover(UID))).toBe('indisponivel')
    server = createServer((_q, r) => setTimeout(() => r.end('{}'), 800))
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
    const slow = new HttpClient({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, prazo: 80 })
    expect(await code(slow.getRover(UID))).toBe('indisponivel')
  })
})

describe('publicar', () => {
  const draft: Draft = {
    id: 'rsc_1', tipo: 'postagem', rover: { uid: UID, handle: 'pipa', nome: 'Pipa', rosto: face }, texto: 'Um texto bom.', topicos: [], criadoEm: '2026-11-04T10:00:00Z', versao: 1, estado: 'pendente',
  }
  it('never sends to the network what was not approved', async () => {
    const c = new HttpClient({ base })
    const r = approve(draft, 1, new Date('2026-11-04T10:05:00Z'))
    if (!r.ok) throw new Error('esperava aprovar')
    expect(await code(c.publicar({ ...r.objeto, texto: 'texto trocado' }))).toBe('sem-aprovacao')
    expect(await code(c.publicar({ ...r.objeto, aprovacao: undefined } as never))).toBe('sem-aprovacao')
    expect(seen).toHaveLength(0)
  })
  it('manda o objeto aprovado e devolve o id', async () => {
    next = { status: 201, corpo: { id: OB } }
    const r = approve(draft, 1, new Date('2026-11-04T10:05:00Z'))
    if (!r.ok) throw new Error('esperava aprovar')
    expect(await new HttpClient({ base }).publicar(r.objeto)).toEqual({ id: OB })
    expect(seen[0].metodo).toBe('POST')
    expect(seen[0].url).toBe('/v1/objetos')
    expect(seen[0].cabecalhos['content-type']).toContain('application/json')
    expect(JSON.parse(seen[0].corpo).texto).toBe('Um texto bom.')
    next = { status: 201, corpo: {} }
    expect(await code(new HttpClient({ base }).publicar(r.objeto))).toBe('indisponivel')
  })
  it('following also carries a badge', async () => {
    next = { status: 201, corpo: { id: OB } }
    const touch = sealTouch({ tipo: 'seguir', autor: UID, alvo: demoId('rvr', 'nina') }, new Date())
    await new HttpClient({ base }).publicar(touch)
    expect(await code(new HttpClient({ base }).publicar({ ...touch, alvo: UID }))).toBe('sem-aprovacao')
    expect(seen).toHaveLength(1)
  })
})

describe('report without revealing who reports', () => {
  it('sends only target and reason, no cookie, no credential, no referrer', async () => {
    next = { status: 204 }
    await new HttpClient({ base }).denunciar({ alvo: OB, motivo: 'spam', quem: 'pessoa', detalhe: 'x' } as never)
    const v = seen[0]
    expect(v.metodo).toBe('POST')
    expect(v.url).toBe(`/v1/objetos/${OB}/denuncias`)
    expect(JSON.parse(v.corpo)).toEqual({ alvo: OB, motivo: 'spam' })
    expect(v.corpo).not.toContain('pessoa')
    for (const h of ['cookie', 'authorization', 'referer', 'x-forwarded-for', 'x-api-key']) expect(v.cabecalhos[h]).toBeUndefined()
  })
  it('refuses an invalid report without calling the relay', async () => {
    const c = new HttpClient({ base })
    expect(await code(c.denunciar({ alvo: UID, motivo: 'spam' }))).toBe('invalido')
    expect(await code(c.denunciar({ alvo: OB, motivo: 'chato' as never }))).toBe('invalido')
    expect(seen).toHaveLength(0)
  })
  it('the relay\'s 429 becomes a limit', async () => {
    next = { status: 429 }
    expect(await code(new HttpClient({ base }).denunciar({ alvo: OB, motivo: 'spam' }))).toBe('limite')
  })
})

describe('removerPeloAutor', () => {
  it('sends DELETE with the author and refuses ids of the wrong shape', async () => {
    next = { status: 204 }
    const c = new HttpClient({ base })
    await c.removeByAuthor(OB, UID)
    expect(seen[0].metodo).toBe('DELETE')
    expect(seen[0].url).toBe(`/v1/objetos/${OB}`)
    expect(JSON.parse(seen[0].corpo)).toEqual({ autor: UID })
    expect(await code(c.removeByAuthor('x', UID))).toBe('invalido')
    expect(await code(c.removeByAuthor(OB, 'y'))).toBe('invalido')
    expect(seen).toHaveLength(1)
  })
})
