import Link from 'next/link'
import FooterGroup from '@/components/FooterGroup'
import FooterLanguages from '@/components/FooterLanguages'
import ThemeSwitch from '@/components/ThemeSwitch'
import Brand from '@/components/Brand'
import { IcGitHub } from '@/components/CodeLink'
import { dict, type Ready } from '@/lib/i18n'
import { fill, legalDict } from '@/lib/legal-i18n'
import { footerDict } from '@/lib/i18n-extra'
import { FOOTER_COLUMNS, ROUTES, footerRoutes, type Route } from '@/lib/seo/routes'
import { ENTITY, indexable } from '@/lib/site'

// The site footer, built from the route registry (`RODAPE` in `src/lib/seo/routes.ts`): the brand with a short line and three icons,
// four short columns, a discreet line with the remaining legal documents and the final strip (copyright, Terms, Privacy, Cookies,
// beta, language and theme). Every route that is not here is on the site map, which the legal line links. The `rodape` test checks
// each route against a page.tsx and the `varrer-rodape` script checks that each one answers 200 on the preview.
// No cookie, no tracking, no script and no third-party font.

function LinkItem({ rota: route, lang, rotulo: label, fora: outside }: { rota: Route; lang: Ready; rotulo: string; fora: string }) {
  if (route.externo !== undefined) {
    return (
      <a href={route.externo} target="_blank" rel="noopener">
        {label}
        <span className="reader-only"> ({outside})</span>
      </a>
    )
  }
  return <Link href={`/${lang}${route.caminho}`}>{label}</Link>
}

const IcLetter = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4.5 7 7.5 6 7.5-6" />
  </svg>
)
const IcRss = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14" />
    <circle cx="6" cy="18" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)

/** "Reports: {abuse} · Security: {seguranca}" with the two addresses as mail links, kept left to right inside any language. */
function Contacts({ model }: { model: string }) {
  const emails: Record<string, string> = { abuse: ENTITY.emails.abuse, seguranca: ENTITY.emails.security }
  return (
    <p className="footer-contacts">
      {model.split(/(\{abuse\}|\{seguranca\})/).map((part, i) => {
        const email = emails[part.slice(1, -1)]
        return email ? (
          <a key={i} href={`mailto:${email}`}>
            <bdi dir="ltr">{email}</bdi>
          </a>
        ) : (
          part
        )
      })}
    </p>
  )
}

export default function Footer({ lang, demonstracao: isDemo }: { lang: Ready; demonstracao: boolean }) {
  const r = footerDict(lang)
  const d = dict(lang)
  const labels = r.rotulos as Record<string, string>
  const columns = r.colunas as Record<string, string>
  const legal = legalDict(lang)
  const [code] = footerRoutes('marca')
  const contact = ROUTES.find((x) => x.id === 'contato')
  const year = fill(r.ano, { ano: new Date().getFullYear() })
  const complete = fill(legal.rodape.copyright, { ano: new Date().getFullYear() })
  const marks = complete.startsWith(year) ? complete.slice(year.length).trim() : ''
  return (
    <footer className="footer" aria-label={r.navegacao}>
      <div className="footer-inside">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand art (Luna napping on the net) */}
        <img src="/marca/folgali/showcase/luna-nap.webp" alt="" width={512} height={450} className="footer-luna" loading="lazy" decoding="async" />
        <div className="footer-middle">
          <div className="footer-brand">
            <Brand lang={lang} />
            <p className="footer-description">{r.marca.descricao}</p>
            <ul className="footer-icons">
              {code?.externo !== undefined && (
                <li>
                  <a href={code.externo} target="_blank" rel="noopener" className="footer-icon" title={labels.codigo}>
                    <IcGitHub tamanho={18} />
                    <span className="reader-only">
                      {labels.codigo} ({r.abreEmNovaAba})
                    </span>
                  </a>
                </li>
              )}
              {contact && (
                <li>
                  <Link href={`/${lang}${contact.caminho}`} className="footer-icon" title={labels.contato}>
                    <IcLetter />
                    <span className="reader-only">{labels.contato}</span>
                  </Link>
                </li>
              )}
              {/* the feed only exists with the site open to indexing (outside it, /rss.xml answers 404): the icon follows */}
              {indexable() && (
                <li>
                  <a href={`/${lang}/rss.xml`} className="footer-icon" title={r.rss}>
                    <IcRss />
                    <span className="reader-only">{r.rss}</span>
                  </a>
                </li>
              )}
            </ul>
          </div>
          <nav className="footer-nav" aria-label={r.navegacao}>
            {FOOTER_COLUMNS.map((c) => (
              // on phones each column folds (FooterGroup); the one with Contact, a link the legal team wants in plain sight, never does
              <FooterGroup key={c} id={`rodape-${c}`} title={columns[c]} alwaysOpen={footerRoutes(c).some((x) => x.id === 'contato')}>
                <ul>
                  {footerRoutes(c).map((route) => (
                    <li key={route.id}>
                      <LinkItem rota={route} lang={lang} rotulo={labels[route.id]} fora={r.abreEmNovaAba} />
                    </li>
                  ))}
                </ul>
              </FooterGroup>
            ))}
          </nav>
        </div>

        <nav className="footer-legal" aria-label={r.legal}>
          <ul>
            {footerRoutes('legal').map((route) => (
              <li key={route.id}>
                <LinkItem rota={route} lang={lang} rotulo={labels[route.id]} fora={r.abreEmNovaAba} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="footer-base">
          <div className="footer-base-text">
            {/* the legal team's full sentence: "© {year} Rovemark Inc." stays left to right in
                every language (in Arabic, without it, the "©" and the year swap places) and the rest follows the language, in small print */}
            <p className="footer-copy">
              <bdi dir="ltr">{year}</bdi>
              {marks && <span className="footer-brands"> {marks}</span>}
            </p>
            <ul className="footer-base-links" aria-label={legal.rodape.secao}>
              {footerRoutes('base').map((route) => (
                <li key={route.id}>
                  <LinkItem rota={route} lang={lang} rotulo={labels[route.id]} fora={r.abreEmNovaAba} />
                </li>
              ))}
            </ul>
            <p className="footer-beta">{r.beta}</p>
          </div>
          <div className="footer-preferences">
            <FooterLanguages lang={lang} rotulo={r.idioma} />
            <ThemeSwitch rotulo={r.tema} />
          </div>
        </div>

        <div className="footer-fine">
          {/* the reporting and security addresses the legal team wants in plain sight, on every page */}
          <Contacts model={r.contatos} />
          <p>{d.rodape.linha2}</p>
          {isDemo && <p>{r.demo}</p>}
          {lang !== 'pt' && lang !== 'en' && <p>{legal.rodape.traducao}</p>}
          {lang !== 'pt' && <p>{r.traducao}</p>}
        </div>
      </div>
    </footer>
  )
}
