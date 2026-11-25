import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { ehPronto, type Pronto } from '@/lib/i18n'
import { metaDe, paginaDe } from '@/lib/i18n-extra'
import { metaDaRota } from '@/lib/seo/metadata'
import { migalhas as jsonMigalhas, pagina as jsonPagina, type JsonLd } from '@/lib/seo/jsonld'
import { ROTAS } from '@/lib/seo/rotas'
import { urlAbsoluta, urlBase } from '@/lib/site'
import PaginaEditorial, { Secoes, type ItemDeMigalha } from './PaginaEditorial'

type Params = { params: Promise<{ lang: string }> }
export type Extra = (a: { lang: Pronto }) => ReactNode | Promise<ReactNode>

type Opcoes = {
  tipo?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage'
  /** Id da rota-mãe, para a migalha (ex.: a API fica dentro de "desenvolvedores"). */
  pai?: string
  /** Conteúdo depois das seções do texto. */
  extra?: Extra
  /** Dados estruturados a mais, além do WebPage e das migalhas. */
  jsonld?: (a: { lang: Pronto; url: string; base: string }) => JsonLd[]
  /** Troca a ordem: o `extra` antes das seções do texto (páginas de lista). */
  extraAntes?: boolean
}

/** `generateMetadata` de uma rota do registro. */
export const metadataInstitucional =
  (id: string) =>
  async ({ params }: Params): Promise<Metadata> => {
    const { lang } = await params
    return metaDaRota(ehPronto(lang) ? lang : 'pt', id)
  }

/** Uma página de texto: migalhas, resposta curta, seções, "veja também" e dados estruturados, tudo do registro e do i18n. */
export function paginaInstitucional(id: string, o: Opcoes = {}) {
  return async function PaginaInstitucional({ params }: Params) {
    const { lang } = await params
    if (!ehPronto(lang)) notFound()
    const rota = ROTAS.find((r) => r.id === id)
    if (!rota) throw new Error(`rota desconhecida: ${id}`)
    const t = paginaDe(lang, id)
    const m = metaDe(lang, id)
    const base = urlBase()
    const url = urlAbsoluta(base, lang, rota.caminho)
    const trilha: ItemDeMigalha[] = []
    if (o.pai) {
      const pai = ROTAS.find((r) => r.id === o.pai)
      if (pai) trilha.push({ nome: metaDe(lang, o.pai).titulo, href: `/${lang}${pai.caminho}` })
    }
    trilha.push({ nome: m.titulo, href: `/${lang}${rota.caminho}` })
    const migalhasJson = jsonMigalhas([{ nome: 'folgali', url: urlAbsoluta(base, lang) }, ...trilha.map((x) => ({ nome: x.nome, url: `${base}${x.href}` }))])
    const extra = o.extra ? await o.extra({ lang }) : null
    return (
      <PaginaEditorial
        lang={lang}
        titulo={m.titulo}
        respostaCurta={t.respostaCurta}
        atualizadoEm={t.atualizadoEm}
        rascunho={t.rascunho}
        migalhas={trilha}
        ver={t.ver}
        jsonld={[jsonPagina(base, { tipo: o.tipo, url, titulo: m.titulo, descricao: m.descricao, lang, atualizadoEm: t.atualizadoEm }), migalhasJson, ...(o.jsonld?.({ lang, url, base }) ?? [])]}
      >
        {o.extraAntes && extra}
        <Secoes secoes={t.secoes} />
        {!o.extraAntes && extra}
      </PaginaEditorial>
    )
  }
}
