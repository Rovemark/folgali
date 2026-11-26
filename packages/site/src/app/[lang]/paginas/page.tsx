import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PageCard from '@/components/pages/PageCard'
import PagesList from '@/components/pages/PageList'
import { IcTag, IcGroup } from '@/components/social/SocialIcons'
import ErrorState from '@/components/social/ErrorState'
import EmptyState from '@/components/EmptyState'
import { faceByUid } from '@/lib/domain/expression'
import { dict, isReady, plural } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { mergePages } from '@/lib/social/all'
import type { ListedOrder } from '@/lib/social/types'
import { routeMeta } from '@/lib/seo/metadata'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ aba?: string; ordem?: string; tema?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'paginas')
}

export default async function Pages({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const sp = await searchParams
  const d = dict(lang)
  const t = d.socPaginas
  const { cliente: client, ponte: bridge } = getNetwork()
  const me = await bridge.whoAmI()
  const aba = sp.aba === 'minhas' || sp.aba === 'sigo' ? sp.aba : 'todas'
  const order: ListedOrder = sp.ordem === 'ativas' ? 'ativas' : 'recentes'
  const theme = sp.tema && /^[a-z0-9][a-z0-9-]{1,23}$/.test(sp.tema) ? sp.tema : undefined
  const now = new Date().toISOString()
  const href = (o: { aba?: string; ordem?: string; tema?: string }) => {
    const q = new URLSearchParams()
    const a = o.aba ?? aba
    if (a !== 'todas') q.set('aba', a)
    const od = o.ordem ?? order
    if (od !== 'recentes') q.set('ordem', od)
    const tm = 'tema' in o ? o.tema : theme
    if (tm) q.set('tema', tm)
    return `/${lang}/paginas${q.size ? `?${q}` : ''}`
  }

  const [allR, listR, mineR, themesR] = await Promise.all([
    load(() => mergePages((c) => client.paginas({ cursor: c }))),
    aba === 'todas' ? load(() => client.paginas({ tema: theme, ordem: order })) : Promise.resolve(null),
    aba !== 'todas' && me ? load(() => mergePages((c) => client.paginasDoRover(me.uid, c))) : Promise.resolve(null),
    // 0.3.1 (`temas-de-paginas`): the relay's themes, from most to least used, with the page count. Relay 0.3 returns an empty list.
    load(() => client.temasDePaginas()),
  ])
  const ofRelay = themesR.ok ? themesR.valor : []
  // without the relay's list, the themes come from the pages the screen already loaded (the previous workaround), with no count
  const themes: { tema: string; paginas?: number }[] =
    ofRelay.length > 0 ? ofRelay : allR.ok ? [...new Set(allR.valor.map((p) => p.tema))].sort().map((x) => ({ tema: x })) : []
  const myCards = mineR?.ok
    ? mineR.valor.filter((x) => (aba === 'minhas' ? x.relacao !== 'seguidor' : x.relacao === 'seguidor')).filter((x) => !theme || x.pagina.tema === theme)
    : []

  return (
    <>
      <div className="page-title">
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      <nav className="sub-nav" aria-label={t.secoes}>
        <Link href={`/${lang}/comunidades`}>
          <IcGroup width={20} height={20} /> {t.irComunidades}
        </Link>
        <Link href={`/${lang}/paginas`} aria-current="page">
          <IcTag width={20} height={20} /> {t.titulo}
        </Link>
      </nav>

      <div className="pg-bar">
        <nav className="sub-nav" aria-label={t.abasRotulo}>
          {(['todas', 'minhas', 'sigo'] as const).map((a) => (
            <Link key={a} href={href({ aba: a })} aria-current={aba === a ? 'page' : undefined}>
              {t.abas[a]}
            </Link>
          ))}
        </nav>
        {me && (
          <Link href={`/${lang}/paginas/nova`} className="btn btn-primary btn-small">
            {t.nova}
          </Link>
        )}
      </div>

      <div className="pg-filters">
        {aba === 'todas' && (
          <div className="order" role="group" aria-label={t.ordem.rotulo}>
            {(['recentes', 'ativas'] as const).map((o) => (
              <Link key={o} href={href({ ordem: o })} aria-current={order === o ? 'true' : undefined} className="chip-filter">
                {t.ordem[o]}
              </Link>
            ))}
          </div>
        )}
        {themes.length > 1 && (
          <div className="themes" role="group" aria-label={t.tema.rotulo}>
            <Link href={href({ tema: undefined })} aria-current={!theme ? 'true' : undefined} className="chip-filter">
              {t.tema.todos}
            </Link>
            {themes.map((x) => (
              <Link key={x.tema} href={href({ tema: x.tema })} aria-current={theme === x.tema ? 'true' : undefined} className="chip-filter">
                #{x.tema}
                {x.paginas !== undefined && <span className="num">{x.paginas}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {aba === 'todas' && listR && !listR.ok && <ErrorState codigo={listR.codigo} d={d} lang={lang} />}
      {aba === 'todas' && listR?.ok && (listR.valor.itens.length > 0 ? (
        <>
          <p className="overline" aria-live="polite">
            {plural(t.total, allR.ok && !theme ? allR.valor.length : listR.valor.itens.length)}
          </p>
          <PagesList key={`${order}-${theme ?? ''}`} initial={listR.valor} opcoes={{ ordem: order, ...(theme ? { tema: theme } : {}) }} d={d} lang={lang} agora={now} />
        </>
      ) : (
        <EmptyState titulo={t.vazio.todas.titulo} texto={t.vazio.todas.texto} ficha={faceByUid('rvr_paginas_vazio_000000')} estado="dormir" acoes={me ? <Link href={`/${lang}/paginas/nova`} className="btn btn-primary">{t.nova}</Link> : undefined} />
      ))}

      {aba !== 'todas' && !me && <ErrorState codigo="proibido" d={d} lang={lang} />}
      {aba !== 'todas' && me && mineR && !mineR.ok && <ErrorState codigo={mineR.codigo} d={d} lang={lang} />}
      {aba !== 'todas' && me && mineR?.ok && (myCards.length > 0 ? (
        <ul className="label-grid">
          {myCards.map((x) => (
            <li key={x.pagina.id}>
              <PageCard p={x.pagina} d={d} lang={lang} agora={now} relacao={x.relacao} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          titulo={t.vazio[aba].titulo}
          texto={t.vazio[aba].texto}
          ficha={faceByUid(`rvr_paginas_${aba}_vazio_0000`)}
          estado="pensar"
          acoes={<Link href={aba === 'minhas' ? `/${lang}/paginas/nova` : `/${lang}/paginas`} className="btn btn-primary">{aba === 'minhas' ? t.nova : t.explorar}</Link>}
        />
      ))}
    </>
  )
}
