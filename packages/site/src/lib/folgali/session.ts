import 'server-only'
// The ONLY place on the site that reads or writes a cookie (test/site-privacy.test.ts enforces it). A single cookie, `folgali_sessao`:
// essential, httpOnly, Secure, SameSite=Lax, sealed with AES-256-GCM. It carries the login request in progress (PKCE verifier,
// state, destination) and/or the session id; the Rovemark tokens stay on the server (vault.ts), never in the browser.
// No tracking, ads or metrics.
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'
import { deleteSession, tokensOf, readSession, saveSession } from './vault'
import { SESSION_COOKIE, AccessError, COOKIE_LIFETIME_S, openAction, configLogin, renew, seal, type ConfigLogin, type CookieContent } from './login'

export const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const

export function readFromRequest(req: NextRequest, c: ConfigLogin): CookieContent {
  return openAction<CookieContent>(req.cookies.get(SESSION_COOKIE)?.value, c.segredo) ?? {}
}

export function writeToResponse(res: NextResponse, content: CookieContent, c: ConfigLogin) {
  res.cookies.set(SESSION_COOKIE, seal(content, c.segredo), { ...COOKIE_OPTIONS, maxAge: COOKIE_LIFETIME_S })
}

export function deleteFromResponse(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 })
}

// Renewal serialized per session: two renewals in parallel with the same token would drop the whole family.
const renewing = new Map<string, Promise<boolean>>()

/** Ensures a valid access token for the session, renewing if less than a minute is left. false = the session is over. */
export async function keepAlive(sid: string, c: ConfigLogin, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const s = readSession(sid)
  if (!s) return false
  if (s.venceEm - Date.now() > 60_000) return true
  const inProgress = renewing.get(sid)
  if (inProgress) return inProgress
  const p = (async () => {
    const f = tokensOf(s, c.segredo)
    if (!f) {
      deleteSession(sid)
      return false
    }
    try {
      const newItems = await renew(c, f.rt, fetchFn)
      saveSession(sid, { pessoa: newItems.pessoa.id, nome: newItems.pessoa.nome, fichas: { at: newItems.access_token, rt: newItems.refresh_token }, venceEm: Date.now() + newItems.expires_in * 1000 }, c.segredo)
      return true
    } catch (e) {
      // 401: the person removed folgali in the Account Center, signed out, changed the password or there was reuse. Network down: the session continues until the next attempt.
      if (e instanceof AccessError && (e.status === 401 || e.status === 403)) {
        deleteSession(sid)
        return false
      }
      return true
    }
  })().finally(() => renewing.delete(sid))
  renewing.set(sid, p)
  return p
}

export interface SignedInPerson {
  id: string
  nome: string
}

/** Who signed in, for the pages (Server Components). No configuration, no cookie or with an ended session: null. */
export async function currentPerson(): Promise<SignedInPerson | null> {
  const c = configLogin()
  if (!c) return null
  const content = openAction<CookieContent>((await cookies()).get(SESSION_COOKIE)?.value, c.segredo)
  if (!content?.sid) return null
  if (!(await keepAlive(content.sid, c))) return null
  const s = readSession(content.sid)
  return s ? { id: s.pessoa, nome: s.nome } : null
}

export interface PersonAccess {
  /** the person's id on folgali (p_...) */
  pessoa: string
  nome: string
  /** the limited access token (rmapp_at_), only for server-to-server calls to Rovemark; never sent to the browser */
  at: string
}

/**
 * For the site's own API routes (Route Handlers): who is signed in and the current Rovemark access, renewing it when needed.
 * null without login configuration, without cookie or with the session ended.
 */
export async function accessFromRequest(req: NextRequest, fetchFn: typeof fetch = fetch): Promise<PersonAccess | null> {
  const c = configLogin()
  if (!c) return null
  const sid = readFromRequest(req, c).sid
  if (!sid || !(await keepAlive(sid, c, fetchFn))) return null
  const s = readSession(sid)
  const f = s ? tokensOf(s, c.segredo) : null
  return s && f ? { pessoa: s.pessoa, nome: s.nome, at: f.at } : null
}
