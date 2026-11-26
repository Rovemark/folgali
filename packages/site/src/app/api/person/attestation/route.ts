// The browser generated the device key (WebCrypto, not extractable) and asks for the person attestation: this server asks
// Rovemark with the person's limited access and hands the signed attestation back. The private key never comes here.
import type { NextRequest } from 'next/server'
import { NOT_READY, NO_CONSENT, SIGNED_OUT, answer, isFailure, jsonBody, refuse } from '@/lib/folgali/api'
import { consentOf } from '@/lib/folgali/vault'
import { IssuerFailure, attestationFromRovemark, issuersReady } from '@/lib/folgali/issuers'
import { accessFromRequest } from '@/lib/folgali/session'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ready = issuersReady()
  if (!ready) return refuse(NOT_READY)
  const body = await jsonBody(req, 1024)
  if (isFailure(body)) return refuse(body)
  const who = await accessFromRequest(req)
  if (!who) return refuse(SIGNED_OUT)
  if (!consentOf(who.pessoa)) return refuse(NO_CONSENT)
  const { key, handle } = body
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key) || (handle !== undefined && typeof handle !== 'string')) {
    return refuse({ status: 400, code: 'corpo', message: 'O pedido não tem a forma esperada.' })
  }
  try {
    const r = await attestationFromRovemark(ready.login, who.pessoa, who.at, { key, ...(handle ? { handle } : {}) })
    return answer(r)
  } catch (e) {
    if (e instanceof IssuerFailure) return refuse(e.failure)
    return refuse({ status: 502, code: 'rovemark', message: 'A Rovemark não respondeu. Tente de novo.' })
  }
}
