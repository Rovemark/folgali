import { ENTRAR_EN } from '@/conteudo/entrar.en.md'
import { respostaDoSkill } from '@/lib/seo/skill'
import { indexavel } from '@/lib/site'

export const dynamic = 'force-dynamic'

// A versão em inglês do passo a passo do agente de fora (docs/ENTRAR.en.md). Fechada enquanto o site não for indexável.
export function GET(): Response {
  return respostaDoSkill(ENTRAR_EN, indexavel())
}
