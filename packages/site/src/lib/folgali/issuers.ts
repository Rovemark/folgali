import 'server-only'
// What the site's server asks Rovemark (the folgali issuers, rovemark-platform/docs/LOGIN-FOLGALI.md) and passes on to the relay
// and to the open issuer. Rovemark signs; the site never holds a signing key:
//   - the OWNER ACT (protocol 0.6) for a claim, signed for the person behind the session and handed to the open issuer;
//   - the PERSON ATTESTATION (protocol 0.7) for the device key the browser generated, handed back to the browser.
// The Rovemark access (rmapp_at_) stays on this server. Base addresses come from the environment:
//   FOLGALI_RELAY_URL  the relay root (the real mode, FOLGALI_CLIENT=http)
//   FOLGALI_ISSUER_URL     the open issuer root, when it is not behind the relay's domain (default: the relay root, as in production)
import '@/lib/legacy-env'
import { configLogin, type ConfigLogin } from './login'

type Env = Readonly<Record<string, string | undefined>>

const root = (raw: string | undefined): string | null => {
  if (!raw) return null
  try {
    const u = new URL(raw.trim())
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    return u.protocol === 'https:' || (local && u.protocol === 'http:') ? u.origin : null
  } catch {
    return null
  }
}

/** The relay root in the real mode, or null (demonstration: nothing is written anywhere). */
export const relayBase = (env: Env = process.env): string | null => (env.FOLGALI_CLIENT === 'http' ? root(env.FOLGALI_RELAY_URL) : null)
/** The open issuer root: FOLGALI_ISSUER_URL, or the relay's domain (production proxies /v1/agentes to the issuer). */
export const issuerBase = (env: Env = process.env): string | null => (relayBase(env) ? root(env.FOLGALI_ISSUER_URL) ?? relayBase(env) : null)

/** Writing as a person and claiming need the login, the relay and Rovemark. */
export function issuersReady(env: Env = process.env): { login: ConfigLogin; relay: string; issuer: string } | null {
  const login = configLogin(env)
  const relay = relayBase(env)
  const issuer = issuerBase(env)
  return login && relay && issuer ? { login, relay, issuer } : null
}

export interface Failure {
  status: number
  code: string
  message: string
  extra?: Record<string, unknown>
}

/** One answer shape for the browser: `{ erro: { codigo, mensagem, ... } }`, as the relay answers. */
export function failureBody(f: Failure) {
  return { erro: { codigo: f.code, mensagem: f.message, ...(f.extra ?? {}) } }
}

async function call(url: string, init: RequestInit, fetchFn: typeof fetch): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetchFn(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) })
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
  return { status: r.status, json }
}

/** Reads `{ error, codigo }` (Rovemark) or `{ erro: { codigo, mensagem } }` (relay and open issuer) into a Failure. */
export function failureOf(status: number, json: Record<string, unknown>): Failure {
  const e = (json.erro ?? null) as Record<string, unknown> | null
  if (e && typeof e.codigo === 'string') {
    const { codigo: code, mensagem: message, ...extra } = e
    return { status, code: code, message: typeof message === 'string' ? message : '', extra }
  }
  return { status, code: typeof json.codigo === 'string' ? json.codigo : 'erro', message: typeof json.error === 'string' ? json.error : '' }
}

export class IssuerFailure extends Error {
  constructor(public readonly failure: Failure) {
    super(`${failure.status} ${failure.code}`)
  }
}

async function rovemark(c: ConfigLogin, at: string, method: 'GET' | 'POST', path: string, body: unknown, fetchFn: typeof fetch) {
  const r = await call(`${c.api}${path}`, {
    method,
    headers: { authorization: `Bearer ${at}`, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, fetchFn)
  if (r.status !== 200) throw new IssuerFailure(failureOf(r.status, r.json))
  return r.json
}

// uid per person, learnt from Rovemark (derived there, stable): the server checks that an envelope is the person's own
const uids = new Map<string, string>()
export const knownUid = (person: string) => uids.get(person) ?? null
const UID_RE = /^rvr_[A-Za-z0-9_-]{22}$/

export interface PersonState {
  uid: string
  handle: string | null
  adult: boolean | null
}

/** The person on folgali as Rovemark sees it: the derived uid and the last @ (null before the first attestation). */
export async function personFromRovemark(c: ConfigLogin, person: string, at: string, fetchFn: typeof fetch = fetch): Promise<PersonState> {
  const j = await rovemark(c, at, 'GET', '/api/auth/app/folgali/person', undefined, fetchFn)
  if (typeof j.uid !== 'string' || !UID_RE.test(j.uid)) throw new IssuerFailure({ status: 502, code: 'resposta_invalida', message: '' })
  uids.set(person, j.uid)
  return { uid: j.uid, handle: typeof j.handle === 'string' ? j.handle : null, adult: typeof j.adult === 'boolean' ? j.adult : null }
}

/** Asks Rovemark for the person attestation of this device key. */
export async function attestationFromRovemark(c: ConfigLogin, person: string, at: string, input: { key: string; handle?: string }, fetchFn: typeof fetch = fetch) {
  const j = await rovemark(c, at, 'POST', '/api/auth/app/folgali/person-attestation', input, fetchFn)
  const a = j.attestation as Record<string, unknown> | undefined
  if (!a || a.tipo !== 'atestado-pessoa' || typeof a.uid !== 'string' || !UID_RE.test(a.uid) || a.chave !== input.key) {
    throw new IssuerFailure({ status: 502, code: 'resposta_invalida', message: '' })
  }
  uids.set(person, a.uid)
  return { attestation: a, uid: a.uid, handle: String(a.handle) }
}

/** Asks Rovemark to sign an owner act for the person (the owner comes from the access, never from here). */
export async function ownerActFromRovemark(c: ConfigLogin, at: string, input: Record<string, unknown>, fetchFn: typeof fetch = fetch) {
  const j = await rovemark(c, at, 'POST', '/api/auth/app/folgali/owner-act', input, fetchFn)
  const act = j.act as Record<string, unknown> | undefined
  if (!act || act.tipo !== 'ato-de-dono') throw new IssuerFailure({ status: 502, code: 'resposta_invalida', message: '' })
  return act
}

/** Hands an owner act to the open issuer. Returns its answer as is. */
export async function deliverOwnerAct(issuer: string, act: Record<string, unknown>, fetchFn: typeof fetch = fetch) {
  return call(`${issuer}/v1/agentes/atos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ato: act }) }, fetchFn)
}

/** The public data of a claim link, before login (never the code). */
export async function claimInfo(issuer: string, secret: string, fetchFn: typeof fetch = fetch) {
  return call(`${issuer}/v1/agentes/reivindicacoes/${encodeURIComponent(secret)}`, { method: 'GET', headers: { accept: 'application/json' } }, fetchFn)
}

/** The head of the person's chain on the relay (`cabeca`), whether a profile was published, and the profile name. */
export async function headOnRelay(relay: string, uid: string, fetchFn: typeof fetch = fetch): Promise<{ head: string | null; profile: boolean; name: string | null; body: Record<string, unknown> | null }> {
  const r = await call(`${relay}/v1/rovers/${uid}`, { method: 'GET', headers: { accept: 'application/json' } }, fetchFn)
  if (r.status === 404) return { head: null, profile: false, name: null, body: null }
  if (r.status !== 200) throw new IssuerFailure(failureOf(r.status, r.json))
  // the body of the current profile object, for the editor: a new profile replaces the old one as a whole, so it starts from this
  const profile = r.json.perfil as { corpo?: unknown } | null | undefined
  const body = profile && typeof profile.corpo === 'object' && profile.corpo !== null && !Array.isArray(profile.corpo) ? (profile.corpo as Record<string, unknown>) : null
  return { head: typeof r.json.cabeca === 'string' ? r.json.cabeca : null, profile: typeof r.json.perfilId === 'string', name: typeof r.json.nome === 'string' ? r.json.nome : null, body }
}

/** A GET on the relay with a read credential the BROWSER signed for exactly this path (nothing is signed here). */
export async function readOnRelayAs(relay: string, path: string, credential: string, fetchFn: typeof fetch = fetch) {
  return call(`${relay}${path}`, { method: 'GET', headers: { accept: 'application/json', authorization: credential } }, fetchFn)
}

/** Carries the envelope the browser signed to the relay, untouched. */
export async function publishOnRelay(relay: string, envelope: unknown, fetchFn: typeof fetch = fetch) {
  return call(`${relay}/v1/objetos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope) }, fetchFn)
}

/** Carries a GET the browser signed as the person (`Rover-Assinatura`) to the relay, untouched (src/app/api/person/read). */
export async function readOnRelay(relay: string, path: string, auth: string, fetchFn: typeof fetch = fetch) {
  return call(`${relay}${path}`, { method: 'GET', headers: { accept: 'application/json', authorization: auth } }, fetchFn)
}
