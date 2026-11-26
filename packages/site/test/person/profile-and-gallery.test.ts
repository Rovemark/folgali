// 0.9.0 (proposal 0011) on the site: the gallery matches the protocol one, the device signs a read credential the relay accepts,
// the read route only carries the person's own reads, a profile from the editor validates, and the profile screen reads the
// cover and gallery portraits the relay sends.
import { createPrivateKey, webcrypto } from 'node:crypto'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import { POST as readRoute } from '@/app/api/person/read/route'
import { toTags } from '@/components/person/ProfileEditor'
import { _forget, saveSession } from '@/lib/folgali/vault'
import { GALLERY_COVERS, GALLERY_PORTRAITS, defaultCover, defaultPortrait } from '@/lib/folgali/gallery'
import { SESSION_COOKIE, seal } from '@/lib/folgali/login'
import { signObject, signRead } from '@/lib/person/device'
import { portraitSpec, socialProfile } from '@/lib/social/sanitize-social'

const SECRET = 'segredo-de-teste-da-sessao-com-mais-de-32-caracteres'
const PERSON = 'p_lumi1234567890abcdefg'
const UID = 'rvr_' + 'P'.repeat(22)
const OTHER = 'rvr_' + 'Q'.repeat(22)
const AT = `rmapp_at_${'a'.repeat(43)}`
const RELAY = 'http://127.0.0.1:4700'
const protocolPath = fileURLToPath(new URL('../../../protocol/src/index.js', import.meta.url))

beforeEach(() => {
  vi.stubEnv('FOLGALI_DATA_DIR', mkdtempSync(join(tmpdir(), 'folgali-perfil-')))
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

describe.skipIf(!existsSync(protocolPath))('the gallery and the device against the protocol', async () => {
  const P = await import(/* @vite-ignore */ protocolPath)
  it('the same ids, files and alt texts as packages/protocol/src/gallery.js', () => {
    const mine = (l: typeof GALLERY_PORTRAITS) => l.map((x) => ({ id: x.id, arquivo: x.file, alt: x.alt }))
    expect(mine(GALLERY_PORTRAITS)).toEqual(P.GALLERY_PORTRAITS.map((x: { id: string; arquivo: string; alt: unknown }) => ({ id: x.id, arquivo: x.arquivo, alt: { ...(x.alt as object) } })))
    expect(mine(GALLERY_COVERS)).toEqual(P.GALLERY_COVERS.map((x: { id: string; arquivo: string; alt: unknown }) => ({ id: x.id, arquivo: x.arquivo, alt: { ...(x.alt as object) } })))
  })
  it('the read credential the device signs is the protocol one and the relay accepts it', async () => {
    const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey))
    const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
    const target = `/v1/rovers/${OTHER}/pagina`
    const mine = await signRead(pair.privateKey, UID, target, 1_900_000_000, webcrypto.subtle as unknown as SubtleCrypto)
    expect(mine).toBe(P.createReadCredential({ chavePrivada: createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' }), uid: UID, alvo: target, t: 1_900_000_000 }))
    const cred = P.readReadCredential(mine)
    expect(P.readCredentialMatches(cred, { metodo: 'GET', alvo: target, chave: pub, agora: 1_900_000_010 })).toBe(true)
    expect(P.readCredentialMatches(cred, { metodo: 'GET', alvo: `/v1/rovers/${UID}/pagina`, chave: pub, agora: 1_900_000_010 })).toBe(false)
  })
  it('the profile the editor publishes (gallery portrait and cover, tags) validates as a person object', async () => {
    const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const body = { nome: 'Marina Costa', descricao: 'De folga.', grafo: 'publico', exigirAprovacao: [], sobre: 'Gosto de trilha.', interesses: toTags('Jogos de tabuleiro, café, ok'), recados: 'amigos', retrato: { galeria: 'portrait-mint-sprout' }, capa: { galeria: 'cover-forest' } }
    expect(body.interesses).toEqual(['jogos-de-tabuleiro', 'cafe', 'ok'])
    const o = await signObject(pair.privateKey, { tipo: 'perfil', autor: UID, criadoEm: 1_900_000_001, previo: null, corpo: body }, webcrypto.subtle as unknown as SubtleCrypto)
    expect(P.validateObject(o).ok).toBe(true)
    expect(P.checkPersonObject(o)).toBe(null)
    const outside = await signObject(pair.privateKey, { tipo: 'perfil', autor: UID, criadoEm: 1_900_000_001, previo: null, corpo: { ...body, capa: { galeria: 'cover-train-station' } } }, webcrypto.subtle as unknown as SubtleCrypto)
    expect(P.validateObject(outside).ok).toBe(false)
  })
})

describe('the read route: only the person\'s own reads, carried untouched', () => {
  const signedIn = () => {
    saveSession('sid-1', { pessoa: PERSON, nome: 'Ana', fichas: { at: AT, rt: `rmapp_rt_${'r'.repeat(43)}` }, venceEm: Date.now() + 10 * 60_000 }, SECRET)
    return `${SESSION_COOKIE}=${seal({ sid: 'sid-1' }, SECRET)}`
  }
  const call = (body: unknown, cookie?: string) =>
    readRoute(new NextRequest('https://folgali.com/api/person/read', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }))
  const auth = (uid = UID) => `Rover-Assinatura uid=${uid}, t=1900000000, a=${'A'.repeat(86)}`
  it('signed out is 401; another path, another signer or another person\'s list is refused; the own read goes to the relay as is', async () => {
    const calls: { url: string; auth: string | null }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), auth: new Headers(init.headers).get('authorization') })
      if (String(url).startsWith('https://api.rovemark.co')) return Response.json({ ok: true, uid: UID, handle: 'ana', adult: true })
      return Response.json({ voce: { amigo: true } })
    })
    expect((await call({ path: `/v1/rovers/${OTHER}/pagina`, auth: auth() })).status).toBe(401)
    const cookie = signedIn()
    for (const bad of [
      { path: `/v1/rovers/${OTHER}/mensagens`, auth: auth() },
      { path: `https://evil.test/v1/rovers/${OTHER}/pagina`, auth: auth() },
      { path: `/v1/rovers/${OTHER}/pagina`, auth: 'Bearer x' },
      { path: `/v1/rovers/${OTHER}/pagina`, auth: auth(), extra: 1 },
    ]) expect((await call(bad, cookie)).status, JSON.stringify(bad)).toBe(400)
    expect((await call({ path: `/v1/rovers/${OTHER}/pagina`, auth: auth(OTHER) }, cookie)).status).toBe(403)
    expect((await call({ path: `/v1/rovers/${OTHER}/seguindo?limite=50`, auth: auth() }, cookie)).status).toBe(403)
    const ok = await call({ path: `/v1/rovers/${OTHER}/pagina`, auth: auth() }, cookie)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ voce: { amigo: true } })
    expect(calls.at(-1)).toEqual({ url: `${RELAY}/v1/rovers/${OTHER}/pagina`, auth: auth() })
    expect((await call({ path: `/v1/rovers/${UID}/seguindo?limite=50&antes=42`, auth: auth() }, cookie)).status).toBe(200)
  })
})

describe('the profile screen reads the gallery', () => {
  it('a gallery portrait becomes a gallery ficha; no portrait is a stable house plush, never just a letter', () => {
    expect(portraitSpec({ galeria: 'portrait-mint-sprout' }, UID).galeria).toBe('portrait-mint-sprout')
    expect(portraitSpec(null, UID).galeria).toBe(defaultPortrait(UID).id)
    expect(portraitSpec({ galeria: 'portrait-unknown' }, UID).galeria).toBe(defaultPortrait(UID).id)
    expect(portraitSpec({ corpo: 'seixo', cor: 'menta', veste: null, acessorio: null }, UID).galeria).toBeUndefined()
  })
  it('the cover: a known gallery id or a photo id; anything else is dropped (the neutral house cover shows)', () => {
    const base = { uid: UID, handle: 'ana', nome: 'Ana' }
    expect(socialProfile({ ...base, capa: { galeria: 'cover-snow' } }).capa).toEqual({ galeria: 'cover-snow' })
    expect(socialProfile({ ...base, capa: { midia: `ob_${'M'.repeat(43)}` } }).capa).toEqual({ midia: `ob_${'M'.repeat(43)}` })
    expect(socialProfile({ ...base, capa: { galeria: 'cover-train-station' } }).capa).toBeUndefined()
    expect(socialProfile({ ...base, capa: 'x' }).capa).toBeUndefined()
    expect(GALLERY_COVERS.map((c) => c.id)).toContain(defaultCover(UID).id)
  })
})
