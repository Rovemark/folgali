import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IcLock } from '@/components/Icons'
import CommunityHeader from '@/components/communities/CommunityHeader'
import ErrorState from '@/components/social/ErrorState'
import ProposalForm from '@/components/social/ProposalForm'
import { isComplete, ID_OK, readCommunity, whoOf, whoAmI } from '@/lib/communities/data'
import { canInCommunity } from '@/lib/domain/permissions'
import { missingGracePeriod, minutesToShow } from '@/lib/domain/deadlines'
import { dict, isReady, fmt, plural } from '@/lib/i18n'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ categoria?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/comunidades/${id}/novo`, dict(isReady(lang) ? lang : 'pt').socForum.lista.novo)
}

export default async function NewTopic({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const { categoria: category } = await searchParams
  const d = dict(lang)
  const t = d.socComunidades.novoTopico
  const c = ID_OK.test(id) ? await readCommunity(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <ErrorState codigo={c.codigo} d={d} lang={lang} />
  const using = c.valor
  if (!isComplete(using)) return <CommunityHeader c={using} d={d} lang={lang} />
  const me = await whoAmI()
  const now = new Date()
  const can = canInCommunity('postar-topico', whoOf(using.voce, now), using.acesso)
  // member waiting period (relay 0.3.1 sends `membroDesde`): instead of letting the relay refuse later, the screen says how many minutes are left
  const remaining = !can.ok && can.motivo === 'conta-nova' ? missingGracePeriod(using.voce?.membroDesde, 'topico', now) : 0
  return (
    <>
      <CommunityHeader c={using} d={d} lang={lang} aba="conversas" />
      <div className="page-title">
        <p className="overline">
          <Link href={`/${lang}/comunidades/${id}`}>{t.voltar}</Link>
        </p>
        <h2 style={{ fontSize: 28 }}>{fmt(t.titulo, { nome: using.nome })}</h2>
      </div>
      {!can.ok && can.motivo !== 'conta-nova' ? (
        <ErrorState codigo={can.motivo === 'banido' ? 'banido' : can.motivo === 'nao-e-membro' ? 'nao-e-membro' : 'sem-permissao'} d={d} lang={lang} noBack />
      ) : (
        <section className="card">
          {remaining > 0 && (
            <p className="notice-community" role="note">
              <IcLock />
              <span>{plural(t.carenciaFalta, minutesToShow(remaining))}</span>
            </p>
          )}
          <ProposalForm
            tipo="topico"
            d={d}
            lang={lang}
            canWrite={me !== null}
            roverName={me?.nome}
            destino={{ rotulo: using.nome, href: `/${lang}/comunidades/${id}` }}
            hide={['comunidade']}
            choices={using.categorias.length > 0 ? { categoria: using.categorias } : undefined}
            emptyChoice={t.semCategoria}
            campos={{ comunidade: id, categoria: category && using.categorias.includes(category) ? category : null, titulo: '', texto: '', tags: [], enquete: [], enqueteDias: '3' }}
          />
        </section>
      )}
    </>
  )
}
