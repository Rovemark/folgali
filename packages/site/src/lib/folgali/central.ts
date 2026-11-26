import 'server-only'
// The routes the Rovemark Account Center calls (server to server), all signed with x-rvm-assinatura.
import { NextResponse, type NextRequest } from 'next/server'
import { validSignature, centralSecret } from './login'

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** Reads the raw body, checks the signature and returns the JSON; or the ready error response (503 no secret, 401 signature, 400 body). */
export async function signedBody(req: NextRequest): Promise<{ ok: true; corpo: Record<string, unknown> } | { ok: false; res: NextResponse }> {
  const secret = centralSecret()
  if (!secret) return { ok: false, res: reply({ ok: false, error: 'indisponivel' }, 503) }
  const raw = await req.text()
  if (raw.length > 16_384) return { ok: false, res: reply({ ok: false, error: 'grande_demais' }, 413) }
  if (!validSignature(req.headers.get('x-rvm-assinatura'), raw, secret)) return { ok: false, res: reply({ ok: false, error: 'assinatura_invalida' }, 401) }
  try {
    const body = JSON.parse(raw) as unknown
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('corpo')
    return { ok: true, corpo: body as Record<string, unknown> }
  } catch {
    return { ok: false, res: reply({ ok: false, error: 'corpo_invalido' }, 400) }
  }
}

export { reply }
