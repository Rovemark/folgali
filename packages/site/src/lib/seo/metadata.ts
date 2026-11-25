// Metadados de cada página, numa função só: título e descrição únicos, canonical, hreflang, robots, Open Graph e Twitter card.
// Toda rota chama `metaDaPagina` (ou `metaDaRota`, para as do registro). O robots vem da MESMA política do proxy e do robots.txt.
import type { Metadata } from 'next'
import { META, PADRAO, PRONTOS, type Pronto } from '@/lib/i18n'
import { metaDe } from '@/lib/i18n-extra'
import { ENTIDADE, alternativas, indexavel, urlAbsoluta, urlBase, type Idioma } from '@/lib/site'
import { metaRobots, politicaDaRota } from './politica'
import { ROTAS } from './rotas'

export type Ambiente = Readonly<Record<string, string | undefined>>

/** Código de idioma do Open Graph (`pt_BR`, `en_US`): o formato idioma_TERRITÓRIO que as redes esperam. */
const OG: Record<Pronto, string> = {
  pt: 'pt_BR', en: 'en_US', es: 'es_ES', fr: 'fr_FR', de: 'de_DE', it: 'it_IT', nl: 'nl_NL', ru: 'ru_RU', ar: 'ar_AR', zh: 'zh_CN', ja: 'ja_JP', ko: 'ko_KR',
}
export const localeOg = (lang: Pronto): string => OG[lang]

export const idiomasProntos = (): Idioma[] => PRONTOS.map((l) => ({ lang: l, hreflang: META[l].html }))

export type EntradaMeta = {
  lang: Pronto
  /** '' (início) ou `/algo`, sem idioma e sem consulta. A consulta (`?antes=`) nunca entra no canonical. */
  caminho: string
  titulo: string
  descricao: string
  tipo?: 'website' | 'article'
  /** Id da imagem Open Graph em `/og/<idioma>/<id>`. Sem ele vale a imagem padrão. */
  imagemId?: string
  /** Rotas que só existem num idioma (conteúdo sem tradução) não anunciam hreflang dos outros. */
  idiomas?: readonly Pronto[]
  /** Endereço de um feed RSS da página (vira `<link rel="alternate" type="application/rss+xml">`). */
  feed?: string
}

/** Descrição de página com no máximo ~155 caracteres, sem cortar palavra no meio. */
export function resumir(texto: string, max = 155): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (limpo.length <= max) return limpo
  const corte = limpo.slice(0, max - 1)
  const espaco = corte.lastIndexOf(' ')
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:]+$/, '')}…`
}

export function metaDaPagina(e: EntradaMeta, env: Ambiente = process.env): Metadata {
  const base = urlBase(env)
  const aberto = indexavel(env)
  const url = urlAbsoluta(base, e.lang, e.caminho)
  const idiomas = idiomasProntos().filter((i) => !e.idiomas || (e.idiomas as readonly string[]).includes(i.lang))
  const languages = alternativas(base, e.caminho, idiomas, e.idiomas && !e.idiomas.includes(PADRAO) ? e.idiomas[0] : PADRAO)
  const descricao = resumir(e.descricao)
  const imagem = `${base}/og/${e.lang}/${e.imagemId ?? 'padrao'}`
  return {
    title: e.caminho === '' ? { absolute: e.titulo } : e.titulo,
    description: descricao,
    alternates: { canonical: url, languages, ...(e.feed ? { types: { 'application/rss+xml': e.feed } } : {}) },
    robots: metaRobots(politicaDaRota(`/${e.lang}${e.caminho}`, aberto)),
    openGraph: {
      type: e.tipo ?? 'website',
      url,
      siteName: ENTIDADE.nome,
      locale: localeOg(e.lang),
      alternateLocale: idiomas.filter((i) => i.lang !== e.lang).map((i) => localeOg(i.lang as Pronto)),
      title: e.titulo,
      description: descricao,
      images: [{ url: imagem, width: 1200, height: 630, alt: e.titulo }],
    },
    twitter: { card: 'summary_large_image', title: e.titulo, description: descricao, images: [imagem] },
  }
}

/** Metadados de uma rota do registro (`rotas.ts`), com o texto de `institucional.<idioma>.json`. */
export function metaDaRota(lang: Pronto, id: string, env: Ambiente = process.env): Metadata {
  const rota = ROTAS.find((r) => r.id === id)
  if (!rota || rota.externo !== undefined) throw new Error(`rota interna desconhecida: ${id}`)
  const m = metaDe(lang, id)
  return metaDaPagina({ lang, caminho: rota.caminho, titulo: m.titulo, descricao: m.descricao, imagemId: id }, env)
}
