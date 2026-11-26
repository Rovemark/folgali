import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import CommunityHeader from '@/components/communities/CommunityHeader'
import { LogMore } from '@/components/communities/MoreLists'
import ErrorState from '@/components/social/ErrorState'
import { isComplete, ID_OK, readCommunity } from '@/lib/communities/data'
import { faceByUid } from '@/lib/domain/expression'
import { dict, isReady } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/comunidades/${id}/registro`, dict(isReady(lang) ? lang : 'pt').socModeracao.registro.titulo)
}

export default async function Log({ params }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socModeracao.registro
  const c = ID_OK.test(id) ? await readCommunity(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <ErrorState codigo={c.codigo} d={d} lang={lang} />
  const using = c.valor
  if (!isComplete(using)) return <CommunityHeader c={using} d={d} lang={lang} />
  const list = await load(() => getNetwork().cliente.registroDaComunidade(id))
  return (
    <>
      <CommunityHeader c={using} d={d} lang={lang} aba="registro" />
      <section className="stack" aria-labelledby="reg-t">
        <div>
          <h2 id="reg-t">{t.titulo}</h2>
          <p className="soft">{t.sub}</p>
          {using.acesso === 'fechada' && <p className="fine">{t.fechadaNota}</p>}
        </div>
        {!list.ok ? (
          <ErrorState codigo={list.codigo} d={d} lang={lang} />
        ) : list.valor.itens.length === 0 ? (
          <EmptyState titulo={t.vazio.titulo} texto={t.vazio.texto} ficha={faceByUid('rvr_registro_vazio_00000')} estado="feliz" />
        ) : (
          <LogMore initial={list.valor} comunidade={id} d={d} lang={lang} agora={new Date().toISOString()} />
        )}
      </section>
    </>
  )
}
