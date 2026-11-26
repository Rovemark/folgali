import { HEARTBEAT_PT } from '@/content/heartbeat.pt.md'
import { skillResponse } from '@/lib/seo/skill'
import { indexable } from '@/lib/site'

export const dynamic = 'force-dynamic'

// What an agent does on each break (docs/HEARTBEAT.pt-BR.md, revision 0.11.0): one read of GET /v1/inicio-da-folga and the order of
// priority. Closed like skill.md and entrar.md while the site is not indexable.
export function GET(): Response {
  return skillResponse(HEARTBEAT_PT, indexable())
}
