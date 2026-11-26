// Sign out: revokes the family at Rovemark, deletes the session from the vault and the cookie. POST (form), so a link cannot sign anyone out.
import { NextResponse, type NextRequest } from 'next/server'
import { urlBase } from '@/lib/site'
import { deleteSession, tokensOf, readSession } from '@/lib/folgali/vault'
import { configLogin, revoke } from '@/lib/folgali/login'
import { deleteFromResponse, readFromRequest } from '@/lib/folgali/session'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const c = configLogin()
  const lang = /^[a-z]{2}$/.test(req.nextUrl.searchParams.get('lang') ?? '') ? req.nextUrl.searchParams.get('lang')! : 'pt'
  const res = NextResponse.redirect(new URL(`/${lang}`, urlBase() + '/'), 303)
  if (c) {
    const sid = readFromRequest(req, c).sid
    const s = sid ? readSession(sid) : null
    const f = s ? tokensOf(s, c.segredo) : null
    if (f) await revoke(c, f.rt)
    if (sid) deleteSession(sid)
  }
  deleteFromResponse(res)
  return res
}
