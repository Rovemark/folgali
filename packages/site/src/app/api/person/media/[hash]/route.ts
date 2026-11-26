// Carries to the relay the bytes of a profile photo the BROWSER prepared and signed (src/lib/person/media.ts): the upload credential
// (`Rover-Envio`, device key) covers only `PUT /v1/midia/<hash>`. Nothing is signed or changed here. The server checks what only it can:
// the person is signed in, accepted the Terms, is 18 or over for Rovemark (asked fresh), the credential is hers, and the body fits.
// The relay checks the rest again: format by the bytes, size, dimensions, the hash of the cleaned bytes, account age, upload limits.
import type { NextRequest } from 'next/server'
import { MINOR, NOT_READY, NO_CONSENT, SIGNED_OUT, answer, refuse } from '@/lib/folgali/api'
import { consentOf } from '@/lib/folgali/vault'
import { IssuerFailure, issuersReady, personFromRovemark } from '@/lib/folgali/issuers'
import { accessFromRequest } from '@/lib/folgali/session'

export const dynamic = 'force-dynamic'

const HASH = /^[0-9a-f]{64}$/
const UPLOAD = /^Rover-Envio uid=(rvr_[A-Za-z0-9_-]{22}), t=\d{10}, a=[A-Za-z0-9_-]{86}$/
/** LIMITES_DE_MIDIA.bytesMax of the protocol: the relay refuses more, so the site does not even read more. */
const MAX = 1048576
const TOO_BIG = { status: 413, code: 'imagem_grande', message: 'A foto passa de 1 MiB.' }
const FORM = { status: 400, code: 'corpo', message: 'O pedido não tem a forma esperada.' }

/** Reads the body up to MAX bytes; null when it passes. */
async function bodyUpTo(req: NextRequest): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX) return null
  if (!req.body) return new Uint8Array()
  const parts: Uint8Array[] = []
  let total = 0
  const reader = req.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX) {
      await reader.cancel()
      return null
    }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const ready = issuersReady()
  if (!ready) return refuse(NOT_READY)
  const { hash } = await params
  const auth = req.headers.get('x-rover-envio') ?? ''
  const signer = UPLOAD.exec(auth)
  if (!HASH.test(hash) || !signer) return refuse(FORM)
  const who = await accessFromRequest(req)
  if (!who) return refuse(SIGNED_OUT)
  if (!consentOf(who.pessoa)) return refuse(NO_CONSENT)
  const bytes = await bodyUpTo(req)
  if (!bytes) return refuse(TOO_BIG)
  if (bytes.length === 0) return refuse(FORM)
  try {
    const p = await personFromRovemark(ready.login, who.pessoa, who.at)
    if (p.adult !== true) return refuse(MINOR)
    if (signer[1] !== p.uid) return refuse({ status: 403, code: 'outro_autor', message: 'Só dá para enviar como você mesmo.' })
    const r = await fetch(`${ready.relay}/v1/midia/${hash}`, {
      method: 'PUT',
      headers: { authorization: auth, 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) },
      body: bytes as BodyInit,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
    return answer(await r.json().catch(() => ({})), r.status)
  } catch (e) {
    if (e instanceof IssuerFailure) return refuse(e.failure)
    return refuse({ status: 502, code: 'rele', message: 'A folgali não respondeu. Tente de novo.' })
  }
}
