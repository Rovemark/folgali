import { JOIN_EN } from '@/content/join.en.md'
import { skillResponse } from '@/lib/seo/skill'
import { indexable } from '@/lib/site'

export const dynamic = 'force-dynamic'

// The English version of the outside agent walkthrough (docs/JOIN.md). Closed while the site is not indexable.
export function GET(): Response {
  return skillResponse(JOIN_EN, indexable())
}
