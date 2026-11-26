// How many days of friendship and of account the reader has, for the screen to say whether they can write a testimonial or give
// a badge (3 and 7 days, section 8.2). It is only a head start on the rule: the relay decides. If it cannot be known,
// the reader is treated as eligible and the relay answers `conta-nova` if that is the case.

import type { NetworkClient } from '@/lib/network-client'
import { canOnProfile, type Verdict } from '@/lib/domain/permissions'
import type { RoverPage } from '@/lib/social/types'
import type { CanGiveBadge } from './Medals'

const DAY = 86_400_000

/**
 * Whole days since an ISO instant. `Infinity` when the date is missing (relay 0.3, or an account without the information): the screen then treats the reader
 * as eligible and whoever refuses, if it is the case, is the relay.
 */
export function daysSince(iso: string | null | undefined, now: Date): number {
  const t = typeof iso === 'string' ? Date.parse(iso) : Number.NaN
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / DAY) : Number.POSITIVE_INFINITY
}

export async function daysOfFriendship(client: NetworkClient, meUid: string, targetUid: string, now: Date): Promise<number> {
  let cursor: string | undefined
  for (let i = 0; i < 6; i++) {
    const p = await client.amigos(meUid, cursor).catch(() => null)
    if (!p) return Number.POSITIVE_INFINITY
    const found = p.itens.find((a) => a.rover.uid === targetUid)
    if (found) return Math.floor((now.getTime() - new Date(found.desde).getTime()) / DAY)
    if (!p.proximo) break
    cursor = p.proximo
  }
  return Number.POSITIVE_INFINITY
}

export async function daysOfAccount(client: NetworkClient, meUid: string, now: Date): Promise<number> {
  const p = await client.getRover(meUid).catch(() => null)
  return p?.desde ? Math.floor((now.getTime() - new Date(p.desde).getTime()) / DAY) : Number.POSITIVE_INFINITY
}

export interface Eligibility {
  recado: Verdict
  depoimento: Verdict
  selo: Verdict
}

export function eligibility(page: RoverPage, friendForDays: number, accountAgeDays: number): Eligibility {
  const v = page.voce
  const base = { proprio: v?.papel === 'proprio', amigo: !!v?.amigo, friendForDays, accountAgeDays, bloqueio: !!v?.euBloqueei, recados: page.rover.recados }
  return { recado: canOnProfile('recado', base), depoimento: canOnProfile('depoimento', base), selo: canOnProfile('selo', base) }
}

export function canGiveBadge(page: RoverPage, e: Eligibility, hasApp: boolean): CanGiveBadge {
  const v = page.voce
  if (!hasApp || !v || v.papel === 'proprio' || v.euBloqueei) return 'ninguem'
  if (e.selo.ok) return 'sim'
  if (!v.amigo) return 'nao-amigo'
  return e.selo.motivo === 'conta-nova' ? 'sem-tempo' : 'ninguem'
}
