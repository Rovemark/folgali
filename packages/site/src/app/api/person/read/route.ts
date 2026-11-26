// Carries to the relay a GET the BROWSER signed as the signed-in person (a read credential from the device key). Nothing is signed
// here: the server only checks that the path is one of the few the site needs (a profile page, the own following list and, for
// private messages, the own conversations, messages and friends plus anyone's public profile and cipher key, src/lib/person/reads.ts)
// and that the credential is the person's own uid, then passes the relay's answer back. Same origin, so the relay needs no CORS.
// The message envelopes pass through encrypted: the text is only ever decrypted in the browser.
import type { NextRequest } from 'next/server'
import { NOT_READY, SIGNED_OUT, answer, isFailure, jsonBody, refuse } from '@/lib/folgali/api'
import { IssuerFailure, issuersReady, knownUid, personFromRovemark, readOnRelay } from '@/lib/folgali/issuers'
import { accessFromRequest } from '@/lib/folgali/session'
import { messageReadOwner } from '@/lib/person/reads'

export const dynamic = 'force-dynamic'

const UID = 'rvr_[A-Za-z0-9_-]{22}'
/** The profile page of anyone, or the person's own following list (paged). Nothing else goes through. */
const PAGE = new RegExp(`^/v1/rovers/(${UID})/pagina$`)
const FOLLOWING = new RegExp(`^/v1/rovers/(${UID})/seguindo\\?limite=50(?:&antes=\\d{1,12})?$`)
const AUTH = new RegExp(`^Rover-Assinatura uid=(${UID}), t=\\d{10}, a=[A-Za-z0-9_-]{86}$`)
const FORM = { status: 400, code: 'corpo', message: 'O pedido não tem a forma esperada.' }

export async function POST(req: NextRequest) {
  const ready = issuersReady()
  if (!ready) return refuse(NOT_READY)
  const body = await jsonBody(req, 2_000)
  if (isFailure(body)) return refuse(body)
  const who = await accessFromRequest(req)
  if (!who) return refuse(SIGNED_OUT)
  const { path, auth } = body
  if (Object.keys(body).some((k) => k !== 'path' && k !== 'auth') || typeof path !== 'string' || typeof auth !== 'string') return refuse(FORM)
  const page = PAGE.exec(path)
  const following = FOLLOWING.exec(path)
  const signer = AUTH.exec(auth)
  const message = messageReadOwner(path)
  if ((!page && !following && !message) || !signer) return refuse(FORM)
  try {
    const uid = knownUid(who.pessoa) ?? (await personFromRovemark(ready.login, who.pessoa, who.at)).uid
    const ownPath = following ? following[1] : message && message !== 'public' ? message.uid : uid
    if (signer[1] !== uid || ownPath !== uid) return refuse({ status: 403, code: 'outro_leitor', message: 'Só dá para ler como você mesmo.' })
    const r = await readOnRelay(ready.relay, path, auth)
    return answer(r.json, r.status)
  } catch (e) {
    if (e instanceof IssuerFailure) return refuse(e.failure)
    return refuse({ status: 502, code: 'rele', message: 'A folgali não respondeu. Tente de novo.' })
  }
}
