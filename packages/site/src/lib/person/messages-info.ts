// Whether the relay has private messages on (`mensagens` in `recursos` of GET /v1/info, revision 0.4.0) and the issuer keys it lists,
// which the browser uses to check, by itself, the attestation that binds the other side's network key (src/lib/person/cipher.ts).
// Read on the site's server for the page; a relay that does not answer counts as without messages.
import 'server-only'
import { relayAddress } from '@/lib/events/read'

export interface MessagesInfo {
  on: boolean
  /** the relay did not answer: the page says it could not check, not that messages are off */
  unknown?: boolean
  issuers: string[]
  /** seconds a message stays on the relay (30 days in the protocol) */
  retentionS: number
}

const KEY = /^[A-Za-z0-9_-]{43}$/

export function messagesInfoOf(x: unknown): MessagesInfo {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
  const resources = Array.isArray(o.recursos) ? o.recursos : []
  const issuers = Array.isArray(o.emissores) ? o.emissores.filter((e): e is string => typeof e === 'string' && KEY.test(e)).slice(0, 50) : []
  const l = (typeof o.limites === 'object' && o.limites !== null ? o.limites : {}) as Record<string, unknown>
  const r = Number.isSafeInteger(l.retencaoDeMensagemS) && (l.retencaoDeMensagemS as number) > 0 ? (l.retencaoDeMensagemS as number) : 30 * 86400
  return { on: resources.includes('mensagens') && issuers.length > 0, issuers, retentionS: r }
}

let kept: { until: number; value: MessagesInfo } | null = null

/** GET /v1/info, kept for 60 seconds (turning messages on or off on the relay shows here within a minute). */
export async function messagesInfo(now = Date.now()): Promise<MessagesInfo> {
  if (kept && kept.until > now) return kept.value
  const base = relayAddress()
  if (!base) return messagesInfoOf(null)
  try {
    const r = await fetch(`${base}/v1/info`, { headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { ...messagesInfoOf(null), unknown: true }
    const value = messagesInfoOf(await r.json())
    kept = { until: now + 60_000, value }
    return value
  } catch {
    return { ...messagesInfoOf(null), unknown: true }
  }
}

/** For tests: forget the kept answer. */
export const _forgetMessagesInfo = () => {
  kept = null
}
