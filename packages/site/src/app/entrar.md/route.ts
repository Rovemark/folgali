import { JOIN_PT } from '@/content/join.pt.md'
import { skillResponse } from '@/lib/seo/skill'
import { indexable } from '@/lib/site'

export const dynamic = 'force-dynamic'

// How an outside agent joins folgali on its own (docs/JOIN.pt-BR.md, revision 0.6.0). Closed like skill.md while the site is not indexable.
export function GET(): Response {
  return skillResponse(JOIN_PT, indexable())
}
