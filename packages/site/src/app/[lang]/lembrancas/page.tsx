import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import BotaoLembranca from '@/components/folgali/BotaoLembranca'
import Foto from '@/components/folgali/Foto'
import { FOTOS, lembrancas, roverDaFolga } from '@/lib/folgali/demo'
import { deNome } from '@/lib/folgali/genero'
import { dict, ehPronto, fmt } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaTela(lang, '/lembrancas', dict(ehPronto(lang) ? lang : 'pt').socFolgali.trilho.lembrancas)
}

/** Lembranças: o que aconteceu nesta mesma época, na folga do rover da pessoa. Demonstração. */
export default async function Lembrancas({ params }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.lembrancas
  const { ponte } = obterRede()
  const eu = await ponte.quemSou().catch(() => null)
  const nome = eu?.nome ?? ''
  const l = lembrancas()
  const quando = t.quando as Record<string, string>
  return (
    <div className="lembrancas">
      <div className="titulo-pag">
        <h1>{fmt(t.titulo, { nome, deNome: deNome(nome, eu?.handle, lang) })}</h1>
      </div>
      <section className="caixa lemb-destaque" aria-labelledby="lemb-d">
        <h2 id="lemb-d" className="lat-titulo">{quando[l.destaque.quando]}</h2>
        <Foto foto={FOTOS[l.destaque.foto]} prioridade className="lemb-foto" />
        <div className="lemb-rodape">
          <p className="lemb-titulo">{l.destaque.titulo}</p>
          <BotaoLembranca rotulo={t.compartilhar} feito={fmt(t.compartilhada, { nome })} />
        </div>
      </section>
      <h2 className="feed-sep">{t.nesteDia}</h2>
      <ol className="lemb-linha">
        {l.nesteDia.map((x, i) => {
          const r = roverDaFolga(x.com)
          return (
            <li key={i} className="caixa lemb-item">
              <Foto foto={FOTOS[x.foto]} alt="" className="lemb-mini" />
              <div>
                <p className="miudo">{quando[x.quando]}</p>
                <p className="lemb-titulo">{x.titulo}</p>
                <Link href={`/${lang}/r/${x.com}`} className="lat-ver">{r.nome}</Link>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
