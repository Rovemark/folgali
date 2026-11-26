// Metadata of each page, in one function: unique title and description, canonical, hreflang, robots, Open Graph and Twitter card.
// Every route calls `pageMeta` (or `routeMeta`, for the registry ones). The robots value comes from the SAME policy as the proxy and robots.txt.
import '@/lib/legacy-env'
import type { Metadata } from 'next'
import { META, DEFAULT, READY, type Ready } from '@/lib/i18n'
import { metaOf } from '@/lib/i18n-extra'
import { ENTITY, alternatives, indexable, absoluteUrl, urlBase, type Language } from '@/lib/site'
import { metaRobots, routePolicy } from './policy'
import { ROUTES } from './routes'

export type Environment = Readonly<Record<string, string | undefined>>

/** Open Graph language code (`pt_BR`, `en_US`): the language_TERRITORY format the networks expect. */
const OG: Record<Ready, string> = {
  pt: 'pt_BR', en: 'en_US', es: 'es_ES', fr: 'fr_FR', de: 'de_DE', it: 'it_IT', nl: 'nl_NL', ru: 'ru_RU', ar: 'ar_AR', zh: 'zh_CN', ja: 'ja_JP', ko: 'ko_KR',
}
export const localeOg = (lang: Ready): string => OG[lang]

export const readyLanguages = (): Language[] => READY.map((l) => ({ lang: l, hreflang: META[l].html }))

export type MetaEntry = {
  lang: Ready
  /** '' (start) or `/something`, without language and without query. The query (`?antes=`) never goes into the canonical. */
  caminho: string
  titulo: string
  descricao: string
  tipo?: 'website' | 'article'
  /** Id of the Open Graph image at `/og/<language>/<id>`. Without it the default image applies. */
  imageId?: string
  /** Routes that only exist in one language (content without translation) do not announce hreflang for the others. */
  idiomas?: readonly Ready[]
  /** Address of a page RSS feed (becomes `<link rel="alternate" type="application/rss+xml">`). */
  feed?: string
}

/** Page description of at most ~155 characters, without cutting a word in the middle. */
export function summarize(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cutoff = clean.slice(0, max - 1)
  const space = cutoff.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cutoff.slice(0, space) : cutoff).replace(/[\s,.;:]+$/, '')}…`
}

export function pageMeta(e: MetaEntry, env: Environment = process.env): Metadata {
  const base = urlBase(env)
  const open = indexable(env)
  const url = absoluteUrl(base, e.lang, e.caminho)
  const languageSet = readyLanguages().filter((i) => !e.idiomas || (e.idiomas as readonly string[]).includes(i.lang))
  const languages = alternatives(base, e.caminho, languageSet, e.idiomas && !e.idiomas.includes(DEFAULT) ? e.idiomas[0] : DEFAULT)
  const description = summarize(e.descricao)
  const image = `${base}/og/${e.lang}/${e.imageId ?? 'padrao'}`
  return {
    title: e.caminho === '' ? { absolute: e.titulo } : e.titulo,
    description: description,
    alternates: { canonical: url, languages, ...(e.feed ? { types: { 'application/rss+xml': e.feed } } : {}) },
    robots: metaRobots(routePolicy(`/${e.lang}${e.caminho}`, open)),
    openGraph: {
      type: e.tipo ?? 'website',
      url,
      siteName: ENTITY.nome,
      locale: localeOg(e.lang),
      alternateLocale: languageSet.filter((i) => i.lang !== e.lang).map((i) => localeOg(i.lang as Ready)),
      title: e.titulo,
      description: description,
      images: [{ url: image, width: 1200, height: 630, alt: e.titulo }],
    },
    twitter: { card: 'summary_large_image', title: e.titulo, description: description, images: [image] },
  }
}

/** Metadata of a registry route (`routes.ts`), with the text from `institucional.<language>.json`. */
export function routeMeta(lang: Ready, id: string, env: Environment = process.env): Metadata {
  const route = ROUTES.find((r) => r.id === id)
  if (!route || route.externo !== undefined) throw new Error(`rota interna desconhecida: ${id}`)
  const m = metaOf(lang, id)
  return pageMeta({ lang, caminho: route.caminho, titulo: m.titulo, descricao: m.descricao, imageId: id }, env)
}
