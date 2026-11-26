import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const UID = uid('pipa')
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


describe('cache of `recursos` and new routes: what the real server sees', () => {
  it('the resources are kept for 60 s and then read again (an updated relay takes effect without restarting the site)', async () => {
    let now = 1_000_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      respond = (url) => (url === '/v1/info' ? withoutFeatures : { corpo: { itens: [] } })
      const c = new HttpClient({ base })
      expect(await c.suporta('removidos')).toBe(false)
      expect(await c.suporta('removidos')).toBe(false)
      expect(seen.filter((v) => v.url === '/v1/info')).toHaveLength(1)
      now += 60_000
      // at the exact instant of the limit the stored one still counts
      expect(await c.suporta('removidos')).toBe(false)
      expect(seen.filter((v) => v.url === '/v1/info')).toHaveLength(1)
      respond = (url) => (url === '/v1/info' ? withFeatures('removidos') : { corpo: { itens: [] } })
      now += 1
      expect(await c.suporta('removidos')).toBe(true)
      expect(seen.filter((v) => v.url === '/v1/info')).toHaveLength(2)
    } finally {
      clock.mockRestore()
    }
  })
  it('removed paginates with the `antes` cursor and refuses a malformed cursor without calling the relay', async () => {
    respond = (url) => (url === '/v1/info' ? withFeatures('removidos') : { corpo: { itens: [], proximo: null } })
    const c = new HttpClient({ base, credencial: CRED })
    await c.removidos(UID, '123456')
    expect(seen.some((v) => v.url === `/v1/rovers/${UID}/removidos?antes=123456`)).toBe(true)
    seen = []
    expect(await code(() => c.removidos(UID, 'abc; drop'))).toBe('invalido')
    expect(seen.some((v) => v.url.includes('/removidos'))).toBe(false)
  })
  it('the page topics are read at /v1/paginas/temas, without sending the person\'s credential (it is a public read)', async () => {
    respond = (url) => (url === '/v1/info' ? withFeatures('temas-de-paginas') : { corpo: { itens: [{ tema: 'arquivos', paginas: 3 }] } })
    const r = await new HttpClient({ base, credencial: CRED }).temasDePaginas()
    expect(r).toEqual([{ tema: 'arquivos', paginas: 3 }])
    const v = seen.find((x) => x.url === '/v1/paginas/temas')
    expect(v).toBeDefined()
    expect(v?.cabecalhos.authorization).toBeUndefined()
  })
})
