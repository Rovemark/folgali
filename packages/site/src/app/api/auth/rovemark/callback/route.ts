// The return from Rovemark: checks the state against the cookie BEFORE anything else, exchanges the code for tokens (server to server),
// stores the tokens in the server vault and leaves only the session id in the cookie.
import { NextResponse, type NextRequest } from 'next/server'
import { urlBase } from '@/lib/site'
import { newSid, saveSession } from '@/lib/folgali/vault'
import { CODE_RE, STATE_RE, REQUEST_LIFETIME_MS, configLogin, equal, exchangeCode } from '@/lib/folgali/login'
import { writeToResponse, readFromRequest } from '@/lib/folgali/session'

export const dynamic = 'force-dynamic'

const to = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, urlBase() + '/'), 303)

export async function GET(req: NextRequest) {
  const c = configLogin()
  if (!c) return to(req, '/pt/entrar')
  const q = req.nextUrl.searchParams
  const content = readFromRequest(req, c)
  const request = content.login
  const lang = request?.destino.slice(1, 3) ?? 'pt'
  const state = q.get('estado') ?? ''
  const valid = !!request && STATE_RE.test(state) && equal(state, request.estado) && Date.now() - request.em < REQUEST_LIFETIME_MS
  const without = { sid: content.sid }
  if (!valid) {
    const res = to(req, `/${lang}/entrar?erro=pedido`)
    writeToResponse(res, without, c)
    return res
  }
  if (q.get('erro')) {
    const res = to(req, `/${lang}/entrar?erro=cancelado`)
    writeToResponse(res, without, c)
    return res
  }
  const code = q.get('codigo') ?? ''
  try {
    if (!CODE_RE.test(code)) throw new Error('codigo')
    const f = await exchangeCode(c, code, request.verificador)
    const sid = newSid()
    saveSession(sid, { pessoa: f.pessoa.id, nome: f.pessoa.nome, fichas: { at: f.access_token, rt: f.refresh_token }, venceEm: Date.now() + f.expires_in * 1000 }, c.segredo)
    const res = to(req, request.destino)
    writeToResponse(res, { sid }, c)
    return res
  } catch {
    const res = to(req, `/${lang}/entrar?erro=troca`)
    writeToResponse(res, without, c)
    return res
  }
}
