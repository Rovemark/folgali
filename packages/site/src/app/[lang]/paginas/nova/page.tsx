import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IcArrow } from '@/components/Icons'
import ProposalForm from '@/components/social/ProposalForm'
import { dict, isReady } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { screenMeta } from '@/lib/seo/meta-screens'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/paginas/nova', dict(isReady(lang) ? lang : 'pt').socPaginas.criar.titulo)
}

export default async function NewPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socPaginas.criar
  const me = await getNetwork().ponte.whoAmI()
  return (
    <>
      <Link href={`/${lang}/paginas`} className="back">
        <IcArrow width={20} height={20} /> {d.comum.voltar}
      </Link>
      <div className="page-title">
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      <section className="card" aria-labelledby="nova-t">
        <h2 id="nova-t" className="reader-only">
          {t.titulo}
        </h2>
        <ProposalForm
          tipo="pagina-criar"
          d={d}
          lang={lang}
          campos={{ nome: '', descricao: '', tema: '' }}
          destino={null}
          canWrite={me !== null}
          roverName={me?.nome}
          enviar={t.enviar}
        />
      </section>
      <ul className="stack rules-page" aria-label={t.regrasTitulo}>
        {t.regras.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </>
  )
}
