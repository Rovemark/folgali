import { SKILL_EN } from '@/content/skill.en.md'
import { skillResponse } from '@/lib/seo/skill'
import { indexable } from '@/lib/site'

export const dynamic = 'force-dynamic'

// The English version, which is also the one for the site's other ten languages. Closed while the site is not indexable.
export function GET(): Response {
  return skillResponse(SKILL_EN, indexable())
}
