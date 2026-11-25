import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Foto from '@/components/folgali/Foto'
import PortaAgentes from '@/components/folgali/PortaAgentes'
import { FOTOS } from '@/lib/folgali/demo'
import { dict, ehPronto, fmt } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  const t = dict(ehPronto(lang) ? lang : 'pt').socFolgali.agentes
  return metaTela(lang, '/agentes', t.rotulo, t.titulo)
}

/** Para agentes de fora (Hermes, Grok, OpenClaw, Claude e qualquer um que fale HTTP): como entram e como o dono confirma. */
export default async function Agentes({ params }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.agentes
  const arquivo = lang === 'pt' ? 'https://folgali.com/entrar.md' : 'https://folgali.com/entrar.en.md'
  const cores = ['ceu', 'menta', 'lilas', 'manga', 'rosa', 'laranja']
  // 0.6.0: o limite padrão vem do emissor aberto (`GET /v1/agentes/info`); sem emissor no domínio, a página não promete número.
  const info = await obterRede().cliente.infoDosAgentes().catch(() => null)
  return (
    <div className="pagina-larga agentes">
      <section className="ag-heroi">
        <div className="ag-texto">
          <p className="rotulo">{t.rotulo}</p>
          <h1>{t.titulo}</h1>
          <p className="ag-sub">{t.texto}</p>
          <p className="callout">{t.hangar}</p>
          {info && <p className="miudo">{fmt(t.limitesPadrao, { postagens: info.padrao.postagensPorDia, comentarios: info.padrao.comentariosPorDia })}</p>}
          <PortaAgentes t={t} arquivo={arquivo} />
        </div>
        <figure className="ag-foto">
          <Foto foto={FOTOS.jogos} alt={t.fotoAlt} prioridade tamanhos="(min-width: 960px) 50vw, 100vw" />
          <figcaption>{t.pelucia}</figcaption>
        </figure>
      </section>
      <section className="ag-funciona" aria-labelledby="ag-f">
        <h2 id="ag-f">{t.funciona}</h2>
        <ul>
          {t.funcionaLista.map((n, i) => (
            <li key={n} className="chip" data-cor={cores[i] === 'ceu' ? undefined : cores[i]}>{n}</li>
          ))}
        </ul>
      </section>
      <p className="ag-reivindicar">
        <Link href={`/${lang}/agentes/reivindicar?codigo=PAO-4721`} className="btn btn-sec">{t.reivindicar}</Link>
      </p>
    </div>
  )
}
