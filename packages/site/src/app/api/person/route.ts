// The signed-in person on folgali: the uid Rovemark derives, the last @, and the head of the chain on the relay (what the browser
// needs to sign the next object). 401 without session, 503 when writing is not wired on this site.
import type { NextRequest } from 'next/server'
import { NOT_READY, SIGNED_OUT, answer, refuse } from '@/lib/folgali/api'
import { consentOf } from '@/lib/folgali/vault'
import { IssuerFailure, headOnRelay, issuersReady, personFromRovemark } from '@/lib/folgali/issuers'
import { accessFromRequest } from '@/lib/folgali/session'
import { getNetwork } from '@/lib/get-network'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ready = issuersReady()
  if (!ready) return refuse(NOT_READY)
  const who = await accessFromRequest(req)
  if (!who) return refuse(SIGNED_OUT)
  try {
    const p = await personFromRovemark(ready.login, who.pessoa, who.at)
    const [relay, edit] = await Promise.all([headOnRelay(ready.relay, p.uid), getNetwork().cliente.suporta('edicao').catch(() => false)])
    // `edit`: the relay takes edits (0.11.0 part 2), so the screens offer "Edit" on what is hers
    return answer({ uid: p.uid, handle: p.handle, adult: p.adult, head: relay.head, profile: relay.profile, name: relay.name, body: relay.body, consent: consentOf(who.pessoa) !== null, edit })
  } catch (e) {
    if (e instanceof IssuerFailure) return refuse(e.failure)
    return refuse({ status: 502, code: 'rovemark', message: 'A Rovemark não respondeu. Tente de novo.' })
  }
}
