// The signed-in person's own reactions, read from the relay AS the person (proposal 0010 left the button on "Curtir" after a reload,
// because the site read the relay without her credential). The browser signs one read credential per relay path with the device key
// (src/lib/person/client.ts, `myReactions`); this route only checks that every credential is the signed-in person's own and that every
// path is one of the two post reads, carries them to the relay untouched and keeps only `minhaReacao` from the answers. Nothing is
// stored, here or in the browser.
import type { NextRequest } from 'next/server'
import { NOT_READY, SIGNED_OUT, answer, isFailure, jsonBody, refuse } from '@/lib/folgali/api'
import { IssuerFailure, issuersReady, knownUid, personFromRovemark, readOnRelayAs } from '@/lib/folgali/issuers'
import { accessFromRequest } from '@/lib/folgali/session'
import { MAX_READS, POST_PATH, READ_CREDENTIAL, REPLIES_PATH, reactionsFrom } from '@/lib/person/reads'

export const dynamic = 'force-dynamic'

const FORM = { status: 400, code: 'corpo', message: 'O pedido não tem a forma esperada.' }
type Read = { path: string; credential: string }

function readsOf(body: Record<string, unknown>): Read[] | null {
  if (Object.keys(body).some((k) => k !== 'reads') || !Array.isArray(body.reads)) return null
  const reads = body.reads as unknown[]
  if (reads.length < 1 || reads.length > MAX_READS) return null
  const out: Read[] = []
  for (const r of reads) {
    if (typeof r !== 'object' || r === null) return null
    const { path, credential, ...rest } = r as Record<string, unknown>
    if (Object.keys(rest).length || typeof path !== 'string' || typeof credential !== 'string') return null
    if (!POST_PATH.test(path) && !REPLIES_PATH.test(path)) return null
    if (!READ_CREDENTIAL.test(credential)) return null
    out.push({ path, credential })
  }
  return out
}

export async function POST(req: NextRequest) {
  const ready = issuersReady()
  if (!ready) return refuse(NOT_READY)
  const body = await jsonBody(req, 24_000)
  if (isFailure(body)) return refuse(body)
  const who = await accessFromRequest(req)
  if (!who) return refuse(SIGNED_OUT)
  const reads = readsOf(body)
  if (!reads) return refuse(FORM)
  try {
    const uid = knownUid(who.pessoa) ?? (await personFromRovemark(ready.login, who.pessoa, who.at)).uid
    if (reads.some((r) => READ_CREDENTIAL.exec(r.credential)![1] !== uid)) {
      return refuse({ status: 403, code: 'outro_leitor', message: 'Só dá para ler como você mesmo.' })
    }
    const reactions: Record<string, string | null> = {}
    // a refused read (another device published last, the post is gone) just leaves its ids out: the button stays as the page drew it
    const answers = await Promise.all(reads.map((r) => readOnRelayAs(ready.relay, r.path, r.credential).catch(() => null)))
    for (const a of answers) if (a?.status === 200) Object.assign(reactions, reactionsFrom(a.json))
    return answer({ reactions })
  } catch (e) {
    if (e instanceof IssuerFailure) return refuse(e.failure)
    return refuse({ status: 502, code: 'rovemark', message: 'A Rovemark não respondeu. Tente de novo.' })
  }
}
