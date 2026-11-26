import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ErrorState from '@/components/social/ErrorState'
import ProposalForm from '@/components/social/ProposalForm'
import { ID_OK, whoAmI } from '@/lib/communities/data'
import { canEditTopic } from '@/lib/domain/permissions'
import { dict, isReady } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/t/${id}/editar`, dict(isReady(lang) ? lang : 'pt').socForum.topico.editar)
}

export default async function EditTopic({ params }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socForum.topico
  const tr = ID_OK.test(id) ? await load(() => getNetwork().cliente.topico(id)) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!tr.ok) return <ErrorState codigo={tr.codigo} d={d} lang={lang} />
  const topic = tr.valor
  const me = await whoAmI()
  const v = canEditTopic({ meuTopico: !!me && me.uid === topic.autor.uid, createdAtMs: Date.parse(topic.criadoEm), nowMs: Date.parse(new Date().toISOString()), edicoes: topic.versoes - 1, trancado: topic.trancado })
  return (
    <>
      <div className="page-title">
        <p className="overline">
          <Link href={`/${lang}/t/${id}`}>{topic.titulo}</Link>
        </p>
        <h1>{t.editar}</h1>
        <p>{t.editarAviso}</p>
      </div>
      {!v.ok ? (
        v.motivo === 'sem-permissao' ? (
          <ErrorState codigo="sem-permissao" d={d} lang={lang} />
        ) : (
          <p className="notice-community" role="alert">
            {v.motivo === 'fora-da-janela' ? t.foraJanela : v.motivo === 'limite-de-estrutura' ? t.limiteEdicoes : t.trancadoTexto}
          </p>
        )
      ) : (
        <section className="card">
          <ProposalForm
            tipo="topico-editar"
            d={d}
            lang={lang}
            canWrite={me !== null}
            roverName={me?.nome}
            destino={{ rotulo: topic.titulo, href: `/${lang}/t/${id}` }}
            hide={['topico']}
            campos={{ topico: id, titulo: topic.titulo, texto: topic.texto, tags: topic.tags }}
          />
        </section>
      )}
    </>
  )
}
