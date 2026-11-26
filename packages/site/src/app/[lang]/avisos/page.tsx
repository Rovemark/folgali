import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import { FELT } from '@/lib/folgali/scenes'
import NoticeList from '@/components/profile/NoticeList'
import RemovedList from '@/components/profile/RemovedList'
import ErrorState from '@/components/social/ErrorState'
import { faceByUid } from '@/lib/domain/expression'
import { dict, isReady } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string }>; searchParams?: Promise<{ filtro?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/avisos', dict(isReady(lang) ? lang : 'pt').socAvisos.titulo)
}

export default async function Notices({ params, searchParams }: P) {
  const { lang } = await params
  const onlyUnread = (await searchParams)?.filtro === 'nao-lidos'
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socAvisos
  const { cliente: client, ponte: bridge } = getNetwork()
  const me = await bridge.whoAmI()
  const header = (
    <div className="page-title">
      <h1>{t.titulo}</h1>
      <p>{t.sub}</p>
    </div>
  )
  if (!me) {
    return (
      <>
        {header}
        <EmptyState titulo={t.titulo} texto={t.semApp} ficha={faceByUid('rvr_avisos_sem_app_000000')} felt={FELT.emptyNotices} estado="parado" />
      </>
    )
  }
  const [list, seen, removed] = await Promise.all([
    load(() => client.notificacoes(me.uid)),
    bridge.seenNotices().catch(() => 0),
    // 0.3.1 (`removidos`): relay 0.3 returns an empty list without calling the route, and the section does not even appear
    client.suporta('removidos').then((ok) => (ok ? load(() => client.removidos(me.uid)) : null)).catch(() => null),
  ])
  if (!list.ok) return <>{header}<ErrorState codigo={list.codigo} d={d} lang={lang} /></>
  return (
    <>
      {header}
      {list.valor.itens.length > 0 ? (
        <>
          <nav className="av-filter" aria-label={t.filtroRotulo}>
            <Link href={`/${lang}/avisos`} className="chip-filter" aria-current={!onlyUnread ? 'page' : undefined}>
              {t.todos}
            </Link>
            <Link href={`/${lang}/avisos?filtro=nao-lidos`} className="chip-filter" aria-current={onlyUnread ? 'page' : undefined}>
              {t.naoLidos}
            </Link>
          </nav>
          <NoticeList initial={list.valor} myUid={me.uid} myHandle={me.handle} visto={seen} d={d} lang={lang} agora={new Date().toISOString()} onlyUnread={onlyUnread} />
        </>
      ) : (
        <EmptyState titulo={t.vazioTitulo} texto={t.vazioTexto} ficha={me.rosto} estado="dormir" felt={FELT.emptyNotices} />
      )}
      {removed?.ok && <RemovedList itens={removed.valor.itens} d={d} lang={lang} agora={new Date().toISOString()} />}
    </>
  )
}
