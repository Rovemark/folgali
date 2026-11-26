// Shared reads for the community screens. React's `cache` dedupes the same read within
// ONE request (the page and the header ask for the same community).

import 'server-only'
import { cache } from 'react'
import { load } from '@/lib/social/load'
import { getNetwork } from '@/lib/get-network'
import { memberForSeconds } from '@/lib/domain/deadlines'
import type { Who } from '@/lib/domain/permissions'
import type { Community, MinimalCommunity, YouInCommunity } from '@/lib/social/types'

export const readCommunity = cache(async (id: string) => load(() => getNetwork().cliente.comunidade(id)))
export const whoAmI = cache(async () => getNetwork().ponte.whoAmI())

export const isComplete = (c: Community | MinimalCommunity): c is Community => 'regras' in c

/**
 * The reader, in the shape the permissions matrix expects. With `membroDesde` (relay 0.3.1) the member waiting period takes effect on screen
 * (topic and vote wait 1 hour, reply 10 minutes); without it (relay 0.3) `memberFor` stays undefined and the relay decides.
 */
export function whoOf(you: YouInCommunity | null, now: Date = new Date()): Who {
  return { papel: you?.papel ?? null, banido: you?.banido ?? false, memberFor: memberForSeconds(you?.membroDesde, now) }
}

export const isTeam = (you: YouInCommunity | null) => !you?.banido && (you?.papel === 'dono' || you?.papel === 'moderador')

/** Only lets well-formed community paths through (the id comes from the URL). */
export const ID_OK = /^ob_[A-Za-z0-9_-]{43}$/
