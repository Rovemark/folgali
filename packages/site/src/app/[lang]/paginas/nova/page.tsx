import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IcSeta } from '@/components/Icones'
import FormProposta from '@/components/social/FormProposta'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { metaTela } from '@/lib/seo/meta-telas'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return metaTela(lang, '/paginas/nova', dict(ehPronto(lang) ? lang : 'pt').socPaginas.criar.titulo)
}

export default async function NovaPagina({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socPaginas.criar
  const eu = await obterRede().ponte.quemSou()
  return (
    <>
      <Link href={`/${lang}/paginas`} className="voltar">
        <IcSeta width={20} height={20} /> {d.comum.voltar}
      </Link>
      <div className="titulo-pag">
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      <section className="cartao" aria-labelledby="nova-t">
        <h2 id="nova-t" className="so-leitor">
          {t.titulo}
        </h2>
        <FormProposta
          tipo="pagina-criar"
          d={d}
          lang={lang}
          campos={{ nome: '', descricao: '', tema: '' }}
          destino={null}
          podeEscrever={eu !== null}
          nomeDoRover={eu?.nome}
          enviar={t.enviar}
        />
      </section>
      <ul className="pilha regras-pagina" aria-label={t.regrasTitulo}>
        {t.regras.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </>
  )
}
