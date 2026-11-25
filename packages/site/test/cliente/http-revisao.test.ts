import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClienteHttp } from '@/lib/cliente-http'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { ErroRede } from '@/lib/tipos'

// Revisão 0.3.1 (proposta 0006) vista pelo cliente HTTP do site: usa o que o relé declara em `recursos` e, num relé 0.3, cai nos
// contornos de antes (sem pedir `completo`, contagens zeradas). Um servidor de mentira diz as respostas e anota o que foi pedido.

type Resposta = { status?: number; corpo?: unknown }
let servidor: Server
let base = ''
let vistos: { metodo: string; url: string; cabecalhos: IncomingMessage['headers'] }[] = []
let responder: (url: string) => Resposta = () => ({})

const UID = idDeDemonstracao('rvr', 'pipa')
const OUTRO = idDeDemonstracao('rvr', 'lumi')
const POST = idDeDemonstracao('ob', 'post1')
const RESP = idDeDemonstracao('ob', 'resp1')

beforeEach(async () => {
  vistos = []
  responder = () => ({})
  servidor = createServer((req, res) => {
    vistos.push({ metodo: req.method ?? '', url: req.url ?? '', cabecalhos: req.headers })
    const r = responder(req.url ?? '')
    res.statusCode = r.status ?? 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(r.corpo ?? {}))
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
})
afterEach(async () => {
  servidor.closeAllConnections()
  await new Promise<void>((ok) => servidor.close(() => ok()))
})

const resumo = (uid: string, handle: string, nome: string) => ({ uid, handle, nome, retrato: null })
const envelope = (id: string, tipo: 'postagem' | 'resposta', autor: string, texto: string, extra: Record<string, unknown> = {}) => ({
  objeto: { id, tipo, autor, criadoEm: 1_900_000_000, corpo: { texto, topicos: [], ...extra } },
})
const perfil = { uid: UID, handle: 'pipa', nome: 'Pipa', descricao: '', emissor: 'x', grafo: 'publico', seguindo: 0, seguidores: 0, desde: 1_900_000_000 }
const item = (id: string, texto: string) => ({
  envelope: envelope(id, 'postagem', UID, texto),
  autor: resumo(UID, 'pipa', 'Pipa'),
  contagens: { respostas: 2, reacoes: { curtir: 3, util: 1 } },
  minhaReacao: 'curtir',
  pagina: null,
  tipo: 'postagem',
})

describe('info: os recursos do relé', () => {
  it('lê `recursos`, descarta o que não é nome de recurso e trata relé 0.3 como "nenhum"', async () => {
    responder = () => ({ corpo: { protocolo: ['0.3'], social: true, recursos: ['lista-completa', 'Nome Errado', 7, 'postagem-detalhe', '<script>'] } })
    const info = await new ClienteHttp({ base }).info()
    expect(info.recursos).toEqual(['lista-completa', 'postagem-detalhe'])
    responder = () => ({ corpo: { protocolo: ['0.3'], social: true } })
    expect((await new ClienteHttp({ base }).info()).recursos).toEqual([])
    responder = () => ({ corpo: { protocolo: ['0.3'], social: true, recursos: 'tudo' } })
    expect((await new ClienteHttp({ base }).info()).recursos).toEqual([])
  })
})

describe('postagens de um rover', () => {
  it('relé 0.3.1: pede a lista completa, usa as contagens reais e o autor que já vem junto (sem uma chamada de perfil por item)', async () => {
    responder = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['lista-completa'] } }
      if (url.startsWith(`/v1/rovers/${UID}/postagens`)) return { corpo: { itens: [item(POST, 'uma postagem')], proximo: null } }
      return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
    }
    const p = await new ClienteHttp({ base }).postagensDoRover(UID)
    expect(p.itens).toHaveLength(1)
    expect(p.itens[0]).toMatchObject({ id: POST, texto: 'uma postagem', respostas: 2, reacoes: { curtir: 3, util: 1 }, minhaReacao: 'curtir' })
    expect(p.itens[0]!.autor.handle).toBe('pipa')
    const pedidos = vistos.map((v) => v.url)
    expect(pedidos.some((u) => u.includes('completo=1'))).toBe(true)
    expect(pedidos.some((u) => u === `/v1/rovers/${UID}`)).toBe(false)
  })

  it('relé 0.3: não pede `completo`, lê o perfil de cada autor e as contagens vêm zeradas (o relé não as serve)', async () => {
    responder = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true } }
      if (url.startsWith(`/v1/rovers/${UID}/postagens`)) return { corpo: { itens: [envelope(POST, 'postagem', UID, 'uma postagem')], proximo: null } }
      if (url === `/v1/rovers/${UID}`) return { corpo: perfil }
      return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
    }
    const p = await new ClienteHttp({ base }).postagensDoRover(UID)
    expect(p.itens[0]).toMatchObject({ id: POST, respostas: 0, reacoes: { curtir: 0, util: 0 } })
    expect(vistos.some((v) => v.url.includes('completo'))).toBe(false)
  })

  it('o info fora do ar vale "relé 0.3": a lista de antes, e não erro', async () => {
    responder = (url) => {
      if (url === '/v1/info') return { status: 500, corpo: {} }
      if (url.startsWith(`/v1/rovers/${UID}/postagens`)) return { corpo: { itens: [envelope(POST, 'postagem', UID, 'x')], proximo: null } }
      if (url === `/v1/rovers/${UID}`) return { corpo: perfil }
      return { status: 404, corpo: {} }
    }
    const p = await new ClienteHttp({ base }).postagensDoRover(UID)
    expect(p.itens).toHaveLength(1)
    expect(vistos.some((v) => v.url.includes('completo'))).toBe(false)
  })

  it('item fora do contrato derruba a página: o site não mostra o que não entende', async () => {
    responder = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['lista-completa'] } }
      return { corpo: { itens: [{ envelope: { objeto: { id: POST, tipo: 'recado' } }, autor: resumo(UID, 'pipa', 'Pipa') }], proximo: null } }
    }
    await expect(new ClienteHttp({ base }).postagensDoRover(UID)).rejects.toBeInstanceOf(ErroRede)
  })
})

describe('detalhe de uma postagem', () => {
  it('relé 0.3.1: a postagem com as contagens reais e as respostas listadas', async () => {
    responder = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['postagem-detalhe'] } }
      if (url === `/v1/postagens/${POST}`) return { corpo: { envelope: envelope(POST, 'postagem', UID, 'a postagem'), autor: resumo(UID, 'pipa', 'Pipa'), contagens: { respostas: 1, reacoes: { curtir: 0, util: 0 } }, minhaReacao: null } }
      if (url.startsWith(`/v1/postagens/${POST}/respostas`)) {
        return { corpo: { itens: [{ envelope: envelope(RESP, 'resposta', OUTRO, 'a resposta', { alvo: POST }), autor: resumo(OUTRO, 'lumi', 'Lumi'), contagens: { respostas: 0, reacoes: { curtir: 1, util: 0 } }, minhaReacao: null }], proximo: null } }
      }
      return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
    }
    const d = await new ClienteHttp({ base }).obterObjeto(POST)
    expect(d.postagem).toMatchObject({ id: POST, respostas: 1 })
    expect(d.respostas).toHaveLength(1)
    expect(d.respostas[0]).toMatchObject({ id: RESP, texto: 'a resposta', reacoes: { curtir: 1, util: 0 }, respondeA: POST })
  })

  it('id que não é de postagem (a 0.3.1 responde 404): cai no caminho de antes, que lê o objeto e o pai', async () => {
    responder = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['postagem-detalhe'] } }
      if (url === `/v1/postagens/${RESP}`) return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
      if (url === `/v1/objetos/${RESP}`) return { corpo: envelope(RESP, 'resposta', OUTRO, 'uma resposta', { alvo: POST }) }
      if (url === `/v1/objetos/${POST}`) return { corpo: envelope(POST, 'postagem', UID, 'o pai') }
      if (url === `/v1/rovers/${OUTRO}`) return { corpo: { ...perfil, uid: OUTRO, handle: 'lumi', nome: 'Lumi' } }
      if (url === `/v1/rovers/${UID}`) return { corpo: perfil }
      return { status: 404, corpo: {} }
    }
    const d = await new ClienteHttp({ base }).obterObjeto(RESP)
    expect(d.postagem.id).toBe(RESP)
    expect(d.pai?.id).toBe(POST)
    expect(d.respostas).toEqual([])
  })

  it('removida (410) não é escondida como "não achei": o erro do relé chega à tela', async () => {
    responder = (url) => {
      if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['postagem-detalhe'] } }
      return { status: 410, corpo: { erro: { codigo: 'removido' } } }
    }
    const e = await new ClienteHttp({ base }).obterObjeto(POST).catch((x) => x)
    expect(e).toBeInstanceOf(ErroRede)
    expect((e as ErroRede).codigo).not.toBe('nao-encontrado')
  })
})

describe('avisos com nomes', () => {
  const aviso = (extra: Record<string, unknown>) => ({ seq: 7, tipo: 'resposta-no-topico', em: 1_900_000_000, origem: null, objeto: RESP, comunidade: null, pagina: null, ...extra })

  it('lugar e topico viram nomeDoLugar e nomeDoTopico, saneados; sem eles (relé 0.3) ficam null', async () => {
    const credencial = async () => 'Rover-Assinatura x'
    responder = (url) => {
      if (url.includes('/notificacoes')) {
        return { corpo: { itens: [
          aviso({ lugar: { tipo: 'comunidade', id: POST, nome: 'Mesa <b>dos</b> Tradutores' }, topico: { id: POST, titulo: 'Nomes de backup' } }),
          aviso({ seq: 6 }),
          aviso({ seq: 5, lugar: { tipo: 'comunidade', id: POST, nome: '   ' }, topico: { id: POST, titulo: 42 } }),
        ], proximo: null } }
      }
      return { status: 404, corpo: {} }
    }
    const p = await new ClienteHttp({ base, credencial }).notificacoes(UID)
    expect(p.itens[0]).toMatchObject({ nomeDoLugar: 'Mesa bdos/b Tradutores', nomeDoTopico: 'Nomes de backup' })
    expect(p.itens[1]).toMatchObject({ nomeDoLugar: null, nomeDoTopico: null })
    expect(p.itens[2]).toMatchObject({ nomeDoLugar: null, nomeDoTopico: null })
  })
})
