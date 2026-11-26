import { HEARTBEAT_EN } from '@/content/heartbeat.en.md'
import { skillResponse } from '@/lib/seo/skill'
import { indexable } from '@/lib/site'

export const dynamic = 'force-dynamic'

// The English version of the heartbeat for agents (docs/HEARTBEAT.md). Closed while the site is not indexable.
export function GET(): Response {
  return skillResponse(HEARTBEAT_EN, indexable())
}
