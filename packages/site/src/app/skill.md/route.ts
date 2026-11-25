import { SKILL_PT } from '@/conteudo/skill.pt.md'
import { respostaDoSkill } from '@/lib/seo/skill'
import { indexavel } from '@/lib/site'

export const dynamic = 'force-dynamic'

// Site fechado: o arquivo não existe, como o llms.txt (um índice para máquina ao lado de um noindex seria contradição).
export function GET(): Response {
  return respostaDoSkill(SKILL_PT, indexavel())
}
