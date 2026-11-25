// O sitemap, como função pura: recebe o que existe e devolve as entradas. Fechado (site não indexável) devolve LISTA VAZIA: um mapa
// de endereços ao lado de um noindex seria contradição.
import type { MetadataRoute } from 'next'
import type { Guia, Verbete } from '@/conteudo/tipos'
import { alternativas, urlAbsoluta, type Idioma } from '@/lib/site'
import { rotasDoSitemap } from './rotas'

export type DadosDoSitemap = {
  aberto: boolean
  base: string
  idiomas: readonly Idioma[]
  padrao: string
  guias: Record<string, readonly Pick<Guia, 'slug' | 'atualizadoEm'>[]>
  verbetes: Record<string, readonly Pick<Verbete, 'slug' | 'atualizadoEm'>[]>
  /** Comunidades abertas ou moderadas (a fechada não existe para quem não é membro) e páginas, com a data da última atividade. */
  comunidades: readonly { id: string; atividadeEm?: string }[]
  paginas: readonly { id: string; atividadeEm?: string }[]
}

type Entrada = MetadataRoute.Sitemap[number]

/** Entrada de um caminho em cada idioma em que ele existe, com os hreflang entre eles e o x-default. */
function entradas(d: DadosDoSitemap, caminho: string, langs: readonly string[], extra: Partial<Entrada> = {}): Entrada[] {
  const idiomas = d.idiomas.filter((i) => langs.includes(i.lang))
  if (idiomas.length === 0) return []
  const padrao = langs.includes(d.padrao) ? d.padrao : idiomas[0].lang
  const languages = alternativas(d.base, caminho, idiomas, padrao)
  return idiomas.map((i) => ({ url: urlAbsoluta(d.base, i.lang, caminho), alternates: { languages }, ...extra }))
}

const data = (iso?: string): Date | undefined => {
  if (!iso) return undefined
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? undefined : t
}

export function montarSitemap(d: DadosDoSitemap): MetadataRoute.Sitemap {
  if (!d.aberto) return []
  const todos = d.idiomas.map((i) => i.lang)
  const saida: Entrada[] = []
  for (const r of rotasDoSitemap()) {
    saida.push(...entradas(d, r.caminho, todos, { changeFrequency: r.frequencia, priority: r.prioridade }))
  }
  const porSlug = <T extends { slug: string; atualizadoEm: string }>(listas: Record<string, readonly T[]>, prefixo: string, prioridade: number) => {
    const langsDoSlug = new Map<string, { langs: string[]; atualizadoEm?: string }>()
    for (const [lang, itens] of Object.entries(listas)) {
      for (const it of itens) {
        const at = langsDoSlug.get(it.slug) ?? { langs: [] }
        at.langs.push(lang)
        if (!at.atualizadoEm || it.atualizadoEm > at.atualizadoEm) at.atualizadoEm = it.atualizadoEm
        langsDoSlug.set(it.slug, at)
      }
    }
    for (const [slug, { langs, atualizadoEm }] of langsDoSlug) {
      saida.push(...entradas(d, `${prefixo}/${slug}`, langs, { lastModified: data(atualizadoEm), changeFrequency: 'monthly', priority: prioridade }))
    }
  }
  porSlug(d.guias, '/guias', 0.7)
  porSlug(d.verbetes, '/glossario', 0.5)
  for (const c of d.comunidades) saida.push(...entradas(d, `/comunidades/${encodeURIComponent(c.id)}`, todos, { lastModified: data(c.atividadeEm), changeFrequency: 'daily', priority: 0.6 }))
  for (const p of d.paginas) saida.push(...entradas(d, `/paginas/${encodeURIComponent(p.id)}`, todos, { lastModified: data(p.atividadeEm), changeFrequency: 'daily', priority: 0.5 }))
  return saida
}
