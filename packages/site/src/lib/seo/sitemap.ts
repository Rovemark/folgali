// The sitemap, as a pure function: it receives what exists and returns the entries. Closed (non indexable site) returns an EMPTY LIST: a map
// of addresses next to a noindex would be a contradiction.
import type { MetadataRoute } from 'next'
import type { Guide, GlossaryEntry } from '@/content/types'
import { alternatives, absoluteUrl, type Language } from '@/lib/site'
import { sitemapRoutes } from './routes'

export type SitemapData = {
  aberto: boolean
  base: string
  idiomas: readonly Language[]
  padrao: string
  guias: Record<string, readonly Pick<Guide, 'slug' | 'atualizadoEm'>[]>
  verbetes: Record<string, readonly Pick<GlossaryEntry, 'slug' | 'atualizadoEm'>[]>
  /** Open or moderated communities (a closed one does not exist for non-members) and pages, with the date of the last activity. */
  comunidades: readonly { id: string; atividadeEm?: string }[]
  paginas: readonly { id: string; atividadeEm?: string }[]
}

type Entry = MetadataRoute.Sitemap[number]

/** Entry for a path in each language in which it exists, with the hreflang between them and the x-default. */
function entries(d: SitemapData, path: string, langs: readonly string[], extra: Partial<Entry> = {}): Entry[] {
  const languageSet = d.idiomas.filter((i) => langs.includes(i.lang))
  if (languageSet.length === 0) return []
  const defaultValue = langs.includes(d.padrao) ? d.padrao : languageSet[0].lang
  const languages = alternatives(d.base, path, languageSet, defaultValue)
  return languageSet.map((i) => ({ url: absoluteUrl(d.base, i.lang, path), alternates: { languages }, ...extra }))
}

const data = (iso?: string): Date | undefined => {
  if (!iso) return undefined
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? undefined : t
}

export function buildSitemap(d: SitemapData): MetadataRoute.Sitemap {
  if (!d.aberto) return []
  const all = d.idiomas.map((i) => i.lang)
  const output: Entry[] = []
  for (const r of sitemapRoutes()) {
    output.push(...entries(d, r.caminho, all, { changeFrequency: r.frequency, priority: r.prioridade }))
  }
  const bySlug = <T extends { slug: string; atualizadoEm: string }>(lists: Record<string, readonly T[]>, prefix: string, priority: number) => {
    const slugLangs = new Map<string, { langs: string[]; atualizadoEm?: string }>()
    for (const [lang, items] of Object.entries(lists)) {
      for (const it of items) {
        const at = slugLangs.get(it.slug) ?? { langs: [] }
        at.langs.push(lang)
        if (!at.atualizadoEm || it.atualizadoEm > at.atualizadoEm) at.atualizadoEm = it.atualizadoEm
        slugLangs.set(it.slug, at)
      }
    }
    for (const [slug, { langs, atualizadoEm: updatedAt }] of slugLangs) {
      output.push(...entries(d, `${prefix}/${slug}`, langs, { lastModified: data(updatedAt), changeFrequency: 'monthly', priority: priority }))
    }
  }
  bySlug(d.guias, '/guias', 0.7)
  bySlug(d.verbetes, '/glossario', 0.5)
  for (const c of d.comunidades) output.push(...entries(d, `/comunidades/${encodeURIComponent(c.id)}`, all, { lastModified: data(c.atividadeEm), changeFrequency: 'daily', priority: 0.6 }))
  for (const p of d.paginas) output.push(...entries(d, `/paginas/${encodeURIComponent(p.id)}`, all, { lastModified: data(p.atividadeEm), changeFrequency: 'daily', priority: 0.5 }))
  return output
}
