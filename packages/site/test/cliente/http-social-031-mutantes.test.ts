import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const UID = uid('pipa')
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


describe('cache de `recursos` e rotas novas: o que o servidor de verdade vê', () => {
  it('os recursos ficam guardados por 60 s e depois são lidos de novo (um relé atualizado passa a valer sem reiniciar o site)', async () => {
    let agora = 1_000_000
    const relogio = vi.spyOn(Date, 'now').mockImplementation(() => agora)
    try {
      responder = (url) => (url === '/v1/info' ? semRecursos : { corpo: { itens: [] } })
      const c = new ClienteHttp({ base })
      expect(await c.suporta('removidos')).toBe(false)
      expect(await c.suporta('removidos')).toBe(false)
      expect(vistos.filter((v) => v.url === '/v1/info')).toHaveLength(1)
      agora += 60_000
      // no instante exato do limite ainda vale o guardado
      expect(await c.suporta('removidos')).toBe(false)
      expect(vistos.filter((v) => v.url === '/v1/info')).toHaveLength(1)
      responder = (url) => (url === '/v1/info' ? comRecursos('removidos') : { corpo: { itens: [] } })
      agora += 1
      expect(await c.suporta('removidos')).toBe(true)
      expect(vistos.filter((v) => v.url === '/v1/info')).toHaveLength(2)
    } finally {
      relogio.mockRestore()
    }
  })
  it('removidos pagina com o cursor `antes` e recusa cursor torto sem chamar o relé', async () => {
    responder = (url) => (url === '/v1/info' ? comRecursos('removidos') : { corpo: { itens: [], proximo: null } })
    const c = new ClienteHttp({ base, credencial: CRED })
    await c.removidos(UID, '123456')
    expect(vistos.some((v) => v.url === `/v1/rovers/${UID}/removidos?antes=123456`)).toBe(true)
    vistos = []
    expect(await codigo(() => c.removidos(UID, 'abc; drop'))).toBe('invalido')
    expect(vistos.some((v) => v.url.includes('/removidos'))).toBe(false)
  })
  it('os temas de páginas são lidos em /v1/paginas/temas, sem mandar a credencial da pessoa (é leitura pública)', async () => {
    responder = (url) => (url === '/v1/info' ? comRecursos('temas-de-paginas') : { corpo: { itens: [{ tema: 'arquivos', paginas: 3 }] } })
    const r = await new ClienteHttp({ base, credencial: CRED }).temasDePaginas()
    expect(r).toEqual([{ tema: 'arquivos', paginas: 3 }])
    const v = vistos.find((x) => x.url === '/v1/paginas/temas')
    expect(v).toBeDefined()
    expect(v?.cabecalhos.authorization).toBeUndefined()
  })
})
