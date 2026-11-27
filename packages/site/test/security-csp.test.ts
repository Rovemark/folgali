// F-05 of the security review: the site sent no Content-Security-Policy and no HSTS. The person signs with the device key in the browser,
// so one injected script could publish, read messages or ask for an attestation in their name. Now every page carries a policy with a fresh
// nonce (src/proxy.ts, src/lib/security/csp.ts), the two inline scripts of the layout carry it, and next.config.ts sends HSTS.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxy } from '@/proxy'
import { NONCE_RE, contentSecurityPolicy, newNonce } from '@/lib/security/csp'
import { internalMark } from '@/lib/security/internal-mark'
import nextConfig from '../next.config'

afterEach(() => vi.unstubAllGlobals())

const directives = (csp: string) => new Map(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]))
const nonceOf = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? '')?.[1] ?? null

/**
 * What a CSP Level 3 browser does with a script under this policy (script-src, or default-src without it). A script FILE runs when it
 * carries a matching nonce, or, unless 'strict-dynamic' is present (which makes the browser ignore 'self' and hosts), when its origin is
 * allowed ('self' for the same origin). An INLINE script runs when it carries a matching nonce; 'unsafe-inline' only counts when the list
 * has no nonce, hash or 'strict-dynamic'. This is the rule that decides whether Cloudflare's e-mail decoder (same origin, no nonce) runs.
 */
function scriptRuns(csp: string, s: { inline: boolean; sameOrigin?: boolean; nonce?: string }): boolean {
  const d = directives(csp)
  const list = d.get('script-src') ?? d.get('default-src') ?? []
  if (s.nonce !== undefined && list.includes(`'nonce-${s.nonce}'`)) return true
  const strict = list.includes("'strict-dynamic'")
  if (s.inline) return !strict && !list.some((x) => /^'(nonce|sha256|sha384|sha512)-/.test(x)) && list.includes("'unsafe-inline'")
  return !strict && Boolean(s.sameOrigin) && list.includes("'self'")
}

describe('the policy', () => {
  it('runs only scripts with the nonce, and closes framing, plugins, base and foreign forms', () => {
    const n = newNonce()
    const d = directives(contentSecurityPolicy(n))
    expect(d.get('script-src')).toEqual(["'self'", `'nonce-${n}'`])
    expect(d.get('frame-ancestors')).toEqual(["'none'"])
    expect(d.get('object-src')).toEqual(["'none'"])
    expect(d.get('base-uri')).toEqual(["'none'"])
    expect(d.get('form-action')).toEqual(["'self'"])
    expect(d.get('default-src')).toEqual(["'self'"])
    // the network image (/midia/<hash>) and the brand art are the site's own; blob: is the local preview before sending
    expect(d.get('img-src')).toEqual(["'self'", 'data:', 'blob:'])
    expect(d.get('media-src')).toEqual(["'self'", 'blob:'])
    for (const [k, v] of d) expect(v.join(' '), k).not.toMatch(/https?:|\*|'unsafe-eval'/)
    expect(d.get('script-src')).not.toContain("'unsafe-inline'")
  })
  it('a script file of the same origin without a nonce runs (Cloudflare /cdn-cgi, the /_next chunks); an inline script without the nonce does not', () => {
    const n = newNonce()
    for (const dev of [false, true]) {
      const csp = contentSecurityPolicy(n, { dev })
      // Cloudflare's e-mail decoder, injected without a nonce: <script data-cfasync="false" src="/cdn-cgi/scripts/.../email-decode.min.js">
      expect(scriptRuns(csp, { inline: false, sameOrigin: true }), 'same-origin file').toBe(true)
      expect(scriptRuns(csp, { inline: false, sameOrigin: false }), 'file from another domain').toBe(false)
      expect(scriptRuns(csp, { inline: true }), 'inline without nonce').toBe(false)
      expect(scriptRuns(csp, { inline: true, nonce: newNonce() }), 'inline with another nonce').toBe(false)
      expect(scriptRuns(csp, { inline: true, nonce: n }), 'inline with the nonce (theme, vida, Next)').toBe(true)
    }
  })
  it('the evaluator itself bites: with strict-dynamic the Cloudflare decoder would be blocked, with unsafe-inline alone an injected script would run', () => {
    expect(scriptRuns("script-src 'self' 'nonce-AAAAAAAAAAAAAAAAAAAAAA==' 'strict-dynamic'", { inline: false, sameOrigin: true })).toBe(false)
    expect(scriptRuns("script-src 'self' 'unsafe-inline'", { inline: true })).toBe(true)
    expect(scriptRuns("script-src 'self' 'nonce-AAAAAAAAAAAAAAAAAAAAAA==' 'unsafe-inline'", { inline: true })).toBe(false)
  })
  it("adds 'unsafe-eval' only in development", () => {
    expect(contentSecurityPolicy(newNonce(), { dev: true })).toContain("'unsafe-eval'")
    expect(contentSecurityPolicy(newNonce())).not.toContain("'unsafe-eval'")
  })
  it('a nonce is fresh and well formed; anything else is refused', () => {
    const a = newNonce()
    expect(a).toMatch(NONCE_RE)
    expect(newNonce()).not.toBe(a)
    for (const bad of ['', "abc' 'unsafe-inline", 'x'.repeat(24)]) expect(() => contentSecurityPolicy(bad)).toThrow()
  })
})

describe('proxy: every page gets its policy, with a nonce of its own', () => {
  it('the nonce on the response policy is the one handed to the page, and it changes on every request', () => {
    const seen = new Set<string>()
    for (const path of ['/pt', '/pt/linha', '/pt/r/roverluna', '/pt/entrar', '/en/glossario/nao-existe']) {
      const res = proxy(new NextRequest(`https://x.test${path}`))
      const csp = res.headers.get('content-security-policy')
      const n = nonceOf(csp)
      expect(n, path).toMatch(NONCE_RE)
      expect(res.headers.get('x-middleware-request-x-nonce'), path).toBe(n)
      expect(res.headers.get('x-middleware-request-content-security-policy'), path).toBe(csp)
      seen.add(n!)
    }
    expect(seen.size).toBe(5)
  })
  it('a visitor cannot choose the nonce: x-nonce and the 404 nonce header from outside are ignored', () => {
    const fixed = 'AAAAAAAAAAAAAAAAAAAAAA=='
    const res = proxy(new NextRequest('https://x.test/pt/linha', { headers: { 'x-nonce': fixed, 'x-folgali-nonce': fixed } }))
    expect(nonceOf(res.headers.get('content-security-policy'))).not.toBe(fixed)
    expect(res.headers.get('x-middleware-request-x-folgali-nonce')).toBeNull()
  })
  it('the 404 request of the server itself keeps the nonce of the response it serves', () => {
    const outer = 'BBBBBBBBBBBBBBBBBBBBBB=='
    const res = proxy(new NextRequest('https://x.test/pt/nada', { headers: { 'x-folgali-404': internalMark(), 'x-folgali-nonce': outer } }))
    expect(res.status).toBe(404)
    expect(nonceOf(res.headers.get('content-security-policy'))).toBe(outer)
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(outer)
  })
  it('the API, media and files for machines keep their own headers', () => {
    for (const path of ['/api/person/session', '/midia/' + 'a'.repeat(64) + '.webp', '/video/x.mp4', '/robots.txt', '/skill.md']) {
      expect(proxy(new NextRequest(`https://x.test${path}`)).headers.get('content-security-policy'), path).toBeNull()
    }
  })
})

describe('the 404 route hands its nonce to the page it asks for', () => {
  it('the request to this server carries the nonce of the outer response', async () => {
    const got: (string | null)[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit = {}) => {
      got.push(new Headers(init.headers).get('x-folgali-nonce'))
      return new Response('<!DOCTYPE html><header class="top"></header>', { status: 404 })
    })
    const { GET } = await import('@/app/[lang]/[...resto]/route')
    const n = newNonce()
    await GET(new Request('http://x/pt/nada', { headers: { 'x-nonce': n } }), { params: Promise.resolve({ lang: 'pt' }) })
    await GET(new Request('http://x/pt/nada', { headers: { 'x-nonce': "x' 'unsafe-inline" } }), { params: Promise.resolve({ lang: 'pt' }) })
    expect(got).toEqual([n, null])
  })
})

describe('the source', () => {
  it('every executable <script> in the site carries the nonce (JSON-LD is data, not code)', () => {
    const files: string[] = []
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx$/.test(p)) files.push(p)
      }
    }
    walk('src')
    let scripts = 0
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/<script\b[^>]*>/g)) {
        scripts++
        expect(/type="application\/ld\+json"/.test(m[0]) || /nonce=\{nonce\}/.test(m[0]), `${f}: ${m[0]}`).toBe(true)
      }
    }
    expect(scripts).toBeGreaterThanOrEqual(3)
  })
  it('next.config sends HSTS for a year with subdomains, without preload, on every path', async () => {
    const rules = await nextConfig.headers!()
    const all = rules.find((r) => r.source === '/:path*')!
    expect(all.headers).toContainEqual({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' })
    expect(all.headers).toContainEqual({ key: 'X-Frame-Options', value: 'DENY' })
    // 'self' in script-src is only safe because nothing of this origin with people's content can be read as a script: every response
    // carries nosniff (the media routes set it too, with image/* and video/*: test/client/http-image-relay.test.ts)
    expect(all.headers).toContainEqual({ key: 'X-Content-Type-Options', value: 'nosniff' })
  })
})
