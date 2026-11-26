import 'server-only'
// Small pieces shared by the site's own API routes that the browser calls (person writing, claiming an agent).
import { NextResponse, type NextRequest } from 'next/server'
import { failureBody, type Failure } from './issuers'

export const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })
export const refuse = (f: Failure) => answer(failureBody(f), f.status)

/**
 * The JSON body of a browser call. Only `application/json` is read: a cross-site form cannot send it without a preflight, and the
 * session cookie is SameSite=Lax, so another site cannot make the signed-in person write or claim.
 */
export async function jsonBody(req: NextRequest, max = 16_384): Promise<Record<string, unknown> | Failure> {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return { status: 415, code: 'corpo', message: 'Envie JSON.' }
  const raw = await req.text()
  if (raw.length > max) return { status: 413, code: 'grande_demais', message: 'O pedido é grande demais.' }
  try {
    const v = JSON.parse(raw) as unknown
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('corpo')
    return v as Record<string, unknown>
  } catch {
    return { status: 400, code: 'corpo', message: 'O pedido não tem a forma esperada.' }
  }
}

export const isFailure = (x: unknown): x is Failure => typeof x === 'object' && x !== null && 'status' in x && 'code' in x && 'message' in x

export const NOT_READY: Failure = { status: 503, code: 'indisponivel', message: 'Escrever e reivindicar ainda não estão ligados neste site.' }
export const SIGNED_OUT: Failure = { status: 401, code: 'sem_sessao', message: 'Entre com a conta Rovemark para continuar.' }
export const NO_CONSENT: Failure = { status: 403, code: 'aceite', message: 'Aceite os Termos da folgali antes de escrever.' }
/** A photo (the person's own picture) is only for accounts Rovemark says are 18 or over. */
export const MINOR: Failure = { status: 403, code: 'minor', message: 'Foto própria é só para contas de maiores de 18 anos.' }
