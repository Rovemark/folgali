import Link from 'next/link'
import type { Ready } from '@/lib/i18n'
import { footerDict, labelOf } from '@/lib/i18n-extra'
import { MAP_SECTIONS, sectionRoutes } from '@/lib/seo/routes'

/**
 * The full site map: every route of the registry that has a `secao`, grouped as in the registry. The footer shows only a short
 * selection; this page is where everything else stays one click away (the `rodape` test checks that no route is left out).
 */
export default function SiteMap({ lang }: { lang: Ready }) {
  const r = footerDict(lang)
  const sections = r.secoes as Record<string, string>
  return (
    <div className="sitemap">
      {MAP_SECTIONS.map((s) => (
        <section key={s} aria-labelledby={`mapa-${s}`} className="map-group">
          <h2 id={`mapa-${s}`}>{sections[s]}</h2>
          <ul>
            {sectionRoutes(s).map((route) => (
              <li key={route.id}>
                {route.externo !== undefined ? (
                  <a href={route.externo} target="_blank" rel="noopener">
                    {labelOf(lang, route.id)}
                    <span className="reader-only"> ({r.abreEmNovaAba})</span>
                  </a>
                ) : (
                  <Link href={`/${lang}${route.caminho}`}>{labelOf(lang, route.id)}</Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
