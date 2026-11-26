import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { isReady, type Ready } from '@/lib/i18n'
import { metaOf, pageOf } from '@/lib/i18n-extra'
import { routeMeta } from '@/lib/seo/metadata'
import { breadcrumbs as breadcrumbsJson, page as pageJson, type JsonLd } from '@/lib/seo/jsonld'
import { ROUTES } from '@/lib/seo/routes'
import { absoluteUrl, urlBase } from '@/lib/site'
import EditorialPage, { Sections, type BreadcrumbItem } from './EditorialPage'

type Params = { params: Promise<{ lang: string }> }
export type Extra = (a: { lang: Ready }) => ReactNode | Promise<ReactNode>

type Options = {
  tipo?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage'
  /** Id of the parent route, for the breadcrumb (e.g. the API sits inside "developers"). */
  pai?: string
  /** Content after the sections of the text. */
  extra?: Extra
  /** Extra structured data, besides the WebPage and the breadcrumbs. */
  jsonld?: (a: { lang: Ready; url: string; base: string }) => JsonLd[]
  /** Swaps the order: the `extra` before the sections of the text (list pages). */
  extraBefore?: boolean
}

/** `generateMetadata` of a route of the registry. */
export const institutionalMetadata =
  (id: string) =>
  async ({ params }: Params): Promise<Metadata> => {
    const { lang } = await params
    return routeMeta(isReady(lang) ? lang : 'pt', id)
  }

/** A text page: breadcrumbs, short answer, sections, "see also" and structured data, all from the registry and the i18n. */
export function institutionalPage(id: string, o: Options = {}) {
  return async function InstitutionalPage({ params }: Params) {
    const { lang } = await params
    if (!isReady(lang)) notFound()
    const route = ROUTES.find((r) => r.id === id)
    if (!route) throw new Error(`rota desconhecida: ${id}`)
    const t = pageOf(lang, id)
    const m = metaOf(lang, id)
    const base = urlBase()
    const url = absoluteUrl(base, lang, route.caminho)
    const trail: BreadcrumbItem[] = []
    if (o.pai) {
      const parent = ROUTES.find((r) => r.id === o.pai)
      if (parent) trail.push({ nome: metaOf(lang, o.pai).titulo, href: `/${lang}${parent.caminho}` })
    }
    trail.push({ nome: m.titulo, href: `/${lang}${route.caminho}` })
    const breadcrumbsJsonLd = breadcrumbsJson([{ nome: 'folgali', url: absoluteUrl(base, lang) }, ...trail.map((x) => ({ nome: x.nome, url: `${base}${x.href}` }))])
    const extra = o.extra ? await o.extra({ lang }) : null
    return (
      <EditorialPage
        lang={lang}
        titulo={m.titulo}
        respostaCurta={t.respostaCurta}
        atualizadoEm={t.atualizadoEm}
        rascunho={t.rascunho}
        migalhas={trail}
        ver={t.ver}
        cover={id}
        jsonld={[pageJson(base, { tipo: o.tipo, url, titulo: m.titulo, descricao: m.descricao, lang, atualizadoEm: t.atualizadoEm }), breadcrumbsJsonLd, ...(o.jsonld?.({ lang, url, base }) ?? [])]}
      >
        {o.extraBefore && extra}
        <Sections secoes={t.secoes} />
        {!o.extraBefore && extra}
      </EditorialPage>
    )
  }
}
