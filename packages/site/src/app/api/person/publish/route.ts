// Carries to the relay an envelope the BROWSER signed with the device key ({ objeto, atestado? }). Nothing is changed or signed
// here: the server only checks that the object is the signed-in person's own (author = her uid) and passes the relay's answer
// back as is (422 vazamento, 409 previo_incorreto, 409 atestado_antigo...). Same origin, so the relay needs no CORS.
import type { NextRequest } from 'next/server'
import { MINOR, NOT_READY, NO_CONSENT, SIGNED_OUT, answer, isFailure, jsonBody, refuse } from '@/lib/folgali/api'
import { consentOf } from '@/lib/folgali/vault'
import { IssuerFailure, issuersReady, knownUid, personFromRovemark, publishOnRelay } from '@/lib/folgali/issuers'
import { accessFromRequest } from '@/lib/folgali/session'
import type { HttpClient } from '@/lib/http-client'
import { getNetwork } from '@/lib/get-network'

export const dynamic = 'force-dynamic'

const FORM: { status: number; code: string; message: string } = { status: 400, code: 'corpo', message: 'O pedido não tem a forma esperada.' }
export async function POST(req: NextRequest) {
  const ready = issuersReady()
  if (!ready) return refuse(NOT_READY)
  const body = await jsonBody(req, 48_000)
  if (isFailure(body)) return refuse(body)
  const who = await accessFromRequest(req)
  if (!who) return refuse(SIGNED_OUT)
  if (!consentOf(who.pessoa)) return refuse(NO_CONSENT)
  if (Object.keys(body).some((k) => k !== 'objeto' && k !== 'atestado')) return refuse(FORM)
  const object = body.objeto as Record<string, unknown> | undefined
  const attestation = body.atestado as Record<string, unknown> | undefined
  if (!object || typeof object !== 'object' || typeof object.autor !== 'string') return refuse(FORM)
  try {
    // a photo (`imagem`): only from an account Rovemark says is 18 or over, asked fresh every time
    if (object.tipo === 'imagem' && (await personFromRovemark(ready.login, who.pessoa, who.at)).adult !== true) return refuse(MINOR)
    const uid = knownUid(who.pessoa) ?? (await personFromRovemark(ready.login, who.pessoa, who.at)).uid
    if (object.autor !== uid || (attestation !== undefined && (typeof attestation !== 'object' || attestation === null || attestation.uid !== uid))) {
      return refuse({ status: 403, code: 'outro_autor', message: 'Só dá para publicar como você mesmo.' })
    }
    const r = await publishOnRelay(ready.relay, attestation ? { objeto: object, atestado: attestation } : { objeto: object })
    // what she just published shows on her next page (profile, wall, buttons), not the copy read a few seconds ago
    if (r.status < 300) {
      // duck typed: route handlers and pages are separate bundles, so `instanceof` would not see the shared client as a ClienteHttp
      const client = getNetwork().cliente as Partial<Pick<HttpClient, 'esquecerCache'>>
      client.esquecerCache?.()
    }
    return answer(r.json, r.status)
  } catch (e) {
    if (e instanceof IssuerFailure) return refuse(e.failure)
    return refuse({ status: 502, code: 'rele', message: 'A folgali não respondeu. Tente de novo.' })
  }
}
