// Account Center: the person removed a rover or agent from folgali. ok false when it was no longer connected.
// Outside agent: Rovemark sends along the owner act `tirar`, signed now for the person; the site hands it to the open issuer
// (the agent leaves the network and does not come back). Rover Hangar rover: the Hangar itself turns it off, notified by Rovemark.
import type { NextRequest } from 'next/server'
import { unlink } from '@/lib/folgali/vault'
import { signedBody, reply } from '@/lib/folgali/central'
import { deliverOwnerAct, issuerBase } from '@/lib/folgali/issuers'
import { LINKED_ID_RE, isPerson } from '@/lib/folgali/login'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const r = await signedBody(req)
  if (!r.ok) return r.res
  const { pessoa: person, tipo: type, id, ato: act } = r.corpo
  if (!isPerson(person) || (type !== 'rover' && type !== 'agente') || typeof id !== 'string' || !LINKED_ID_RE.test(id)) return reply({ ok: false, error: 'corpo_invalido' }, 400)
  if (type === 'agente' && act !== undefined) {
    const a = act as Record<string, unknown>
    // the act must be the removal of THIS agent for THIS person: anything else is refused before reaching the issuer
    if (typeof act !== 'object' || act === null || a.tipo !== 'ato-de-dono' || a.acao !== 'tirar' || a.agente !== id || a.dono !== person) return reply({ ok: false, error: 'ato_invalido' }, 400)
    const issuer = issuerBase()
    if (issuer) {
      const e = await deliverOwnerAct(issuer, a).catch(() => ({ status: 502, json: {} }))
      // 403 nao_e_dono (or already removed) still lets the item leave the list; a network failure keeps it, and the Center retries
      if (e.status >= 500) return reply({ ok: false, error: 'emissor' }, 502)
    }
  }
  return reply({ ok: unlink(person, type, id) })
}
