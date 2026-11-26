// @vitest-environment node
// After a reload the button showed "Curtir" again: the site reads the relay without the person's credential, so `minhaReacao` came
// empty. Now the browser signs a read credential with the device key (exactly as the protocol's `createReadCredential`) and the
// site route carries it to the relay for two fixed paths only, checking that the reader is the signed-in person. Nothing is stored.
import { createPrivateKey, webcrypto } from 'node:crypto'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import { POST as reactionsRoute } from '@/app/api/person/reactions/route'
import { _forget, saveSession } from '@/lib/folgali/vault'
import { SESSION_COOKIE, seal } from '@/lib/folgali/login'
import { signReadCredential } from '@/lib/person/device'
import { postPath, reactionsFrom, repliesPath } from '@/lib/person/reads'

const SECRET = 'segredo-de-teste-da-sessao-com-mais-de-32-caracteres'
const PERSON = 'p_lumi1234567890abcdefg'
const UID = 'rvr_' + 'P'.repeat(22)
const OTHER = 'rvr_' + 'X'.repeat(22)
const AT = `rmapp_at_${'a'.repeat(43)}`
const RELAY = 'http://127.0.0.1:4700'
const POST = `ob_${'A'.repeat(43)}`
const REPLY = `ob_${'B'.repeat(43)}`
const protocolPath = fileURLToPath(new URL('../../../protocol/src/index.js', import.meta.url))

beforeEach(() => {
  vi.stubEnv('FOLGALI_DATA_DIR', mkdtempSync(join(tmpdir(), 'folgali-reactions-')))
  vi.stubEnv('FOLGALI_SESSION_SECRET', SECRET)
  vi.stubEnv('FOLGALI_ROVEMARK_API', 'https://api.rovemark.co')
  vi.stubEnv('FOLGALI_CLIENT', 'http')
  vi.stubEnv('FOLGALI_RELAY_URL', RELAY)
  _forget()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
function signedIn() {
  saveSession('sid-1', { pessoa: PERSON, nome: 'Ana da Conta', fichas: { at: AT, rt: `rmapp_rt_${'r'.repeat(43)}` }, venceEm: Date.now() + 10 * 60_000 }, SECRET)
  return `${SESSION_COOKIE}=${seal({ sid: 'sid-1' }, SECRET)}`
}
const browser = (body: unknown, cookie?: string) =>
  new NextRequest('https://folgali.com/api/person/reactions', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
const credential = (uid: string) => `Rover-Assinatura uid=${uid}, t=1900000000, a=${'s'.repeat(86)}`

async function deviceKeyPair() {
  const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey))
  const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
  return { pair, pub, nodeKey: createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' }) }
}

describe.skipIf(!existsSync(protocolPath))('the browser signs a read credential as the protocol does', async () => {
  const P = await import(/* @vite-ignore */ protocolPath)
  it('same header as createReadCredential, and the relay check accepts it only for that path, method and time', async () => {
    const { pair, pub, nodeKey } = await deviceKeyPair()
    const t = 1_900_000_000
    const path = repliesPath(POST)
    const mine = await signReadCredential(pair.privateKey, { uid: UID, path, t }, webcrypto.subtle as unknown as SubtleCrypto)
    expect(mine).toBe(P.createReadCredential({ chavePrivada: nodeKey, uid: UID, alvo: path, t }))
    const c = P.readReadCredential(mine)
    expect(P.readCredentialMatches(c, { metodo: 'GET', alvo: path, chave: pub, agora: t + 5 })).toBe(true)
    expect(P.readCredentialMatches(c, { metodo: 'GET', alvo: postPath(POST), chave: pub, agora: t })).toBe(false)
    expect(P.readCredentialMatches(c, { metodo: 'POST', alvo: path, chave: pub, agora: t })).toBe(false)
    expect(P.readCredentialMatches(c, { metodo: 'GET', alvo: path, chave: pub, agora: t + 600 })).toBe(false)
  })
})

describe('the route that carries the reads', () => {
  it('not wired is 503, signed out is 401', async () => {
    vi.stubEnv('FOLGALI_CLIENT', '')
    expect((await reactionsRoute(browser({ reads: [{ path: postPath(POST), credential: credential(UID) }] }))).status).toBe(503)
    vi.stubEnv('FOLGALI_CLIENT', 'http')
    expect((await reactionsRoute(browser({ reads: [{ path: postPath(POST), credential: credential(UID) }] }))).status).toBe(401)
  })
  it('only the two post reads, only well-formed credentials, at most 40, nothing else in the body', async () => {
    const cookie = signedIn()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => { calls.push(String(url)); return json({}) })
    const bad = [
      { reads: [] },
      { reads: [{ path: '/v1/rovers/' + UID + '/notificacoes', credential: credential(UID) }] },
      { reads: [{ path: '/v1/admin', credential: credential(UID) }] },
      { reads: [{ path: postPath(POST) + '?x=1', credential: credential(UID) }] },
      { reads: [{ path: `/v1/postagens/${POST}/respostas?ordem=recentes&limite=50`, credential: credential(UID) }] },
      { reads: [{ path: 'http://evil.example/v1/postagens/' + POST, credential: credential(UID) }] },
      { reads: [{ path: postPath(POST), credential: 'Bearer x' }] },
      { reads: [{ path: postPath(POST), credential: credential(UID), extra: 1 }] },
      { reads: [{ path: postPath(POST), credential: credential(UID) }], more: true },
      { reads: Array.from({ length: 41 }, () => ({ path: postPath(POST), credential: credential(UID) })) },
    ]
    for (const b of bad) expect((await reactionsRoute(browser(b, cookie))).status, JSON.stringify(b).slice(0, 80)).toBe(400)
    expect(calls).toEqual([])
  })
  it('a credential of someone else is refused before the relay is asked', async () => {
    const cookie = signedIn()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url))
      return String(url).includes('/api/auth/app/folgali/person') ? json({ ok: true, uid: UID, handle: 'ana', adult: true }) : json({})
    })
    const r = await reactionsRoute(browser({ reads: [{ path: postPath(POST), credential: credential(OTHER) }] }, cookie))
    expect(r.status).toBe(403)
    expect(calls.some((u) => u.startsWith(RELAY))).toBe(false)
  })
  it('carries each credential untouched to its path and answers only minhaReacao per id; a refused read just leaves its ids out', async () => {
    const cookie = signedIn()
    const seen: { url: string; auth: string | null }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      if (u.includes('/api/auth/app/folgali/person')) return json({ ok: true, uid: UID, handle: 'ana', adult: true })
      seen.push({ url: u, auth: new Headers(init.headers).get('authorization') })
      if (u === `${RELAY}${postPath(POST)}`) return json({ envelope: { objeto: { id: POST, corpo: { texto: 'segredo da linha' } } }, minhaReacao: 'amei', contagens: {} })
      if (u === `${RELAY}${repliesPath(POST)}`) return json({ itens: [{ envelope: { objeto: { id: REPLY } }, minhaReacao: 'haha' }, { envelope: { objeto: { id: `ob_${'C'.repeat(43)}` } }, minhaReacao: null }] })
      return json({ erro: { codigo: 'leitura_nao_autorizada', mensagem: 'x' } }, 401)
    })
    const third = `ob_${'D'.repeat(43)}`
    const reads = [
      { path: postPath(POST), credential: credential(UID) },
      { path: repliesPath(POST), credential: credential(UID).replace('t=1900000000', 't=1900000001') },
      { path: postPath(third), credential: credential(UID) },
    ]
    const r = await reactionsRoute(browser({ reads }, cookie))
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const body = await r.json()
    expect(body).toEqual({ reactions: { [POST]: 'amei', [REPLY]: 'haha', [`ob_${'C'.repeat(43)}`]: null } })
    expect(JSON.stringify(body)).not.toContain('segredo da linha')
    expect(seen).toEqual(reads.map((x) => ({ url: `${RELAY}${x.path}`, auth: x.credential })))
  })
})

describe('reading the relay answers', () => {
  it('detail or list; garbage ids and values never pass', () => {
    expect(reactionsFrom({ envelope: { objeto: { id: POST } }, minhaReacao: 'uau' })).toEqual({ [POST]: 'uau' })
    expect(reactionsFrom({ envelope: { objeto: { id: 'nope' } }, minhaReacao: 'uau' })).toEqual({})
    expect(reactionsFrom({ envelope: { objeto: { id: POST } }, minhaReacao: '<script>' })).toEqual({ [POST]: null })
    expect(reactionsFrom({ itens: [null, 3, { envelope: { objeto: { id: POST } }, minhaReacao: 'curtir' }] })).toEqual({ [POST]: 'curtir' })
  })
})
