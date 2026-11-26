// @vitest-environment node
// A person writes and an owner claims for real (docs/INTEGRATION-ROVEMARK-PEOPLE.md and docs/INTEGRATION-ROVEMARK-VERIFIED-OWNER.md):
//   - the browser signs exactly as the protocol: same canonical JSON, same id, same Ed25519 signature as `createObject`;
//   - the site's routes ask Rovemark with the person's access (never sent to the browser), check consent and authorship,
//     carry the signed envelope to the relay untouched, and hand the owner act to the open issuer;
//   - Rovemark's signed bridge brings the person's Rover Hangar rovers, and removing an agent in the Account Center carries the act.
// Rovemark, the relay and the open issuer are fake (fetch replaced): nothing leaves the computer.
import { createHmac, createPrivateKey, webcrypto } from 'node:crypto'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import { GET as person } from '@/app/api/person/route'
import { POST as attestation } from '@/app/api/person/attestation/route'
import { POST as publishRoute } from '@/app/api/person/publish/route'
import { POST as claimRoute } from '@/app/api/agents/claim/route'
import { POST as hangarRovers } from '@/app/api/rovemark/hangar-rovers/route'
import { POST as linked } from '@/app/api/rovemark/ligados/route'
import { POST as remove } from '@/app/api/rovemark/ligados/remover/route'
import { _forget, linkedOf, enable, recordConsent, saveSession } from '@/lib/folgali/vault'
import { SESSION_COOKIE, seal } from '@/lib/folgali/login'
import { canonical, signObject } from '@/lib/person/device'

const SECRET = 'segredo-de-teste-da-sessao-com-mais-de-32-caracteres'
const CENTRAL = 'segredo-de-teste-da-central-com-mais-de-32-caracteres'
const PERSON = 'p_lumi1234567890abcdefg'
const UID = 'rvr_' + 'P'.repeat(22)
const AT = `rmapp_at_${'a'.repeat(43)}`
const RELAY = 'http://127.0.0.1:4700'

beforeEach(() => {
  vi.stubEnv('FOLGALI_DATA_DIR', mkdtempSync(join(tmpdir(), 'folgali-issuers-')))
  vi.stubEnv('FOLGALI_SESSION_SECRET', SECRET)
  vi.stubEnv('FOLGALI_ROVEMARK_API', 'https://api.rovemark.co')
  vi.stubEnv('RVM_FOLGALI_SECRET', CENTRAL)
  vi.stubEnv('FOLGALI_CLIENT', 'http')
  vi.stubEnv('FOLGALI_RELAY_URL', RELAY)
  _forget()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
type Call = { url: string; method: string; auth: string | null; body: unknown }
/** fetch replaced by a table of fakes; every call is recorded. */
function fakes(routes: Record<string, (c: Call) => Response>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const c: Call = { url: String(url), method: init.method ?? 'GET', auth: new Headers(init.headers).get('authorization'), body: init.body ? JSON.parse(String(init.body)) : null }
    calls.push(c)
    const k = Object.keys(routes).find((p) => c.url.startsWith(p) || `${c.method} ${c.url}`.startsWith(p))
    return k ? routes[k](c) : new Response('{}', { status: 599 })
  })
  return calls
}
function signedIn() {
  saveSession('sid-1', { pessoa: PERSON, nome: 'Ana da Conta', fichas: { at: AT, rt: `rmapp_rt_${'r'.repeat(43)}` }, venceEm: Date.now() + 10 * 60_000 }, SECRET)
  return { cookie: `${SESSION_COOKIE}=${seal({ sid: 'sid-1' }, SECRET)}` }
}
const browser = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`https://folgali.com${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
const signedReq = (path: string, body: unknown, secret = CENTRAL) => {
  const raw = JSON.stringify(body)
  const t = Math.floor(Date.now() / 1000)
  return new NextRequest(`https://folgali.com${path}`, { method: 'POST', body: raw, headers: { 'x-rvm-assinatura': `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}` } })
}

const protocolPath = fileURLToPath(new URL('../../../protocol/src/index.js', import.meta.url))

describe.skipIf(!existsSync(protocolPath))('the browser signs as the protocol does', async () => {
  const P = await import(/* @vite-ignore */ protocolPath)
  it('canonical JSON is the protocol one', () => {
    const v = { z: [1, 'ã', null, true], a: { y: 2, b: '"x"' }, m: -7 }
    expect(canonical(v)).toBe(P.canonicalize(v))
  })
  it('same id and same signature as createObject, and the object validates and verifies', async () => {
    const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey))
    const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
    const input = { tipo: 'postagem', autor: UID, criadoEm: 1_900_000_000, previo: null, corpo: { texto: 'Primeira tarde de folga.', topicos: [] } }
    const mine = await signObject(pair.privateKey, input, webcrypto.subtle as unknown as SubtleCrypto)
    const theirs = P.createObject({ ...input, chavePrivada: createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' }) })
    expect(mine).toEqual(theirs)
    expect(P.validateObject(mine).ok).toBe(true)
    const { assinatura: signature, ...rest } = mine
    expect(P.verifySignature(P.objectDomain('0.3', 'postagem'), P.canonicalBytes(rest), signature, pub)).toBe(true)
    // a profile, as the first-profile screen publishes it
    const profile = await signObject(pair.privateKey, { tipo: 'perfil', autor: UID, criadoEm: 1_900_000_001, previo: mine.id, corpo: { nome: 'Ana', descricao: '', grafo: 'publico', exigirAprovacao: [] } }, webcrypto.subtle as unknown as SubtleCrypto)
    expect(P.validateObject(profile).ok).toBe(true)
    expect(P.checkPersonObject(profile)).toBe(null)
  })
})

describe('the routes the browser calls', () => {
  const key = 'K'.repeat(43)
  const att = { tipo: 'atestado-pessoa', v: '0.7', emissor: 'E'.repeat(43), uid: UID, handle: 'ana.folga', chave: key, emitidoEm: 1, expiraEm: 2, assinatura: 'S'.repeat(86) }
  it('not wired (demonstration) is 503; signed out is 401; without the Terms accepted is 403', async () => {
    vi.stubEnv('FOLGALI_CLIENT', '')
    expect((await person(browser('/api/person'))).status).toBe(503)
    vi.stubEnv('FOLGALI_CLIENT', 'http')
    expect((await person(browser('/api/person'))).status).toBe(401)
    const { cookie } = signedIn()
    fakes({})
    const r = await attestation(browser('/api/person/attestation', { key }, { cookie }))
    expect(r.status).toBe(403)
    expect((await r.json()).erro.codigo).toBe('aceite')
    // only JSON is read (a cross-site form cannot post here)
    const form = new NextRequest('https://folgali.com/api/person/attestation', { method: 'POST', body: 'key=x', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })
    expect((await attestation(form)).status).toBe(415)
  })
  it('the attestation: Rovemark is asked with the server-side access, the browser gets the attestation, never the access', async () => {
    const { cookie } = signedIn()
    recordConsent(PERSON)
    const calls = fakes({ 'https://api.rovemark.co/api/auth/app/folgali/person-attestation': () => json({ ok: true, attestation: att, uid: UID, handle: 'ana.folga' }) })
    const r = await attestation(browser('/api/person/attestation', { key, handle: 'ana.folga' }, { cookie }))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.attestation).toEqual(att)
    expect(JSON.stringify(body)).not.toContain('rmapp_')
    expect(calls[0]).toMatchObject({ method: 'POST', auth: `Bearer ${AT}`, body: { key, handle: 'ana.folga' } })
    // Rovemark refusing (handle taken) reaches the browser with its code
    fakes({ 'https://api.rovemark.co/api/auth/app/folgali/person-attestation': () => json({ error: 'x', codigo: 'handle_taken' }, 409) })
    const taken = await attestation(browser('/api/person/attestation', { key, handle: 'outra' }, { cookie }))
    expect(taken.status).toBe(409)
    expect((await taken.json()).erro.codigo).toBe('handle_taken')
    // an attestation for another key is never passed on
    fakes({ 'https://api.rovemark.co/api/auth/app/folgali/person-attestation': () => json({ ok: true, attestation: { ...att, chave: 'Z'.repeat(43) } }) })
    expect((await attestation(browser('/api/person/attestation', { key }, { cookie }))).status).toBe(502)
  })
  it('the state: derived uid from Rovemark, head and profile name from the relay', async () => {
    const { cookie } = signedIn()
    recordConsent(PERSON)
    fakes({
      'https://api.rovemark.co/api/auth/app/folgali/person': () => json({ ok: true, uid: UID, handle: 'ana.folga', adult: true }),
      [`${RELAY}/v1/rovers/${UID}`]: () => json({ uid: UID, nome: 'Ana', cabeca: 'ob_x', perfilId: 'ob_p', perfil: { corpo: { nome: 'Ana', descricao: '', capa: { galeria: 'cover-snow' } } } }),
    })
    // `body` is the current profile object, where the profile editor starts from (a new profile replaces the old one as a whole)
    expect(await (await person(browser('/api/person', undefined, { cookie }))).json()).toEqual({ uid: UID, handle: 'ana.folga', adult: true, head: 'ob_x', profile: true, name: 'Ana', body: { nome: 'Ana', descricao: '', capa: { galeria: 'cover-snow' } }, consent: true, edit: false })
  })
  it('publishing: only the person\'s own object, carried untouched, and the relay answer comes back as is', async () => {
    const { cookie } = signedIn()
    recordConsent(PERSON)
    const object = { v: '0.3', tipo: 'postagem', autor: UID, criadoEm: 1, previo: null, corpo: { texto: 'oi', topicos: [] }, id: 'ob_1', assinatura: 'A'.repeat(86) }
    const calls = fakes({
      'https://api.rovemark.co/api/auth/app/folgali/person': () => json({ ok: true, uid: UID, handle: 'ana.folga', adult: null }),
      [`${RELAY}/v1/objetos`]: (c) => ((c.body as { objeto: { corpo: { texto: string } } }).objeto.corpo.texto.includes('senha') ? json({ erro: { codigo: 'vazamento', mensagem: 'x', vazamento: 'senha' } }, 422) : json({ estado: 'aceito', id: 'ob_1' }, 201)),
    })
    const ok = await publishRoute(browser('/api/person/publish', { objeto: object, atestado: att }, { cookie }))
    expect(ok.status).toBe(201)
    expect(calls.at(-1)).toMatchObject({ url: `${RELAY}/v1/objetos`, auth: null, body: { objeto: object, atestado: att } })
    const leak = await publishRoute(browser('/api/person/publish', { objeto: { ...object, corpo: { texto: 'minha senha: abc', topicos: [] } } }, { cookie }))
    expect(leak.status).toBe(422)
    expect((await leak.json()).erro.vazamento).toBe('senha')
    const other = await publishRoute(browser('/api/person/publish', { objeto: { ...object, autor: 'rvr_' + 'X'.repeat(22) } }, { cookie }))
    expect(other.status).toBe(403)
    expect((await publishRoute(browser('/api/person/publish', { objeto: object, atestado: { ...att, uid: 'rvr_' + 'X'.repeat(22) } }, { cookie }))).status).toBe(403)
    expect((await publishRoute(browser('/api/person/publish', { objeto: object, aprovacao: {} }, { cookie }))).status).toBe(400)
  })
  it('claiming: the Lex box, a fresh act from Rovemark for the session, handed to the open issuer, and the agent becomes linked', async () => {
    const { cookie } = signedIn()
    recordConsent(PERSON)
    const claim = 'c'.repeat(43)
    const act = { tipo: 'ato-de-dono', acao: 'reivindicar', dono: PERSON }
    const calls = fakes({
      [`${RELAY}/v1/agentes/reivindicacoes/${claim}`]: () => json({ uid: 'rvr_' + 'G'.repeat(22), handle: 'lontra', nome: 'Lontra', plataforma: 'Hermes' }),
      'https://api.rovemark.co/api/auth/app/folgali/owner-act': () => json({ ok: true, act }),
      [`${RELAY}/v1/agentes/atos`]: () => json({ uid: 'rvr_' + 'G'.repeat(22), handle: 'lontra', nome: 'Lontra', situacao: 'liberado', limites: { postagensPorDia: 20, comentariosPorDia: 100 } }),
    })
    expect((await claimRoute(browser('/api/agents/claim', { claim, code: 'PÃO-4721' }, { cookie }))).status).toBe(400)
    const r = await claimRoute(browser('/api/agents/claim', { claim, code: 'PÃO-4721', responsible: true }, { cookie }))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ handle: 'lontra', situacao: 'liberado' })
    expect(calls.find((c) => c.url.endsWith('/owner-act'))).toMatchObject({ auth: `Bearer ${AT}`, body: { action: 'reivindicar', claim, code: 'PÃO-4721' } })
    expect(calls.find((c) => c.url.endsWith('/v1/agentes/atos'))?.body).toEqual({ ato: act })
    expect(linkedOf(PERSON)).toMatchObject([{ id: 'rvr_' + 'G'.repeat(22), tipo: 'agente', nome: 'Lontra', handle: 'lontra', origem: 'Hermes' }])
    // the issuer's refusal reaches the screen with its code
    fakes({
      [`${RELAY}/v1/agentes/reivindicacoes/${claim}`]: () => json({ uid: 'rvr_' + 'G'.repeat(22) }),
      'https://api.rovemark.co/api/auth/app/folgali/owner-act': () => json({ ok: true, act }),
      [`${RELAY}/v1/agentes/atos`]: () => json({ erro: { codigo: 'codigo_incorreto', mensagem: 'x' } }, 403),
    })
    const wrong = await claimRoute(browser('/api/agents/claim', { claim, code: 'SOL-0000', responsible: true }, { cookie }))
    expect(wrong.status).toBe(403)
    expect((await wrong.json()).erro.codigo).toBe('codigo_incorreto')
  })
})

describe('Rovemark brings the Rover Hangar rovers, and the Account Center removes', () => {
  const rover = (c: string) => ({ uid: `rvr_${c.repeat(22)}`, handle: `rover.${c.toLowerCase()}`, name: `Rover ${c}` })
  it('signed, complete list that replaces the previous one and keeps the agents; shown to the Account Center', async () => {
    enable(PERSON, { id: 'rvr_' + 'G'.repeat(22), tipo: 'agente', nome: 'Lontra', ligadoEm: new Date().toISOString() })
    expect((await hangarRovers(signedReq('/api/rovemark/hangar-rovers', { pessoa: PERSON, rovers: [rover('A'), rover('B')] }))).status).toBe(200)
    const first = linkedOf(PERSON).find((x) => x.id === rover('A').uid)?.ligadoEm
    expect(await (await hangarRovers(signedReq('/api/rovemark/hangar-rovers', { pessoa: PERSON, rovers: [rover('A')] }))).json()).toEqual({ ok: true, rovers: 1 })
    expect(linkedOf(PERSON).map((x) => x.id).sort()).toEqual([rover('A').uid, 'rvr_' + 'G'.repeat(22)].sort())
    expect(linkedOf(PERSON).find((x) => x.id === rover('A').uid)).toMatchObject({ tipo: 'rover', nome: 'Rover A', handle: 'rover.a', origem: 'Rover Hangar', ligadoEm: first })
    const center = await (await linked(signedReq('/api/rovemark/ligados', { pessoa: PERSON }))).json()
    expect(center.itens.map((x: { tipo: string }) => x.tipo).sort()).toEqual(['agente', 'rover'])
    // unsigned, wrong secret, bad shape
    expect((await hangarRovers(new NextRequest('https://folgali.com/api/rovemark/hangar-rovers', { method: 'POST', body: '{}' }))).status).toBe(401)
    expect((await hangarRovers(signedReq('/api/rovemark/hangar-rovers', { pessoa: PERSON, rovers: [] }, 'x'.repeat(40)))).status).toBe(401)
    for (const rovers of [[rover('A'), rover('A')], [{ ...rover('C'), email: 'a@b.c' }], [{ ...rover('C'), name: '<b>' }]]) {
      expect((await hangarRovers(signedReq('/api/rovemark/hangar-rovers', { pessoa: PERSON, rovers }))).status).toBe(400)
    }
  })
  it('removing an agent hands the act to the open issuer; an act for another agent or person is refused', async () => {
    const agent = 'rvr_' + 'G'.repeat(22)
    enable(PERSON, { id: agent, tipo: 'agente', nome: 'Lontra', ligadoEm: new Date().toISOString() })
    const act = { tipo: 'ato-de-dono', acao: 'tirar', agente: agent, dono: PERSON }
    const calls = fakes({ [`${RELAY}/v1/agentes/atos`]: () => json({ uid: agent, situacao: 'tirado' }) })
    expect((await remove(signedReq('/api/rovemark/ligados/remover', { pessoa: PERSON, tipo: 'agente', id: agent, ato: { ...act, agente: 'rvr_' + 'H'.repeat(22) } }))).status).toBe(400)
    expect((await remove(signedReq('/api/rovemark/ligados/remover', { pessoa: PERSON, tipo: 'agente', id: agent, ato: { ...act, dono: 'p_outra_pessoa_1234' } }))).status).toBe(400)
    expect(calls).toEqual([])
    const r = await remove(signedReq('/api/rovemark/ligados/remover', { pessoa: PERSON, tipo: 'agente', id: agent, ato: act }))
    expect(await r.json()).toEqual({ ok: true })
    expect(calls).toMatchObject([{ url: `${RELAY}/v1/agentes/atos`, body: { ato: act } }])
    expect(linkedOf(PERSON)).toEqual([])
  })
})
