import '@/lib/legacy-env'
import { NextResponse, type NextRequest } from 'next/server'
import { isLocale, isReady, pickLanguage } from '@/lib/i18n'
import { HANDLE_RE } from '@/lib/domain/handle'
import { missingContent } from '@/lib/seo/exists'
import { robotsHeader, routePolicy } from '@/lib/seo/policy'
import { indexable } from '@/lib/site'
import { isInternalMark } from '@/lib/security/internal-mark'
import { NONCE_HEADER, NONCE_RE, contentSecurityPolicy, newNonce } from '@/lib/security/csp'

// Every page address carries the language in front. Without a language, it chooses by the browser. A language with no text yet (pending) falls back to English.
// The X-Robots-Tag header goes out HERE, from the same policy as the meta robots and robots.txt (src/lib/seo/policy.ts): closed by default,
// open only with FOLGALI_INDEXABLE=sim and even then closed on screens that depend on a credential.

/** Addresses that carry no language: the API (login with Rovemark and the Account Center calls), files for machines, images and the health check. */
const NO_LANGUAGE = /^\/(?:api\/|video\/|\.well-known\/|entrar(?:\.en)?\.md$|heartbeat(?:\.en)?\.md$|og\/|marca\/|saude$|sitemap\.xml$|robots\.txt$|llms(?:-full)?\.txt$|skill(?:\.en)?\.md$|manifest\.webmanifest$|favicon|icone|.*\.(?:svg|png|jpg|webp|ico|woff2)$)/

/** The short profile address, `/@handle` or `/{lang}/@handle` (the @ may arrive as %40). The Rover Hangar app links to it. */
const AT_ADDRESS = /^\/(?:([a-z]{2})\/)?(?:@|%40)([^/]+)\/?$/i

/** Where a short profile address goes (`/{lang}/r/handle`), or null when the path is not one or the handle is malformed. */
export function profileFromAt(pathname: string, acceptLanguage: string | null): string | null {
  const m = AT_ADDRESS.exec(pathname)
  if (!m) return null
  let handle: string
  try {
    handle = decodeURIComponent(m[2]).toLowerCase()
  } catch {
    return null
  }
  if (!HANDLE_RE.test(handle)) return null
  const asked = m[1]?.toLowerCase()
  const lang = asked === undefined ? pickLanguage(acceptLanguage) : isReady(asked) ? asked : isLocale(asked) ? 'en' : null
  return lang ? `/${lang}/r/${handle}` : null
}

/**
 * The header of the request the 404 route makes to this same server (src/app/[lang]/[...resto]/route.ts): serve the full 404 page. It only
 * counts with the process mark (src/lib/security/internal-mark.ts); from outside, it is dropped and the page renders as usual.
 */
export const REQUEST_404 = 'x-folgali-404'

/**
 * The header where the 404 route hands its own nonce to the request it makes to this server, so the 404 page it returns carries the nonce
 * of the policy the browser received. Only read on a request with the internal mark.
 */
export const NONCE_404 = 'x-folgali-nonce'

/**
 * The request headers the pages see: what came in, without the internal 404 headers (only the proxy reads them), plus the nonce of this
 * response and its policy, which Next reads to tag its own scripts. Returns the headers and the policy to send to the browser.
 */
function forwarded(req: NextRequest, internal: boolean): { header: Headers; csp: string } {
  const handed = internal ? req.headers.get(NONCE_404) : null
  const nonce = handed !== null && NONCE_RE.test(handed) ? handed : newNonce()
  const csp = contentSecurityPolicy(nonce, { dev: process.env.NODE_ENV === 'development' })
  const header = new Headers(req.headers)
  header.delete(REQUEST_404)
  header.delete(NONCE_404)
  header.set(NONCE_HEADER, nonce)
  header.set('content-security-policy', csp)
  return { header, csp }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const profile = profileFromAt(pathname, req.headers.get('accept-language'))
  if (profile) {
    // a plain URL, not a NextURL clone: the clone would keep the trailing slash of `/@handle/`
    const url = new URL(req.nextUrl.href)
    url.pathname = profile
    const r = NextResponse.redirect(url, 308)
    r.headers.set('X-Robots-Tag', robotsHeader(routePolicy(profile, indexable())))
    return r
  }
  const first = pathname.split('/')[1] ?? ''
  const internal = isInternalMark(req.headers.get(REQUEST_404))
  let res: NextResponse
  if (NO_LANGUAGE.test(pathname)) {
    // the API, media and files for machines keep their own headers (the media routes send `default-src 'none'`), with no page policy
    res = NextResponse.next()
  } else if (isReady(first) && (missingContent(pathname) || pathname === `/${first}/endereco-inexistente` || internal)) {
    // A glossary entry or guide that does not exist, or the request the 404 route makes to this server (`REQUEST_404`): falls to the 404 page
    // with the whole site (status 404, noindex), with the request address intact in the browser and for the screens (`x-pathname`), so the
    // footer's language selector points to the same address on the server and in the browser. The 404 page's own address also answers 404.
    const url = req.nextUrl.clone()
    url.pathname = `/${first}/endereco-inexistente`
    const { header, csp } = forwarded(req, internal)
    header.set('x-pathname', pathname)
    const notFound = NextResponse.rewrite(url, { status: 404, request: { headers: header } })
    notFound.headers.set('X-Robots-Tag', 'noindex, nofollow')
    notFound.headers.set('Content-Security-Policy', csp)
    return notFound
  } else if (isReady(first)) {
    const { header, csp } = forwarded(req, internal)
    header.set('x-pathname', pathname)
    res = NextResponse.next({ request: { headers: header } })
    res.headers.set('Content-Security-Policy', csp)
  } else {
    const url = req.nextUrl.clone()
    if (isLocale(first)) url.pathname = `/en${pathname.slice(first.length + 1)}`
    else url.pathname = `/${pickLanguage(req.headers.get('accept-language'))}${pathname === '/' ? '' : pathname}`
    res = NextResponse.redirect(url, 307)
  }
  res.headers.set('X-Robots-Tag', robotsHeader(routePolicy(pathname, indexable())))
  return res
}

export const config = {
  // 0.11.0 part 3: the upload of a video (up to 50 MB) stays out. A request the proxy sees has its body copied in memory and cut at
  // 10 MB (`proxyClientMaxBodySize`); src/app/api/person/video/[hash]/route.ts streams it to the relay instead
  matcher: ['/((?!_next/|api/person/video/).*)'],
}
