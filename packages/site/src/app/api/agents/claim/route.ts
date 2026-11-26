// The owner releases an outside agent (docs/INTEGRATION-ROVEMARK-VERIFIED-OWNER.md, section 5): the person signed in with Rovemark
// typed the code the agent showed and ticked that she answers for the agent. This server asks Rovemark for a fresh owner act
// (`reivindicar`, signed now, for the person behind the session), hands it to the open issuer, and remembers the agent among the
// person's linked items, which the Account Center lists and can remove.
import type { NextRequest } from 'next/server'
import { NOT_READY, NO_CONSENT, SIGNED_OUT, answer, isFailure, jsonBody, refuse } from '@/lib/folgali/api'
import { consentOf, enable } from '@/lib/folgali/vault'
import { IssuerFailure, claimInfo, deliverOwnerAct, failureOf, issuersReady, ownerActFromRovemark } from '@/lib/folgali/issuers'
import { accessFromRequest } from '@/lib/folgali/session'

export const dynamic = 'force-dynamic'

const CLAIM_RE = /^[A-Za-z0-9_-]{43}$/
const FORM = { status: 400, code: 'corpo', message: 'O pedido não tem a forma esperada.' }

export async function POST(req: NextRequest) {
  const ready = issuersReady()
  if (!ready) return refuse(NOT_READY)
  const body = await jsonBody(req, 1024)
  if (isFailure(body)) return refuse(body)
  const who = await accessFromRequest(req)
  if (!who) return refuse(SIGNED_OUT)
  if (!consentOf(who.pessoa)) return refuse(NO_CONSENT)
  const { claim, code, responsible, limits } = body
  if (typeof claim !== 'string' || !CLAIM_RE.test(claim) || typeof code !== 'string' || code.length > 20) return refuse(FORM)
  // the Lex 4.2 box: whoever releases an agent answers for it
  if (responsible !== true) return refuse({ status: 400, code: 'responsavel', message: 'Marque que você responde pelo agente.' })
  try {
    const info = await claimInfo(ready.issuer, claim)
    if (info.status !== 200) return refuse(failureOf(info.status, info.json))
    const act = await ownerActFromRovemark(ready.login, who.at, { action: 'reivindicar', claim, code, ...(limits ? { limits } : {}) })
    const r = await deliverOwnerAct(ready.issuer, act)
    if (r.status !== 200) return refuse(failureOf(r.status, r.json))
    const uid = String(r.json.uid ?? '')
    const handle = typeof r.json.handle === 'string' ? r.json.handle : undefined
    const name = typeof r.json.nome === 'string' ? r.json.nome : handle ?? uid
    const platform = typeof info.json.plataforma === 'string' ? info.json.plataforma : undefined
    if (/^rvr_[A-Za-z0-9_-]{22}$/.test(uid)) enable(who.pessoa, { id: uid, tipo: 'agente', nome: name, ...(handle ? { handle } : {}), ...(platform ? { origem: platform } : {}), ligadoEm: new Date().toISOString() })
    return answer({ uid, handle: handle ?? null, nome: name, situacao: r.json.situacao ?? null, limites: r.json.limites ?? null })
  } catch (e) {
    if (e instanceof IssuerFailure) return refuse(e.failure)
    return refuse({ status: 502, code: 'rovemark', message: 'A Rovemark ou o emissor não responderam. Tente de novo.' })
  }
}
