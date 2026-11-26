// @vitest-environment node
// The folgali side of "Entrar com a Rovemark" and the routes the Accounts Center calls. Rovemark is fake (fetch
// replaced): no call leaves the computer. Proof: correct PKCE, state checked before anything else, a single cookie and an
// essential one, tokens only on the server, serialized renewal, the Center's signature in constant time and with a deadline.
import { createHmac } from 'node:crypto'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import { GET as home } from '@/app/api/auth/rovemark/inicio/route'
import { GET as back } from '@/app/api/auth/rovemark/callback/route'
import { POST as signOut } from '@/app/api/auth/sair/route'
import { POST as linked } from '@/app/api/rovemark/ligados/route'
import { POST as remove } from '@/app/api/rovemark/ligados/remover/route'
import { POST as deletedAccount } from '@/app/api/rovemark/conta-apagada/route'
import { _forget, enable, readSession, saveSession } from '@/lib/folgali/vault'
import { SESSION_COOKIE, openAction, validSignature, configLogin, challengeS256, safeTarget, seal, type CookieContent } from '@/lib/folgali/login'
import { keepAlive } from '@/lib/folgali/session'

const SECRET = 'segredo-de-teste-da-sessao-com-mais-de-32-caracteres'
const CENTRAL = 'segredo-de-teste-da-central-com-mais-de-32-caracteres'
const BASE = 'https://folgali.com'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'folgali-cofre-'))
  vi.stubEnv('FOLGALI_DATA_DIR', dir)
  vi.stubEnv('FOLGALI_SESSION_SECRET', SECRET)
  vi.stubEnv('FOLGALI_ROVEMARK_API', 'https://api.rovemark.co')
  vi.stubEnv('FOLGALI_ROVEMARK_RETURN', 'https://folgali.com/api/auth/rovemark/callback')
  vi.stubEnv('RVM_FOLGALI_SECRET', CENTRAL)
  _forget()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const tokens = (n = 1) => ({ ok: true, token_type: 'Bearer', access_token: `rmapp_at_${'a'.repeat(42)}${n}`, expires_in: 900, refresh_token: `rmapp_rt_${'r'.repeat(42)}${n}`, refresh_expires_in: 2592000, pessoa: { id: 'p_lumi123456', nome: 'Ana Folga' } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const cookieOf = (res: Response) => res.headers.getSetCookie()

describe('configuration', () => {
  it('without a secret of 32+ characters there is no login (the button stays "em breve")', () => {
    vi.stubEnv('FOLGALI_SESSION_SECRET', 'curto')
    expect(configLogin()).toBeNull()
  })
  it('an API or return without https (outside localhost) is refused', () => {
    vi.stubEnv('FOLGALI_ROVEMARK_API', 'http://api.rovemark.co')
    expect(configLogin()).toBeNull()
    vi.stubEnv('FOLGALI_ROVEMARK_API', 'http://127.0.0.1:4000')
    expect(configLogin()?.api).toBe('http://127.0.0.1:4000')
  })
  it('the default return is the one registered with Rovemark', () => {
    vi.stubEnv('FOLGALI_ROVEMARK_RETURN', undefined)
    expect(configLogin()?.volta).toBe('https://folgali.com/api/auth/rovemark/callback')
  })
})

describe('pure pieces', () => {
  it('RFC 7636 S256 challenge (the official example)', () => {
    expect(challengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('the seal opens with the same secret and does not open tampered, with another secret or for another use', () => {
    const s = seal({ sid: 'x' }, SECRET)
    expect(openAction(s, SECRET)).toEqual({ sid: 'x' })
    expect(openAction(s, `${SECRET}!`)).toBeNull()
    expect(openAction(s, SECRET, 'fichas')).toBeNull()
    const b = Buffer.from(s, 'base64url')
    b[b.length - 1] ^= 1
    expect(openAction(b.toString('base64url'), SECRET)).toBeNull()
    expect(openAction('lixo', SECRET)).toBeNull()
  })
  it('the destination after signing in is always a path on the site itself', () => {
    expect(safeTarget('/pt/inicio')).toBe('/pt/inicio')
    for (const bad of ['https://mal.example', '//mal.example', '/pt/../x', 'javascript:alert(1)', '/pt?x=1', null]) expect(safeTarget(bad, 'en')).toBe('/en/linha')
  })
  it('the Center\'s signature: a correct one passes; a changed body, wrong secret, expired 5-minute deadline and malformed format do not', () => {
    const t = 1_800_000_000
    const body = '{"pessoa":"p_lumi123456"}'
    const v1 = createHmac('sha256', CENTRAL).update(`${t}.${body}`).digest('hex')
    expect(validSignature(`t=${t},v1=${v1}`, body, CENTRAL, t)).toBe(true)
    expect(validSignature(`t=${t},v1=${v1}`, body, CENTRAL, t + 300)).toBe(true)
    expect(validSignature(`t=${t},v1=${v1}`, body, CENTRAL, t + 301)).toBe(false)
    expect(validSignature(`t=${t},v1=${v1}`, `${body} `, CENTRAL, t)).toBe(false)
    expect(validSignature(`t=${t},v1=${v1}`, body, `${CENTRAL}x`, t)).toBe(false)
    expect(validSignature(`t=${t},v1=${v1.slice(0, 63)}`, body, CENTRAL, t)).toBe(false)
    expect(validSignature(null, body, CENTRAL, t)).toBe(false)
  })
})

describe('sign in: start and return', () => {
  it('the start keeps the verifier and state in the cookie and sends to Rovemark with the S256 challenge; a single cookie, essential', async () => {
    const res = home(new NextRequest(`${BASE}/api/auth/rovemark/inicio?lang=en&tela=criar&destino=/en/inicio`))
    expect(res.status).toBe(302)
    const destination = new URL(res.headers.get('location')!)
    expect(destination.origin + destination.pathname).toBe('https://api.rovemark.co/api/auth/oauth/rovemark/start')
    expect(destination.searchParams.get('app')).toBe('folgali')
    expect(destination.searchParams.get('volta')).toBe('https://folgali.com/api/auth/rovemark/callback')
    expect(destination.searchParams.get('tela')).toBe('criar')
    const cookies = cookieOf(res)
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=`))
    expect(cookies[0]).toMatch(/HttpOnly/i)
    expect(cookies[0]).toMatch(/Secure/i)
    expect(cookies[0]).toMatch(/SameSite=lax/i)
    const c = openAction<CookieContent>(cookies[0].split(';')[0].split('=')[1], SECRET)!
    expect(destination.searchParams.get('desafio')).toBe(challengeS256(c.login!.verificador))
    expect(destination.searchParams.get('estado')).toBe(c.login!.estado)
    expect(c.login!.destino).toBe('/en/inicio')
  })
  it('without configuration, the start does not leave the site', () => {
    vi.stubEnv('FOLGALI_SESSION_SECRET', '')
    const res = home(new NextRequest(`${BASE}/api/auth/rovemark/inicio`))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/pt/entrar')
    expect(cookieOf(res)).toHaveLength(0)
  })

  const request = (state = 'estado-certo-123', at = Date.now()) => seal({ login: { verificador: 'v'.repeat(64), estado: state, destino: '/pt/inicio', em: at } }, SECRET)
  const returnsWith = (q: string, cookie?: string) => back(new NextRequest(`${BASE}/api/auth/rovemark/callback?${q}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} }))

  it('state different from the cookie: refuses BEFORE calling Rovemark', async () => {
    const search = vi.fn()
    vi.stubGlobal('fetch', search)
    const res = await returnsWith(`codigo=${'c'.repeat(43)}&estado=estado-errado-123`, request())
    expect(res.headers.get('location')).toMatch(/\/pt\/entrar\?erro=pedido$/)
    expect(search).not.toHaveBeenCalled()
  })
  it('without a cookie, or an expired request (over 10 minutes): refuses', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect((await returnsWith(`codigo=${'c'.repeat(43)}&estado=estado-certo-123`)).headers.get('location')).toMatch(/erro=pedido/)
    expect((await returnsWith(`codigo=${'c'.repeat(43)}&estado=estado-certo-123`, request('estado-certo-123', Date.now() - 11 * 60_000))).headers.get('location')).toMatch(/erro=pedido/)
  })
  it('cancelled at Rovemark: returns to sign-in with the notice', async () => {
    const res = await returnsWith('erro=cancelado&mensagem=x&estado=estado-certo-123', request())
    expect(res.headers.get('location')).toMatch(/\/pt\/entrar\?erro=cancelado$/)
  })
  it('approved: swaps the code server to server, keeps the tokens ENCRYPTED in the vault and the cookie carries only the session id', async () => {
    const search = vi.fn(async () => json(tokens()))
    vi.stubGlobal('fetch', search)
    const res = await returnsWith(`codigo=${'c'.repeat(43)}&estado=estado-certo-123`, request())
    expect(search).toHaveBeenCalledOnce()
    const [url, init] = search.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.rovemark.co/api/auth/app/exchange')
    expect(JSON.parse(init.body as string)).toEqual({ codigo: 'c'.repeat(43), verificador: 'v'.repeat(64) })
    expect(new URL(res.headers.get('location')!).pathname).toBe('/pt/inicio')
    const c = openAction<CookieContent>(cookieOf(res)[0].split(';')[0].split('=')[1], SECRET)!
    expect(c.login).toBeUndefined()
    expect(readSession(c.sid!)?.nome).toBe('Ana Folga')
    const file = readFileSync(join(dir, 'cofre.json'), 'utf8')
    expect(file).not.toMatch(/rmapp_/)
    expect(statSync(join(dir, 'cofre.json')).mode & 0o777).toBe(0o600)
  })
  it('Rovemark refuses the code: returns to sign-in without a session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'x', codigo: 'codigo_invalido' }, 400)))
    const res = await returnsWith(`codigo=${'c'.repeat(43)}&estado=estado-certo-123`, request())
    expect(res.headers.get('location')).toMatch(/erro=troca/)
    expect(openAction<CookieContent>(cookieOf(res)[0].split(';')[0].split('=')[1], SECRET)?.sid).toBeUndefined()
  })
})

describe('live session, renewal and sign-out', () => {
  const withSession = (expiresAt: number) => {
    saveSession('sid1', { pessoa: 'p_lumi123456', nome: 'Ana', fichas: { at: 'rmapp_at_x', rt: 'rmapp_rt_velha' }, venceEm: expiresAt }, SECRET)
    return configLogin()!
  }
  it('renews near expiry, and two renewals at the same time become ONE call (Rovemark brings the family down if a token is reused)', async () => {
    const c = withSession(Date.now() + 10_000)
    const search = vi.fn(async () => json(tokens(2)))
    const [a, b] = await Promise.all([keepAlive('sid1', c, search), keepAlive('sid1', c, search)])
    expect([a, b]).toEqual([true, true])
    expect(search).toHaveBeenCalledOnce()
    expect(JSON.parse((search.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ refresh_token: 'rmapp_rt_velha' })
    expect(readSession('sid1')!.venceEm).toBeGreaterThan(Date.now() + 800_000)
  })
  it('token still good: does not renew', async () => {
    const c = withSession(Date.now() + 10 * 60_000)
    const search = vi.fn()
    expect(await keepAlive('sid1', c, search)).toBe(true)
    expect(search).not.toHaveBeenCalled()
  })
  it('401 on renewal (removed in the Center, reuse, password changed): the session ends here too', async () => {
    const c = withSession(Date.now() - 1)
    expect(await keepAlive('sid1', c, vi.fn(async () => json({ codigo: 'acesso_revogado' }, 401)))).toBe(false)
    expect(readSession('sid1')).toBeNull()
  })
  it('signing out revokes the family at Rovemark, deletes the session and the cookie', async () => {
    withSession(Date.now() + 600_000)
    const search = vi.fn(async () => json({ ok: true }))
    vi.stubGlobal('fetch', search)
    const res = await signOut(new NextRequest(`${BASE}/api/auth/sair?lang=pt`, { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${seal({ sid: 'sid1' }, SECRET)}` } }))
    expect((search.mock.calls[0] as unknown as [string])[0]).toBe('https://api.rovemark.co/api/auth/app/revoke')
    expect(readSession('sid1')).toBeNull()
    expect(cookieOf(res)[0]).toMatch(/Max-Age=0/i)
  })
})

describe('Accounts Center', () => {
  const signed = (url: string, body: unknown, secret = CENTRAL, t = Math.floor(Date.now() / 1000)) => {
    const raw = JSON.stringify(body)
    const v1 = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
    return new NextRequest(`${BASE}${url}`, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-rvm-assinatura': `t=${t},v1=${v1}` } })
  }
  const item = { id: 'rvr_lumi', tipo: 'rover' as const, nome: 'Lumi', ligadoEm: '2026-11-24T12:00:00.000Z' }

  it('without RVM_FOLGALI_SECRET: 503 (the Center shows "em breve")', async () => {
    vi.stubEnv('RVM_FOLGALI_SECRET', '')
    expect((await linked(signed('/api/rovemark/ligados', { pessoa: 'p_lumi123456' }))).status).toBe(503)
  })
  it('wrong or old signature: 401, and nothing is read or deleted', async () => {
    enable('p_lumi123456', item)
    expect((await linked(signed('/api/rovemark/ligados', { pessoa: 'p_lumi123456' }, 'outro-segredo-com-mais-de-32-caracteres!!'))).status).toBe(401)
    expect((await deletedAccount(signed('/api/rovemark/conta-apagada', { pessoa: 'p_lumi123456' }, CENTRAL, Math.floor(Date.now() / 1000) - 400))).status).toBe(401)
    expect(await (await linked(signed('/api/rovemark/ligados', { pessoa: 'p_lumi123456' }))).json()).toEqual({ itens: [item] })
  })
  it('lists, removes (ok false when it was already not there) and deletes everything of the person when the account goes away', async () => {
    enable('p_lumi123456', item)
    saveSession('sid9', { pessoa: 'p_lumi123456', nome: 'Ana', fichas: { at: 'a', rt: 'r' }, venceEm: Date.now() + 1e6 }, SECRET)
    expect(await (await remove(signed('/api/rovemark/ligados/remover', { pessoa: 'p_lumi123456', tipo: 'rover', id: 'rvr_lumi' }))).json()).toEqual({ ok: true })
    expect(await (await remove(signed('/api/rovemark/ligados/remover', { pessoa: 'p_lumi123456', tipo: 'rover', id: 'rvr_lumi' }))).json()).toEqual({ ok: false })
    expect(await (await deletedAccount(signed('/api/rovemark/conta-apagada', { pessoa: 'p_lumi123456' }))).json()).toEqual({ ok: true })
    expect(readSession('sid9')).toBeNull()
  })
  it('body outside the contract: 400', async () => {
    expect((await remove(signed('/api/rovemark/ligados/remover', { pessoa: 'p_lumi123456', tipo: 'gato', id: 'x' }))).status).toBe(400)
    expect((await linked(signed('/api/rovemark/ligados', { pessoa: '../etc' }))).status).toBe(400)
  })
})
