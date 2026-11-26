import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { demoId } from '@/lib/domain/ids'
import { NetworkError } from '@/lib/types'

// Revision 0.3.1 (proposal 0006) seen by the site's HTTP client: it uses what the relay declares in `recursos` and, on a 0.3 relay, falls back to
// the earlier workarounds (without asking for `completo`, counts zeroed). A fake server gives the answers and records what was asked.

type Reply = { status?: number; corpo?: unknown }
let server: Server
let base = ''
let seen: { metodo: string; url: string; cabecalhos: IncomingMessage['headers'] }[] = []
let respond: (url: string) => Reply = () => ({})

const UID = demoId('rvr', 'pipa')
const OTHER = demoId('rvr', 'lumi')
const POST = demoId('ob', 'post1')
const RESP = demoId('ob', 'resp1')

beforeEach(async () => {
  seen = []
  respond = () => ({})
  server = createServer((req, res) => {
    seen.push({ metodo: req.method ?? '', url: req.url ?? '', cabecalhos: req.headers })
    const r = respond(req.url ?? '')
    res.statusCode = r.status ?? 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(r.corpo ?? {}))
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((ok) => server.close(() => ok()))
})

const summary = (uid: string, handle: string, name: string) => ({ uid, handle, nome: name, retrato: null })
const envelope = (id: string, type: 'postagem' | 'resposta', author: string, text: string, extra: Record<string, unknown> = {}) => ({
  objeto: { id, tipo: type, autor: author, criadoEm: 1_900_000_000, corpo: { texto: text, topicos: [], ...extra } },
})
const profile = { uid: UID, handle: 'pipa', nome: 'Pipa', descricao: '', emissor: 'x', grafo: 'publico', seguindo: 0, seguidores: 0, desde: 1_900_000_000 }
const item = (id: string, text: string) => ({
  envelope: envelope(id, 'postagem', UID, text),
  autor: summary(UID, 'pipa', 'Pipa'),
  contagens: { respostas: 2, reacoes: { curtir: 3, util: 1 } },
  minhaReacao: 'curtir',
  pagina: null,
  tipo: 'postagem',
})

describe('info: the relay\'s resources', () => {
  it('reads `recursos`, discards what is not a resource name and treats a 0.3 relay as "none"', async () => {
    respond = () => ({ corpo: { protocolo: ['0.3'], social: true, recursos: ['lista-completa', 'Nome Errado', 7, 'postagem-detalhe', '<script>'] } })
    const info = await new HttpClient({ base }).info()
    expect(info.recursos).toEqual(['lista-completa', 'postagem-detalhe'])
    respond = () => ({ corpo: { protocolo: ['0.3'], social: true } })
    expect((await new HttpClient({ base }).info()).recursos).toEqual([])
    respond = () => ({ corpo: { protocolo: ['0.3'], social: true, recursos: 'tudo' } })
    expect((await new HttpClient({ base }).info()).recursos).toEqual([])
  })
})

describe('a rover\'s posts', () => {
  it('relay 0.3.1: asks for the full list, uses the real counts and the author that already comes along (without a profile call per item)', async () => {
    respond = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['lista-completa'] } }
      if (url.startsWith(`/v1/rovers/${UID}/postagens`)) return { corpo: { itens: [item(POST, 'uma postagem')], proximo: null } }
      return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
    }
    const p = await new HttpClient({ base }).roverPosts(UID)
    expect(p.itens).toHaveLength(1)
    expect(p.itens[0]).toMatchObject({ id: POST, texto: 'uma postagem', respostas: 2, reacoes: { curtir: 3, util: 1 }, minhaReacao: 'curtir' })
    expect(p.itens[0]!.autor.handle).toBe('pipa')
    const requests = seen.map((v) => v.url)
    expect(requests.some((u) => u.includes('completo=1'))).toBe(true)
    expect(requests.some((u) => u === `/v1/rovers/${UID}`)).toBe(false)
  })

  it('relay 0.3: does not ask for `completo`, reads each author\'s profile and the counts come zeroed (the relay does not serve them)', async () => {
    respond = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true } }
      if (url.startsWith(`/v1/rovers/${UID}/postagens`)) return { corpo: { itens: [envelope(POST, 'postagem', UID, 'uma postagem')], proximo: null } }
      if (url === `/v1/rovers/${UID}`) return { corpo: profile }
      return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
    }
    const p = await new HttpClient({ base }).roverPosts(UID)
    expect(p.itens[0]).toMatchObject({ id: POST, respostas: 0, reacoes: { curtir: 0, util: 0 } })
    expect(seen.some((v) => v.url.includes('completo'))).toBe(false)
  })

  it('info being down counts as "relay 0.3": the earlier list, and not an error', async () => {
    respond = (url) => {
      if (url === '/v1/info') return { status: 500, corpo: {} }
      if (url.startsWith(`/v1/rovers/${UID}/postagens`)) return { corpo: { itens: [envelope(POST, 'postagem', UID, 'x')], proximo: null } }
      if (url === `/v1/rovers/${UID}`) return { corpo: profile }
      return { status: 404, corpo: {} }
    }
    const p = await new HttpClient({ base }).roverPosts(UID)
    expect(p.itens).toHaveLength(1)
    expect(seen.some((v) => v.url.includes('completo'))).toBe(false)
  })

  it('an item outside the contract brings the page down: the site does not show what it does not understand', async () => {
    respond = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['lista-completa'] } }
      return { corpo: { itens: [{ envelope: { objeto: { id: POST, tipo: 'recado' } }, autor: summary(UID, 'pipa', 'Pipa') }], proximo: null } }
    }
    await expect(new HttpClient({ base }).roverPosts(UID)).rejects.toBeInstanceOf(NetworkError)
  })
})

describe('detail of a post', () => {
  it('relay 0.3.1: the post with the real counts and the replies listed', async () => {
    respond = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['postagem-detalhe'] } }
      if (url === `/v1/postagens/${POST}`) return { corpo: { envelope: envelope(POST, 'postagem', UID, 'a postagem'), autor: summary(UID, 'pipa', 'Pipa'), contagens: { respostas: 1, reacoes: { curtir: 0, util: 0 } }, minhaReacao: null } }
      if (url.startsWith(`/v1/postagens/${POST}/respostas`)) {
        return { corpo: { itens: [{ envelope: envelope(RESP, 'resposta', OTHER, 'a resposta', { alvo: POST }), autor: summary(OTHER, 'lumi', 'Lumi'), contagens: { respostas: 0, reacoes: { curtir: 1, util: 0 } }, minhaReacao: null }], proximo: null } }
      }
      return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
    }
    const d = await new HttpClient({ base }).getObject(POST)
    expect(d.postagem).toMatchObject({ id: POST, respostas: 1 })
    expect(d.respostas).toHaveLength(1)
    expect(d.respostas[0]).toMatchObject({ id: RESP, texto: 'a resposta', reacoes: { curtir: 1, util: 0 }, respondeA: POST })
  })

  it('an id that is not a post\'s (0.3.1 answers 404): falls back to the earlier path, which reads the object and the parent', async () => {
    respond = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['postagem-detalhe'] } }
      if (url === `/v1/postagens/${RESP}`) return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
      if (url === `/v1/objetos/${RESP}`) return { corpo: envelope(RESP, 'resposta', OTHER, 'uma resposta', { alvo: POST }) }
      if (url === `/v1/objetos/${POST}`) return { corpo: envelope(POST, 'postagem', UID, 'o pai') }
      if (url === `/v1/rovers/${OTHER}`) return { corpo: { ...profile, uid: OTHER, handle: 'lumi', nome: 'Lumi' } }
      if (url === `/v1/rovers/${UID}`) return { corpo: profile }
      return { status: 404, corpo: {} }
    }
    const d = await new HttpClient({ base }).getObject(RESP)
    expect(d.postagem.id).toBe(RESP)
    expect(d.pai?.id).toBe(POST)
    expect(d.respostas).toEqual([])
  })

  it('removed (410) is not hidden as "not found": the relay\'s error reaches the screen', async () => {
    respond = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['postagem-detalhe'] } }
      return { status: 410, corpo: { erro: { codigo: 'removido' } } }
    }
    const e = await new HttpClient({ base }).getObject(POST).catch((x) => x)
    expect(e).toBeInstanceOf(NetworkError)
    expect((e as NetworkError).codigo).not.toBe('nao-encontrado')
  })
})

describe('notices with names', () => {
  const notice = (extra: Record<string, unknown>) => ({ seq: 7, tipo: 'resposta-no-topico', em: 1_900_000_000, origem: null, objeto: RESP, comunidade: null, pagina: null, ...extra })

  it('lugar and topico become placeName and topicName, sanitized; without them (relay 0.3) they stay null', async () => {
    const credential = async () => 'Rover-Assinatura x'
    respond = (url) => {
      if (url.includes('/notificacoes')) {
        return { corpo: { itens: [
          notice({ lugar: { tipo: 'comunidade', id: POST, nome: 'Mesa <b>dos</b> Tradutores' }, topico: { id: POST, titulo: 'Nomes de backup' } }),
          notice({ seq: 6 }),
          notice({ seq: 5, lugar: { tipo: 'comunidade', id: POST, nome: '   ' }, topico: { id: POST, titulo: 42 } }),
        ], proximo: null } }
      }
      return { status: 404, corpo: {} }
    }
    const p = await new HttpClient({ base, credencial: credential }).notificacoes(UID)
    expect(p.itens[0]).toMatchObject({ nomeDoLugar: 'Mesa bdos/b Tradutores', nomeDoTopico: 'Nomes de backup' })
    expect(p.itens[1]).toMatchObject({ nomeDoLugar: null, nomeDoTopico: null })
    expect(p.itens[2]).toMatchObject({ nomeDoLugar: null, nomeDoTopico: null })
  })
})
