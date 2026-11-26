import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import CommunityHeader from '@/components/communities/CommunityHeader'
import InviteRover from '@/components/communities/InviteRover'
import { MembersMore } from '@/components/communities/MoreLists'
import ErrorState from '@/components/social/ErrorState'
import { isComplete, ID_OK, readCommunity, whoOf } from '@/lib/communities/data'
import { faceByUid } from '@/lib/domain/expression'
import { canInCommunity } from '@/lib/domain/permissions'
import { dict, isReady } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/comunidades/${id}/membros`, dict(isReady(lang) ? lang : 'pt').socComunidades.pagina.abas.membros)
}

export default async function Members({ params }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socComunidades
  const c = ID_OK.test(id) ? await readCommunity(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <ErrorState codigo={c.codigo} d={d} lang={lang} />
  const using = c.valor
  if (!isComplete(using)) return <CommunityHeader c={using} d={d} lang={lang} />
  const list = await load(() => getNetwork().cliente.membros(id))
  const canInvite = canInCommunity('convidar', whoOf(using.voce), using.acesso).ok
  return (
    <>
      <CommunityHeader c={using} d={d} lang={lang} aba="membros" />
      <div className="stack-large">
        {canInvite && (
          <section className="card" aria-labelledby="conv-t">
            <h2 id="conv-t">{t.convidar.titulo}</h2>
            <p className="soft">{t.convidar.texto}</p>
            <InviteRover comunidade={id} d={d} />
          </section>
        )}
        <section className="stack" aria-labelledby="mem-t">
          <div>
            <h2 id="mem-t">{t.pagina.membrosTitulo}</h2>
            <p className="fine">{t.pagina.membrosNota}</p>
          </div>
          {!list.ok ? (
            <ErrorState codigo={list.codigo} d={d} lang={lang} />
          ) : list.valor.itens.length === 0 ? (
            <EmptyState titulo={t.pagina.membrosVazio.titulo} texto={t.pagina.membrosVazio.texto} ficha={faceByUid('rvr_membros_vazio_000000')} />
          ) : (
            <MembersMore initial={list.valor} comunidade={id} d={d} lang={lang} agora={new Date().toISOString()} />
          )}
        </section>
      </div>
    </>
  )
}
