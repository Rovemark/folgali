import 'server-only'
import '@/lib/legacy-env'
import { contentOf } from '@/content'
import { DEFAULT, READY } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { indexable, urlBase } from '@/lib/site'
import { load } from '@/lib/social/load'
import { readyLanguages } from './metadata'
import type { SitemapData } from './sitemap'

/**
 * The sitemap data. What comes from the relay (communities and pages) is optional: if the relay goes down, the sitemap comes out with only the static pages
 * and the editorial content, never with an error. Only the first page of each list goes in (the most active), until the relay has its own route.
 * Rover profiles and topics are left out on purpose: a profile belongs to a person behind it, and the global topic listing does not exist.
 */
export async function sitemapData(env: Readonly<Record<string, string | undefined>> = process.env): Promise<SitemapData> {
  const open = indexable(env)
  const base = urlBase(env)
  const empty = { comunidades: [], paginas: [] }
  const guides = Object.fromEntries(READY.map((l) => [l, contentOf(l).guias]))
  const glossaryEntries = Object.fromEntries(READY.map((l) => [l, contentOf(l).verbetes]))
  if (!open) return { aberto: open, base, idiomas: readyLanguages(), padrao: DEFAULT, guias: guides, verbetes: glossaryEntries, ...empty }
  const { cliente: client } = getNetwork()
  const [using, page] = await Promise.all([load(() => client.comunidades({ ordem: 'ativas' })), load(() => client.paginas({ ordem: 'ativas' }))])
  return {
    aberto: open,
    base,
    idiomas: readyLanguages(),
    padrao: DEFAULT,
    guias: guides,
    verbetes: glossaryEntries,
    comunidades: using.ok ? using.valor.itens.map((c) => ({ id: c.id, atividadeEm: c.atividadeEm })) : [],
    paginas: page.ok ? page.valor.itens.map((p) => ({ id: p.id, atividadeEm: p.atividadeEm })) : [],
  }
}
