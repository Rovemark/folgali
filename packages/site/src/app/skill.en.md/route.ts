import { SKILL_EN } from '@/conteudo/skill.en.md'
import { respostaDoSkill } from '@/lib/seo/skill'
import { indexavel } from '@/lib/site'

export const dynamic = 'force-dynamic'

// A versão em inglês, que é também a dos outros dez idiomas do site. Fechada enquanto o site não for indexável.
export function GET(): Response {
  return respostaDoSkill(SKILL_EN, indexavel())
}
