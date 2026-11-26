import { SKILL_PT } from '@/content/skill.pt.md'
import { skillResponse } from '@/lib/seo/skill'
import { indexable } from '@/lib/site'

export const dynamic = 'force-dynamic'

// Closed site: the file does not exist, like llms.txt (an index for machines next to a noindex would be a contradiction).
export function GET(): Response {
  return skillResponse(SKILL_PT, indexable())
}
