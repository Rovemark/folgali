// The folgali side of "Sign in with Rovemark" (contract in rovemark-platform/docs/LOGIN-FOLGALI.md). Pure pieces, no Next:
// PKCE (verifier and S256 challenge), state, cookie seal (AES-256-GCM), the start URL, token exchange and renewal,
// and the signature check of Account Center calls. No secret lives in the code: everything comes from the environment.
import '@/lib/legacy-env'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'folgali_sessao'
/** How long the cookie lives: enough for the Rovemark token family (30 days unused). */
export const COOKIE_LIFETIME_S = 30 * 24 * 3600
/** How long the login request stored in the cookie is valid (the Rovemark request is valid for 10 minutes). */
export const REQUEST_LIFETIME_MS = 10 * 60_000
/** Maximum clock difference accepted on the Account Center signature. */
export const SIGNATURE_TOLERANCE_S = 300

type Environment = Readonly<Record<string, string | undefined>>

export interface ConfigLogin {
  /** base of the Rovemark public API, no trailing slash */
  api: string
  /** the return registered at Rovemark */
  volta: string
  /** secret of the cookie seal and of the token vault (32+ characters) */
  segredo: string
}

const httpsOrLocal = (rawValue: string | undefined): string | null => {
  if (!rawValue) return null
  try {
    const u = new URL(rawValue.trim())
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    return u.protocol === 'https:' || (local && u.protocol === 'http:') ? u.toString().replace(/\/$/, '') : null
  } catch {
    return null
  }
}

/**
 * The login configuration, or `null` when something is missing (the button shows "coming soon"). Variables:
 * `FOLGALI_SESSION_SECRET` (32+ characters), `FOLGALI_ROVEMARK_API` (default https://api.rovemark.co) and
 * `FOLGALI_ROVEMARK_RETURN` (default https://folgali.com/api/auth/rovemark/callback).
 */
export function configLogin(env: Environment = process.env): ConfigLogin | null {
  const secret = env.FOLGALI_SESSION_SECRET ?? ''
  if (secret.length < 32) return null
  const api = httpsOrLocal(env.FOLGALI_ROVEMARK_API ?? 'https://api.rovemark.co')
  const back = httpsOrLocal(env.FOLGALI_ROVEMARK_RETURN ?? 'https://folgali.com/api/auth/rovemark/callback')
  if (!api || !back) return null
  return { api, volta: back, segredo: secret }
}

const b64url = (b: Buffer) => b.toString('base64url')

/** PKCE verifier: 64 characters of [A-Za-z0-9_-], within the 43 to 128 that Rovemark accepts. */
export const newVerifier = () => b64url(randomBytes(48))
/** State: 32 characters of [A-Za-z0-9_-]. */
export const newState = () => b64url(randomBytes(24))
/** Desafio S256: base64url(sha256(verificador)), 43 caracteres. */
export const challengeS256 = (verifier: string) => b64url(createHash('sha256').update(verifier).digest())

export const STATE_RE = /^[A-Za-z0-9_-]{8,128}$/
export const CODE_RE = /^[A-Za-z0-9_-]{20,128}$/

/** The destination after signing in: only a path of the site itself, with language. Anything else becomes the feed. */
export function safeTarget(x: string | null | undefined, lang = 'pt'): string {
  if (x && /^\/[a-z]{2}(\/[A-Za-z0-9_\-/]*)?$/.test(x) && !x.startsWith('//')) return x
  return `/${lang}/linha`
}

/** Login start URL at Rovemark. */
export function startUrl(c: ConfigLogin, challenge: string, state: string, create: boolean): string {
  const u = new URL(`${c.api}/api/auth/oauth/rovemark/start`)
  u.searchParams.set('app', 'folgali')
  u.searchParams.set('volta', c.volta)
  u.searchParams.set('desafio', challenge)
  u.searchParams.set('estado', state)
  if (create) u.searchParams.set('tela', 'criar')
  return u.toString()
}

// ---- seal (AES-256-GCM): the cookie and the tokens kept on the server ----------------------------------------------

const key = (secret: string, usage: string) => createHash('sha256').update(`folgali:${usage}:${secret}`).digest()

export function seal(datum: unknown, secret: string, usage = 'cookie'): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(secret, usage), iv)
  const body = Buffer.concat([c.update(JSON.stringify(datum), 'utf8'), c.final()])
  return b64url(Buffer.concat([iv, c.getAuthTag(), body]))
}

export function openAction<T>(sealed: string | undefined | null, secret: string, usage = 'cookie'): T | null {
  if (!sealed || sealed.length > 4096) return null
  try {
    const b = Buffer.from(sealed, 'base64url')
    if (b.length < 29) return null
    const d = createDecipheriv('aes-256-gcm', key(secret, usage), b.subarray(0, 12))
    d.setAuthTag(b.subarray(12, 28))
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')) as T
  } catch {
    return null
  }
}

/** What the cookie carries, always sealed: the login request in progress and/or the session (only the id; the tokens stay on the server). */
export interface CookieContent {
  login?: { verificador: string; estado: string; destino: string; em: number }
  sid?: string
}

export const equal = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// ---- fichas ----------------------------------------------------------------------------------------------------------

export interface Tokens {
  access_token: string
  refresh_token: string
  expires_in: number
  pessoa: { id: string; nome: string }
}

export class AccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
  ) {
    super(`rovemark ${status} ${codigo}`)
  }
}

const PERSON_RE = /^p_[A-Za-z0-9_-]{4,80}$/

function tokensFrom(x: unknown): Tokens {
  const o = (x ?? {}) as Record<string, unknown>
  const p = (o.pessoa ?? {}) as Record<string, unknown>
  const at = typeof o.access_token === 'string' && o.access_token.startsWith('rmapp_at_') ? o.access_token : null
  const rt = typeof o.refresh_token === 'string' && o.refresh_token.startsWith('rmapp_rt_') ? o.refresh_token : null
  const id = typeof p.id === 'string' && PERSON_RE.test(p.id) ? p.id : null
  if (!at || !rt || !id) throw new AccessError(502, 'resposta_invalida')
  const name = typeof p.nome === 'string' ? p.nome.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) : ''
  const exp = typeof o.expires_in === 'number' && o.expires_in > 0 ? Math.min(o.expires_in, 3600) : 900
  return { access_token: at, refresh_token: rt, expires_in: exp, pessoa: { id, nome: name || 'você' } }
}

type FetchFn = typeof fetch

async function publishPost(c: ConfigLogin, path: string, body: unknown, fetchFn: FetchFn): Promise<unknown> {
  const r = await fetchFn(`${c.api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new AccessError(r.status, typeof json.codigo === 'string' ? json.codigo : 'erro')
  return json
}

/** Exchanges the return code for tokens (server to server). */
export async function exchangeCode(c: ConfigLogin, code: string, verifier: string, fetchFn: FetchFn = fetch): Promise<Tokens> {
  return tokensFrom(await publishPost(c, '/api/auth/app/exchange', { codigo: code, verificador: verifier }, fetchFn))
}

/** Renews: the old token dies and a new pair comes. 401 means the person removed access (or there was reuse). */
export async function renew(c: ConfigLogin, refresh: string, fetchFn: FetchFn = fetch): Promise<Tokens> {
  return tokensFrom(await publishPost(c, '/api/auth/app/refresh', { refresh_token: refresh }, fetchFn))
}

/** Sign out: Rovemark drops the whole family. Always answers 200; a network failure does not stop deleting the session here. */
export async function revoke(c: ConfigLogin, token: string, fetchFn: FetchFn = fetch): Promise<void> {
  await publishPost(c, '/api/auth/app/revoke', { token: token }, fetchFn).catch(() => undefined)
}

// ---- Account Center signature ---------------------------------------------------------------------------------

/** `RVM_FOLGALI_SECRET` (32+ characters), the same as the Rovemark API. Without it, the Account Center routes answer 503. */
export function centralSecret(env: Environment = process.env): string | null {
  const s = env.RVM_FOLGALI_SECRET ?? ''
  return s.length >= 32 ? s : null
}

/** `t=<unix s>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`, compared in constant time, with at most 5 minutes of difference. */
export function validSignature(header: string | null, rawBody: string, secret: string, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!header || header.length > 512) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]))
  const t = Number(parts.t)
  const v1 = parts.v1
  if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) return false
  if (Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return equal(expected, v1)
}

export const LINKED_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/
export const isPerson = (x: unknown): x is string => typeof x === 'string' && PERSON_RE.test(x)
