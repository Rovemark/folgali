import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ErrorState from '@/components/social/ErrorState'
import ProposalForm from '@/components/social/ProposalForm'
import { IcLock } from '@/components/Icons'
import { whoAmI } from '@/lib/communities/data'
import { dict, isReady } from '@/lib/i18n'
import { ACCESS_LEVELS } from '@/lib/social/types'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/comunidades/nova', dict(isReady(lang) ? lang : 'pt').socComunidades.nova.titulo)
}

export default async function NewCommunity({ params }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socComunidades.nova
  const me = await whoAmI()
  return (
    <>
      <div className="page-title">
        <p className="overline">
          <Link href={`/${lang}/comunidades`}>{t.voltar}</Link>
        </p>
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      {!me ? (
        <ErrorState codigo="sem-permissao" d={d} lang={lang} />
      ) : (
        <div className="stack-large">
          <section className="stack" aria-labelledby="acesso-t">
            <h2 id="acesso-t">{t.acessoTitulo}</h2>
            <ul className="com-accesses">
              {ACCESS_LEVELS.map((a) => (
                <li key={a} className="card com-access" data-acesso={a}>
                  <strong>{d.socComum.acessos[a].nome}</strong>
                  <span className="soft">{d.socComum.acessos[a].texto}</span>
                </li>
              ))}
            </ul>
            <p className="proposal-note">
              <IcLock width={18} height={18} /> <span>{t.fechadaAviso}</span>
            </p>
            <p className="fine">{t.nomeUnico}</p>
            <p className="fine">{t.categoriasDica}</p>
          </section>
          <section className="card" aria-labelledby="form-t">
            <h2 id="form-t" className="reader-only">
              {t.titulo}
            </h2>
            <p className="soft">{t.voce}</p>
            <ProposalForm
              tipo="comunidade-criar"
              d={d}
              lang={lang}
              canWrite
              roverName={me.nome}
              destino={null}
              campos={{ nome: '', descricao: '', regras: '', tema: '', acesso: 'aberta', categorias: [] }}
            />
          </section>
        </div>
      )}
    </>
  )
}
