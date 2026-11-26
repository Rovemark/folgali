import BetaNotice from '@/components/legal/BetaNotice'
import { legalDict } from '@/lib/legal-i18n'
import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { IcSearch, IcBell } from '@/components/folgali/Icons'
import Lateral from '@/components/folgali/Sidebar'
import { PlushPhotoProvider } from '@/components/folgali/PlushPhotos'
import Brand from '@/components/Brand'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import GlobalLife from '@/components/life/GlobalLife'
import { loadShell } from '@/lib/context'
import { fontClasses } from '@/lib/fonts'
import { META, dict, isReady, type Ready } from '@/lib/i18n'
import { instDict } from '@/lib/i18n-extra'
import { JsonLd } from '@/components/seo/JsonLd'
import { graph, organization, website } from '@/lib/seo/jsonld'
import { metaRobots, routePolicy } from '@/lib/seo/policy'
import { indexable, urlBase } from '@/lib/site'
import '../globals.css'
import '../social-base.css'
import '../social-profile.css'
import '../social-communities.css'
import '../social-pages.css'
import '../social-relay.css'
import '../social-panel.css'
import '../social-messages.css'
import '../footer.css'
import '../editorial.css'
import '../languages.css'
import '../media.css'
import '../folgali.css'
import '../folgali-screens.css'
import '../folgali-life.css'
import '../folgali-fidelity.css'
import '../folgali-front.css'
import '../folgali-karma.css'
import '../legal.css'

export const dynamic = 'force-dynamic'

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('rn-tema');if(t==='escuro'||t==='claro'){document.documentElement.dataset.tema=t}else if(matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.dataset.tema='escuro'}}catch(e){}})()`

// Before the first paint: with motion allowed, whatever is drawn on arrival at the screen (timeline, mood chart) is already born
// at its starting point, without flashing ready and then disappearing (src/app/folgali-life.css, src/components/life/GlobalLife.tsx).
const LIFE_SCRIPT = `(function(){try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.dataset.vida='1'}}catch(e){}})()`

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const d = dict(isReady(lang) ? lang : 'pt')
  return {
    metadataBase: new URL(urlBase()),
    title: { default: d.meta.titulo, template: '%s · folgali' },
    description: d.meta.descricao,
    // Closed by default (demonstration on a provisional domain, legal texts in draft). The flag FOLGALI_INDEXABLE=sim opens
    // the public content; each page overrides it with its own route policy (src/lib/seo/policy.ts).
    robots: metaRobots(routePolicy(`/${lang}`, indexable())),
    icons: {
      icon: [
        { url: '/marca/folgali/icone-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/marca/folgali/icone-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/marca/folgali/icone-180.png', sizes: '180x180' }],
    },
    manifest: '/manifest.webmanifest',
    applicationName: 'folgali',
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F1EA' },
    { media: '(prefers-color-scheme: dark)', color: '#111318' },
  ],
}

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const shell = await loadShell()
  const f = d.socFolgali
  const me = shell.eu
  return (
    <html lang={META[lang].html} dir={META[lang].dir} className={fontClasses} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LIFE_SCRIPT }} />
      </head>
      <body>
        <PlushPhotoProvider enabled={shell.demonstracao}>
        <a className="skip" href="#principal">
          {d.nav.pularConteudo}
        </a>
        {shell.demonstracao && (
          <div className="band-demo" role="note">
            <span className="short">{d.demo.curto}</span>
            <span className="long">{d.demo.longo}</span>
          </div>
        )}
        <BetaNotice lang={lang} text={legalDict(lang).beta.faixa} more={legalDict(lang).beta.saibaMais} />
        <header className="top">
          <div className="top-inside">
            <Brand lang={lang} rotulo={f.topo.irInicio} />
            <form className="top-search" action={`/${lang}/buscar`} method="get" role="search">
              <label htmlFor="busca-topo" className="reader-only">
                {f.topo.buscar}
              </label>
              <IcSearch />
              <input id="busca-topo" name="q" type="search" placeholder={f.topo.buscar} autoComplete="off" maxLength={100} />
            </form>
            <span className="space" />
            <Link href={`/${lang}/buscar`} className="icon-btn phone-only search-phone" aria-label={f.topo.buscar}>
              <IcSearch />
            </Link>
            <Link href={`/${lang}/avisos`} className="icon-btn phone-only com-badge" aria-label={f.topo.avisos}>
              <IcBell />
              {shell.novas > 0 && <span className="badge-num" aria-hidden>{shell.novas > 9 ? '9+' : shell.novas}</span>}
            </Link>
            <Navigation lang={lang} topo={f.topo} trilho={f.trilho} novas={shell.novas} eu={me} mensagens={shell.mensagens} modo="topo" />
          </div>
        </header>
        <div className="shell">
          <aside className="rail">
            <Navigation lang={lang} topo={f.topo} trilho={f.trilho} novas={shell.novas} eu={me} mensagens={shell.mensagens} modo="trilho" />
          </aside>
          <main id="principal" className="content">
            {children}
          </main>
          <aside className="side" aria-label={f.lateral.titulo}>
            <Lateral lang={lang} d={d} demonstracao={shell.demonstracao} />
            <section className="box lat-block" aria-labelledby="lat-regras">
              <h2 id="lat-regras" className="lat-title">{d.linha.regraTitulo}</h2>
              <ol className="rules">
                {d.linha.regras.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
        <Footer lang={lang} demonstracao={shell.demonstracao} />
        <Navigation lang={lang} topo={f.topo} trilho={f.trilho} novas={shell.novas} eu={me} mensagens={shell.mensagens} modo="abas" />
        <GlobalLife />
        </PlushPhotoProvider>
        {indexable() && <JsonLd dados={graph(organization(urlBase(), instDict(lang).entidade.descricaoCurta), website(urlBase(), lang, d.meta.titulo, d.meta.descricao))} />}
      </body>
    </html>
  )
}

export type { Ready }
