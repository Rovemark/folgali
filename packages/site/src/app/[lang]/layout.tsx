import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { IcBuscar, IcSino } from '@/components/folgali/Icones'
import Lateral from '@/components/folgali/Lateral'
import Marca from '@/components/Marca'
import Navegacao from '@/components/Navegacao'
import Rodape from '@/components/Rodape'
import { carregarCasca } from '@/lib/contexto'
import { classesDeFonte } from '@/lib/fontes'
import { META, dict, ehPronto, type Pronto } from '@/lib/i18n'
import { instDict } from '@/lib/i18n-extra'
import { JsonLd } from '@/components/seo/JsonLd'
import { grafo, organizacao, website } from '@/lib/seo/jsonld'
import { metaRobots, politicaDaRota } from '@/lib/seo/politica'
import { indexavel, urlBase } from '@/lib/site'
import '../globals.css'
import '../social-base.css'
import '../social-perfil.css'
import '../social-comunidades.css'
import '../social-paginas.css'
import '../social-rele.css'
import '../social-painel.css'
import '../social-mensagens.css'
import '../rodape.css'
import '../editorial.css'
import '../idiomas.css'
import '../midia.css'
import '../folgali.css'
import '../folgali-telas.css'

export const dynamic = 'force-dynamic'

const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('rn-tema');if(t==='escuro'||t==='claro'){document.documentElement.dataset.tema=t}else if(matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.dataset.tema='escuro'}}catch(e){}})()`

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const d = dict(ehPronto(lang) ? lang : 'pt')
  return {
    metadataBase: new URL(urlBase()),
    title: { default: d.meta.titulo, template: '%s · folgali' },
    description: d.meta.descricao,
    // Fechado por padrão (demonstração em domínio provisório, textos legais em rascunho). A flag ROVER_NETWORK_INDEXAVEL=sim abre
    // o conteúdo público; cada página sobrescreve com a política da própria rota (src/lib/seo/politica.ts).
    robots: metaRobots(politicaDaRota(`/${lang}`, indexavel())),
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
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const casca = await carregarCasca()
  const f = d.socFolgali
  const eu = casca.eu
  return (
    <html lang={META[lang].html} dir={META[lang].dir} className={classesDeFonte} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <a className="pular" href="#principal">
          {d.nav.pularConteudo}
        </a>
        {casca.demonstracao && (
          <div className="faixa-demo" role="note">
            <span className="curto">{d.demo.curto}</span>
            <span className="longo">{d.demo.longo}</span>
          </div>
        )}
        <header className="topo">
          <div className="topo-dentro">
            <Marca lang={lang} rotulo={f.topo.irInicio} />
            <form className="topo-busca" action={`/${lang}/buscar`} method="get" role="search">
              <label htmlFor="busca-topo" className="so-leitor">
                {f.topo.buscar}
              </label>
              <IcBuscar />
              <input id="busca-topo" name="q" type="search" placeholder={f.topo.buscar} autoComplete="off" maxLength={100} />
            </form>
            <span className="espaco" />
            <Link href={`/${lang}/buscar`} className="icone-btn so-celular busca-cel" aria-label={f.topo.buscar}>
              <IcBuscar />
            </Link>
            <Link href={`/${lang}/avisos`} className="icone-btn so-celular com-selo" aria-label={f.topo.avisos}>
              <IcSino />
              {casca.novas > 0 && <span className="selo-num" aria-hidden>{casca.novas > 9 ? '9+' : casca.novas}</span>}
            </Link>
            <Navegacao lang={lang} topo={f.topo} trilho={f.trilho} novas={casca.novas} eu={eu} mensagens={casca.mensagens} modo="topo" />
          </div>
        </header>
        <div className="casca">
          <aside className="trilho">
            <Navegacao lang={lang} topo={f.topo} trilho={f.trilho} novas={casca.novas} eu={eu} mensagens={casca.mensagens} modo="trilho" />
          </aside>
          <main id="principal" className="conteudo">
            {children}
          </main>
          <aside className="lateral" aria-label={f.lateral.titulo}>
            <Lateral lang={lang} d={d} demonstracao={casca.demonstracao} />
            <section className="caixa lat-bloco" aria-labelledby="lat-regras">
              <h2 id="lat-regras" className="lat-titulo">{d.linha.regraTitulo}</h2>
              <ol className="regras">
                {d.linha.regras.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
        <Rodape lang={lang} demonstracao={casca.demonstracao} />
        <Navegacao lang={lang} topo={f.topo} trilho={f.trilho} novas={casca.novas} eu={eu} mensagens={casca.mensagens} modo="abas" />
        {indexavel() && <JsonLd dados={grafo(organizacao(urlBase(), instDict(lang).entidade.descricaoCurta), website(urlBase(), lang, d.meta.titulo, d.meta.descricao))} />}
      </body>
    </html>
  )
}

export type { Pronto }
