import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/editorial/EditorialPage'
import { JsonLd } from '@/components/seo/JsonLd'
import LegalMarkdown, { headingsOf, titleOf } from '@/components/legal/LegalMarkdown'
import { effectiveDate, legalLink, legalPage, legalText, legalVersion, LEGAL_PAGES } from '@/legal/pages'
import { META, isReady, type Ready } from '@/lib/i18n'
import { metaOf, labelOf } from '@/lib/i18n-extra'
import { fill, legalDict } from '@/lib/legal-i18n'
import { routeMeta } from '@/lib/seo/metadata'
import { graph, breadcrumbs as breadcrumbsJson, page as pageJson } from '@/lib/seo/jsonld'
import { indexable, absoluteUrl, urlBase } from '@/lib/site'

type Params = { params: Promise<{ lang: string }> }

/** `generateMetadata` of a legal page: title and description from the route registry, like every other page. */
export const legalMetadata =
  (key: string) =>
  async ({ params }: Params): Promise<Metadata> => {
    const { lang } = await params
    return routeMeta(isReady(lang) ? lang : 'pt', legalPage(key).routeId)
  }

function dateText(lang: Ready, iso: string | null, fallback: string): string {
  if (!iso) return fallback
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(META[lang].html, { dateStyle: 'long', timeZone: 'UTC' })
}

/** A legal page: version and beta notice on top, the machine-translation notice where it applies, contents, the text, and the others. */
export function legalPageView(key: string) {
  return async function LegalPageRoute({ params }: Params) {
    const { lang } = await params
    if (!isReady(lang)) notFound()
    const page = legalPage(key)
    const t = legalDict(lang)
    const doc = legalText(key, lang)
    const title = titleOf(doc.md) || metaOf(lang, page.routeId).titulo
    const heads = headingsOf(doc.md)
    const iso = effectiveDate()
    const base = urlBase()
    const url = absoluteUrl(base, lang, page.path)
    const trail = [{ nome: metaOf(lang, page.routeId).titulo, href: `/${lang}${page.path}` }]
    const m = metaOf(lang, page.routeId)
    return (
      <article className="editorial legal">
        <Breadcrumbs lang={lang} itens={trail} />
        <header className="page-title">
          <h1 lang={doc.lang === lang ? undefined : META[doc.lang].html}>{title}</h1>
        </header>
        <div className="legal-notice" role="note">
          <p>{fill(t.pagina.versao, { versao: legalVersion(key), data: dateText(lang, iso, t.pagina.dataAInformar) })}</p>
          {(doc.machine || doc.lang !== lang) && (
            <p>
              {t.pagina.traducao} <Link href={`/pt${page.path}`} lang="pt-BR">{legalDict('pt').pagina.lerPortugues}</Link>
              {' · '}
              <Link href={`/en${page.path}`} lang="en">{legalDict('en').pagina.lerIngles}</Link>
            </p>
          )}
        </div>
        {heads.length > 3 && (
          <nav className="legal-index" aria-labelledby={`indice-${key}`}>
            <h2 id={`indice-${key}`} className="overline">{t.pagina.indice}</h2>
            <ol>
              {heads.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`}>{h.text.replace(/^\d+(?:\.\d+)*[.)]?\s+/, '')}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div lang={doc.lang === lang ? undefined : META[doc.lang].html}>
          <LegalMarkdown md={doc.md} link={legalLink(lang)} />
        </div>
        <aside className="see-also legal-related" aria-labelledby={`rel-${key}`}>
          <h2 id={`rel-${key}`}>{t.pagina.relacionados}</h2>
          <ul>
            {LEGAL_PAGES.filter((p) => p.key !== key).map((p) => (
              <li key={p.key}>
                <Link href={`/${lang}${p.path}`} className="chip">{labelOf(lang, p.routeId)}</Link>
              </li>
            ))}
          </ul>
        </aside>
        {indexable() && (
          <JsonLd
            dados={graph(
              pageJson(base, { url, titulo: m.titulo, descricao: m.descricao, lang, atualizadoEm: '2026-11-24' }),
              breadcrumbsJson([{ nome: 'folgali', url: absoluteUrl(base, lang) }, { nome: m.titulo, url }]),
            )}
          />
        )}
      </article>
    )
  }
}
