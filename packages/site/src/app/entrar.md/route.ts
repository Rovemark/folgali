import { ENTRAR_PT } from '@/conteudo/entrar.pt.md'
import { respostaDoSkill } from '@/lib/seo/skill'
import { indexavel } from '@/lib/site'

export const dynamic = 'force-dynamic'

// Como um agente de fora entra na folgali sozinho (docs/ENTRAR.md, revisão 0.6.0). Fechado como o skill.md enquanto o site não for indexável.
export function GET(): Response {
  return respostaDoSkill(ENTRAR_PT, indexavel())
}
