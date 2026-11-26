// Events for the signed-in person (protocol 0.11.0 part 4), two small things the browser cannot ask the relay itself:
//   GET   the communities she is in, where she may create an event (the relay's public list of her communities);
//   POST  her own answer to one event: the browser signs a read credential for `/v1/eventos/<id>` with the device key, this route
//         checks the credential is her own uid and the path is exactly one event, carries it to the relay and keeps only
//         `minhaPresenca`. Nothing is stored, here or in the browser.
import type { NextRequest } from 'next/server'
import { NOT_READY, SIGNED_OUT, answer, isFailure, jsonBody, refuse } from '@/lib/folgali/api'
import { IssuerFailure, issuersReady, knownUid, personFromRovemark, readOnRelayAs } from '@/lib/folgali/issuers'
import { accessFromRequest } from '@/lib/folgali/session'
import { getNetwork } from '@/lib/get-network'
import { READ_CREDENTIAL } from '@/lib/person/reads'
import { isRsvp } from '@/lib/events/types'

export const dynamic = 'force-dynamic'

const EVENT_PATH = /^\/v1\/eventos\/ob_[A-Za-z0-9_-]{43}$/
const FORM = { status: 400, code: 'corpo', message: 'O pedido não tem a forma esperada.' }
const MAX_COMMUNITIES = 100

export async function GET(req: NextRequest) {
  const ready = issuersReady()
  if (!ready) return refuse(NOT_READY)
  const who = await accessFromRequest(req)
  if (!who) return refuse(SIGNED_OUT)
  try {
    const uid = knownUid(who.pessoa) ?? (await personFromRovemark(ready.login, who.pessoa, who.at)).uid
    const out: { id: string; nome: string }[] = []
    let cursor: string | undefined
    // a few pages at most: a person in more than 100 communities picks among the first 100
    for (let i = 0; i < 4 && out.length < MAX_COMMUNITIES; i++) {
      const page = await getNetwork().cliente.comunidadesDoRover(uid, cursor)
      for (const x of page.itens) out.push({ id: x.comunidade.id, nome: x.comunidade.nome })
      if (!page.proximo) break
      cursor = page.proximo
    }
    return answer({ comunidades: out.slice(0, MAX_COMMUNITIES) })
  } catch (e) {
    if (e instanceof IssuerFailure) return refuse(e.failure)
    // her communities did not come: the form offers the event on its own
    return answer({ comunidades: [] })
  }
}

export async function POST(req: NextRequest) {
  const ready = issuersReady()
  if (!ready) return refuse(NOT_READY)
  const body = await jsonBody(req, 2_000)
  if (isFailure(body)) return refuse(body)
  const who = await accessFromRequest(req)
  if (!who) return refuse(SIGNED_OUT)
  const { path, credential } = body
  if (Object.keys(body).some((k) => k !== 'path' && k !== 'credential') || typeof path !== 'string' || typeof credential !== 'string') return refuse(FORM)
  const signer = READ_CREDENTIAL.exec(credential)
  if (!EVENT_PATH.test(path) || !signer) return refuse(FORM)
  try {
    const uid = knownUid(who.pessoa) ?? (await personFromRovemark(ready.login, who.pessoa, who.at)).uid
    if (signer[1] !== uid) return refuse({ status: 403, code: 'outro_leitor', message: 'Só dá para ler como você mesmo.' })
    const r = await readOnRelayAs(ready.relay, path, credential)
    if (r.status !== 200) return answer({ minhaPresenca: null })
    const mine = (r.json as Record<string, unknown> | null)?.minhaPresenca
    return answer({ minhaPresenca: isRsvp(mine) ? mine : null })
  } catch (e) {
    if (e instanceof IssuerFailure) return refuse(e.failure)
    return refuse({ status: 502, code: 'rele', message: 'A folgali não respondeu. Tente de novo.' })
  }
}
