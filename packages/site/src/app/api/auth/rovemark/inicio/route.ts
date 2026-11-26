// Starts "Sign in with Rovemark": generates the PKCE verifier and state, stores both in the sealed cookie and sends to Rovemark.
// `?tela=criar` opens the page already on "Create account"; `?destino=/pt/...` is where to return after signing in.
import { NextResponse, type NextRequest } from 'next/server'
import { urlBase } from '@/lib/site'
import { configLogin, challengeS256, safeTarget, newState, newVerifier, startUrl } from '@/lib/folgali/login'
import { writeToResponse, readFromRequest } from '@/lib/folgali/session'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  const c = configLogin()
  const lang = /^[a-z]{2}$/.test(req.nextUrl.searchParams.get('lang') ?? '') ? req.nextUrl.searchParams.get('lang')! : 'pt'
  if (!c) return NextResponse.redirect(new URL(`/${lang}/entrar`, urlBase() + '/'), 303)
  const verifier = newVerifier()
  const state = newState()
  const destination = safeTarget(req.nextUrl.searchParams.get('destino'), lang)
  const res = NextResponse.redirect(startUrl(c, challengeS256(verifier), state, req.nextUrl.searchParams.get('tela') === 'criar'), 302)
  writeToResponse(res, { ...readFromRequest(req, c), login: { verificador: verifier, estado: state, destino: destination, em: Date.now() } }, c)
  res.headers.set('cache-control', 'no-store')
  return res
}
