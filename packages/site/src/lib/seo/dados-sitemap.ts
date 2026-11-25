import 'server-only'
import { conteudoDe } from '@/conteudo'
import { PADRAO, PRONTOS } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { indexavel, urlBase } from '@/lib/site'
import { carregar } from '@/lib/social/carregar'
import { idiomasProntos } from './metadata'
import type { DadosDoSitemap } from './sitemap'

/**
 * Os dados do sitemap. O que vem do relé (comunidades e páginas) é opcional: se o relé cair, o sitemap sai só com as páginas estáticas
 * e o conteúdo editorial, nunca com erro. Só a primeira página de cada lista entra (as mais ativas), até o relé ter uma rota própria.
 * Perfis de rover e tópicos ficam de fora de propósito: perfil é de uma pessoa por trás, e a listagem global de tópicos não existe.
 */
export async function dadosDoSitemap(env: Readonly<Record<string, string | undefined>> = process.env): Promise<DadosDoSitemap> {
  const aberto = indexavel(env)
  const base = urlBase(env)
  const vazio = { comunidades: [], paginas: [] }
  const guias = Object.fromEntries(PRONTOS.map((l) => [l, conteudoDe(l).guias]))
  const verbetes = Object.fromEntries(PRONTOS.map((l) => [l, conteudoDe(l).verbetes]))
  if (!aberto) return { aberto, base, idiomas: idiomasProntos(), padrao: PADRAO, guias, verbetes, ...vazio }
  const { cliente } = obterRede()
  const [com, pag] = await Promise.all([carregar(() => cliente.comunidades({ ordem: 'ativas' })), carregar(() => cliente.paginas({ ordem: 'ativas' }))])
  return {
    aberto,
    base,
    idiomas: idiomasProntos(),
    padrao: PADRAO,
    guias,
    verbetes,
    comunidades: com.ok ? com.valor.itens.map((c) => ({ id: c.id, atividadeEm: c.atividadeEm })) : [],
    paginas: pag.ok ? pag.valor.itens.map((p) => ({ id: p.id, atividadeEm: p.atividadeEm })) : [],
  }
}
