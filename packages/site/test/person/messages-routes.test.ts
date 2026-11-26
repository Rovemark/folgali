// @vitest-environment node
// The site server and private messages: /api/person/read carries only the person's OWN conversation reads (and two public reads,
// a profile and a cipher key) with a credential signed on her device; /api/person/publish carries 0.4 objects untouched (v 0.4,
// previo null) without asking for anything of the chain. The server never sees a text in clear: what it carries is encrypted.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import { POST as readRoute } from '@/app/api/person/read/route'
import { POST as publishRoute } from '@/app/api/person/publish/route'
import { _forget, recordConsent, saveSession } from '@/lib/folgali/vault'
import { SESSION_COOKIE, seal } from '@/lib/folgali/login'
import { cipherKeyPath, conversationPath, conversationsPath, friendsPath, messageReadOwner, messagesPath, profilePath } from '@/lib/person/reads'
import { messagesInfoOf } from '@/lib/person/messages-info'

const SECRET = 'segredo-de-teste-da-sessao-com-mais-de-32-caracteres'
const PERSON = 'p_lumi1234567890abcdefg'
const UID = 'rvr_' + 'P'.repeat(22)
const OTHER = 'rvr_' + 'X'.repeat(22)
const AT = `rmapp_at_${'a'.repeat(43)}`
const RELAY = 'http://127.0.0.1:4700'
const CONV = `ob_${'C'.repeat(43)}`

beforeEach(() => {
  vi.stubEnv('FOLGALI_DATA_DIR', mkdtempSync(join(tmpdir(), 'folgali-mensagens-')))
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
const req = (route: string, body: unknown, cookie?: string) =>
  new NextRequest(`https://folgali.com/api/person/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
const credential = (uid: string) => `Rover-Assinatura uid=${uid}, t=1900000000, a=${'s'.repeat(86)}`

describe('the closed list of message reads', () => {
  it('own conversation reads name their uid; the profile and the cipher key are public; anything else is null', () => {
    expect(messageReadOwner(conversationsPath(UID, 'todas'))).toEqual({ uid: UID })
    expect(messageReadOwner(conversationsPath(UID, 'pendentes', 123))).toEqual({ uid: UID })
    expect(messageReadOwner(conversationPath(UID, CONV))).toEqual({ uid: UID })
    expect(messageReadOwner(messagesPath(UID, CONV, 9))).toEqual({ uid: UID })
    expect(messageReadOwner(friendsPath(UID))).toEqual({ uid: UID })
    expect(messageReadOwner(profilePath(OTHER))).toBe('public')
    expect(messageReadOwner(cipherKeyPath(OTHER))).toBe('public')
    for (const bad of [
      `/v1/rovers/${UID}/conversas`,
      `/v1/rovers/${UID}/conversas?estado=todas&limite=51`,
      `/v1/rovers/${UID}/conversas?estado=lidas&limite=50`,
      `/v1/rovers/${UID}/conversas/${CONV}/mensagens`,
      `/v1/rovers/${UID}/conversas/${CONV}/mensagens?limite=50&x=1`,
      `/v1/rovers/${UID}/notificacoes`,
      `/v1/admin/mensagens/denuncias?limite=50`,
      `/v1/rovers/${UID}/chave-de-cifra?x=1`,
      `/v1/objetos/${CONV}`,
      `http://evil.example${profilePath(UID)}`,
    ]) expect(messageReadOwner(bad), bad).toBeNull()
  })
})

describe('/api/person/read with message paths', () => {
  it('reading the conversations of someone else is refused before the relay is asked, even with a well-formed own credential', async () => {
    const cookie = signedIn()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url))
      return String(url).includes('/api/auth/app/folgali/person') ? json({ ok: true, uid: UID, handle: 'ana', adult: true }) : json({})
    })
    for (const path of [conversationsPath(OTHER, 'todas'), conversationPath(OTHER, CONV), messagesPath(OTHER, CONV), friendsPath(OTHER)]) {
      expect((await readRoute(req('read', { path, auth: credential(UID) }, cookie))).status, path).toBe(403)
    }
    // a credential of the other side for the other side's path is refused too: only the signed-in person reads
    expect((await readRoute(req('read', { path: conversationsPath(OTHER, 'todas'), auth: credential(OTHER) }, cookie))).status).toBe(403)
    expect(calls.some((u) => u.startsWith(RELAY))).toBe(false)
  })
  it('paths off the list are 400 and never reach the relay', async () => {
    const cookie = signedIn()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => { calls.push(String(url)); return json({}) })
    for (const path of [`/v1/rovers/${UID}/conversas`, `/v1/admin/mensagens/denuncias?limite=50`, `/v1/rovers/${UID}/conversas/${CONV}/mensagens?limite=500`]) {
      expect((await readRoute(req('read', { path, auth: credential(UID) }, cookie))).status, path).toBe(400)
    }
    expect(calls).toEqual([])
  })
  it('carries the own reads and the two public ones untouched, the envelopes as the relay gave them (encrypted)', async () => {
    const cookie = signedIn()
    const seen: { url: string; auth: string | null }[] = []
    const envelope = { objeto: { tipo: 'mensagem', corpo: { cifrado: 'QUJD' } } }
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      if (u.includes('/api/auth/app/folgali/person')) return json({ ok: true, uid: UID, handle: 'ana', adult: true })
      seen.push({ url: u, auth: new Headers(init.headers).get('authorization') })
      return json({ itens: [envelope], proximo: null })
    })
    const paths = [conversationsPath(UID, 'ativas'), conversationPath(UID, CONV), messagesPath(UID, CONV, 77), friendsPath(UID), profilePath(OTHER), cipherKeyPath(OTHER)]
    for (const path of paths) {
      const r = await readRoute(req('read', { path, auth: credential(UID) }, cookie))
      expect(r.status, path).toBe(200)
      expect(r.headers.get('cache-control')).toBe('no-store')
      expect(await r.json()).toEqual({ itens: [envelope], proximo: null })
    }
    expect(seen).toEqual(paths.map((p) => ({ url: `${RELAY}${p}`, auth: credential(UID) })))
  })
})

describe('/api/person/publish with a 0.4 object', () => {
  it('passes v 0.4 with previo null untouched for the own author, refuses another author', async () => {
    const cookie = signedIn()
    recordConsent(PERSON)
    const bodies: unknown[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      if (u.includes('/api/auth/app/folgali/person')) return json({ ok: true, uid: UID, handle: 'ana', adult: true })
      bodies.push(JSON.parse(String(init.body)))
      return json({ estado: 'aceito', id: CONV }, 201)
    })
    const object = { v: '0.4', tipo: 'mensagem', autor: UID, criadoEm: 1_900_000_000, previo: null, corpo: { conversa: CONV, para: OTHER, chaveDe: 'k', chavePara: 'k', sal: 's', iv: 'i', cifrado: 'c' }, id: CONV, assinatura: 'x' }
    const attestation = { tipo: 'atestado-pessoa', uid: UID }
    const r = await publishRoute(req('publish', { objeto: object, atestado: attestation }, cookie))
    expect(r.status).toBe(201)
    expect(bodies).toEqual([{ objeto: object, atestado: attestation }])
    const other = await publishRoute(req('publish', { objeto: { ...object, autor: OTHER }, atestado: attestation }, cookie))
    expect(other.status).toBe(403)
    expect(bodies).toHaveLength(1)
  })
})

describe('whether messages are on', () => {
  it('on only with `mensagens` in recursos and at least one issuer key; the retention comes from the relay', () => {
    const key = 'K'.repeat(43)
    expect(messagesInfoOf({ recursos: ['mensagens'], emissores: [key, 'bad'], limites: { retencaoDeMensagemS: 86400 * 30 } })).toEqual({ on: true, issuers: [key], retentionS: 2_592_000 })
    expect(messagesInfoOf({ recursos: ['social'], emissores: [key] }).on).toBe(false)
    expect(messagesInfoOf({ recursos: ['mensagens'], emissores: [] }).on).toBe(false)
    expect(messagesInfoOf(null)).toEqual({ on: false, issuers: [], retentionS: 2_592_000 })
  })
})
