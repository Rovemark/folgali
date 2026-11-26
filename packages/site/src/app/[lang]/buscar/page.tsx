import type { Metadata } from 'next'
import { canSeeAdult, gateAdult } from '@/lib/adult'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import { FELT } from '@/lib/folgali/scenes'
import { RoverList } from '@/components/RoverList'
import CommunityCardMini from '@/components/pages/CommunityCardMini'
import PageCard from '@/components/pages/PageCard'
import TopicCardMini from '@/components/pages/TopicCardMini'
import SearchList from '@/components/pages/SearchList'
import RoverResult from '@/components/pages/RoverResult'
import ErrorState from '@/components/social/ErrorState'
import { faceByUid } from '@/lib/domain/expression'
import { orderWindow, searchOrder } from '@/lib/domain/order'
import { dict, isReady, fmt, plural, type Dictionary, type Ready } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { normalizeSearch } from '@/lib/social/term'
import type { SearchType } from '@/lib/social/types'
import { routeMeta } from '@/lib/seo/metadata'
import FolgaResults from '@/components/folgali/FolgaResults'
import { searchFolga } from '@/lib/folgali/demo'
import { isDemo } from '@/lib/site'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ q?: string | string[]; tipo?: string; ordem?: string; janela?: string }> }

const TYPES: readonly SearchType[] = ['rovers', 'comunidades', 'topicos', 'paginas']

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'buscar')
}


export default async function Search({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const sp = await searchParams
  const rawValue = Array.isArray(sp.q) ? sp.q[0] : sp.q
  const d = dict(lang)
  const t = d.socBusca
  const b = normalizeSearch(rawValue)
  const type = (TYPES as readonly string[]).includes(sp.tipo ?? '') ? (sp.tipo as SearchType) : null
  const { cliente: client, ponte: bridge } = getNetwork()
  const now = new Date().toISOString()
  const me = await bridge.whoAmI()
  const has = b.termo !== ''
  const typeHref = (x: SearchType | null) => `/${lang}/buscar?q=${encodeURIComponent(rawValue ?? '')}${x ? `&tipo=${x}` : ''}`
  // 0.3.2: topic search can be sorted by time or by distinct people, if the relay declares the feature
  const byPeople = has && type === 'topicos' ? await client.suporta('ordem-por-pessoas') : false
  const order = searchOrder(sp.ordem, byPeople)
  const window = orderWindow(order, sp.janela)
  const timeOff = has && !type && isDemo(client.modo) ? searchFolga(b.termo, new Date()) : { posts: [], events: [] }
  const orderHref = (o: string, j?: string) => `${typeHref('topicos')}${o === 'relevancia' ? '' : `&ordem=${o}`}${j ? `&janela=${j}` : ''}`

  // what will appear
  const [all, list, help] = gateAdult(await Promise.all([
    has && !type ? load(() => client.buscarTudo(b.termo)) : null,
    has && type ? load(() => (type === 'topicos' ? client.buscarTipo(b.termo, 'topicos', undefined, { ordem: order, janela: window }) : client.buscarTipo(b.termo, type))) : null,
    !has ? Promise.all([load(() => client.tendencias('7d')), load(() => client.descobrir())]) : null,
  ]), await canSeeAdult())

  return (
    <>
      <div className="page-title">
        <h1>{has ? fmt(d.socFolgali.busca.resultados, { termo: rawValue?.trim() ?? b.termo }) : t.titulo}</h1>
        {!has && <p>{t.sub}</p>}
      </div>
      <form className="search" role="search" action={`/${lang}/buscar`} method="get">
        <label className="reader-only" htmlFor="q">
          {t.rotulo}
        </label>
        <input id="q" name="q" type="search" inputMode="search" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={100} placeholder={t.placeholder} defaultValue={rawValue ?? ''} />
        {type && <input type="hidden" name="tipo" value={type} />}
        <button className="btn btn-primary" type="submit">
          {t.botao}
        </button>
      </form>

      {has && (
        <nav className="sub-nav" aria-label={t.abasRotulo}>
          <Link href={typeHref(null)} aria-current={!type ? 'page' : undefined}>
            {t.abas.tudo}
          </Link>
          {TYPES.map((x) => (
            <Link key={x} href={typeHref(x)} aria-current={type === x ? 'page' : undefined}>
              {t.abas[x]}
            </Link>
          ))}
        </nav>
      )}

      {byPeople && (
        <>
          <nav className="sub-nav" aria-label={t.ordem.rotulo}>
            <Link href={orderHref('relevancia')} aria-current={order === 'relevancia' ? 'page' : undefined}>
              {t.ordem.relevancia}
            </Link>
            <Link href={orderHref('recentes')} aria-current={order === 'recentes' ? 'page' : undefined}>
              {t.ordem.recentes}
            </Link>
            <Link href={orderHref('melhores')} aria-current={order === 'melhores' ? 'page' : undefined}>
              {t.ordem.melhores}
            </Link>
            <Link href={orderHref('em-alta')} aria-current={order === 'em-alta' ? 'page' : undefined}>
              {t.ordem.emAlta}
            </Link>
          </nav>
          {(order === 'melhores' || order === 'em-alta') && <p className="fine order-note">{t.ordem.nota}</p>}
          {order === 'em-alta' && (
            <div className="com-filter-group" role="group" aria-label={d.socForum.lista.janelaRotulo}>
              <Link href={orderHref('em-alta')} className="chip-filter" aria-current={!window ? 'true' : undefined}>
                {d.socForum.lista.janelas['24h']}
              </Link>
              <Link href={orderHref('em-alta', '7d')} className="chip-filter" aria-current={window === '7d' ? 'true' : undefined}>
                {d.socForum.lista.janelas['7d']}
              </Link>
            </div>
          )}
        </>
      )}

      {b.tag && has && (
        <p className="search-tag" role="note">
          {fmt(t.tag, { tag: b.tag })}
        </p>
      )}

      {b.curto && (
        <EmptyState titulo={t.curto.titulo} texto={t.curto.texto} ficha={faceByUid('rvr_busca_termo_curto_0000')} estado="pensar" />
      )}

      {!has && !b.curto && help && <Home d={d} lang={lang} ajuda={help} meUid={me?.uid} />}

      {all && !all.ok && <ErrorState codigo={all.codigo} d={d} lang={lang} noBack />}
      {all?.ok && <AllResults r={all.valor} d={d} lang={lang} agora={now} termo={b.termo} tag={!!b.tag} typeHref={typeHref} folga={timeOff} />}

      {list && !list.ok && <ErrorState codigo={list.codigo} d={d} lang={lang} noBack />}
      {list?.ok &&
        type &&
        (list.valor.itens.length > 0 ? (
          <section aria-live="polite" aria-labelledby="res-t">
            <p id="res-t" className="overline" style={{ marginBottom: 12 }}>
              {t.abas[type]}
            </p>
            <SearchList key={`${b.termo}-${type}-${order}-${window ?? ''}`} tipo={type} initial={list.valor as never} termo={b.termo} d={d} lang={lang} agora={now} opcoes={type === 'topicos' && order !== 'relevancia' ? { ordem: order, ...(window ? { janela: window } : {}) } : undefined} />
          </section>
        ) : (
          <NoResult d={d} lang={lang} termo={b.termo} />
        ))}
    </>
  )
}

function NoResult({ d, lang, termo: term }: { d: Dictionary; lang: Ready; termo: string }) {
  const t = d.socBusca
  return (
    <EmptyState
      titulo={t.vazio.titulo}
      texto={fmt(t.vazio.texto, { termo: term })}
      ficha={faceByUid('rvr_busca_sem_resultado_00')}
      felt={FELT.emptySearch}
      estado="pensar"
      acoes={
        <>
          <Link href={`/${lang}/descobrir`} className="btn btn-primary">
            {t.vazio.descobrir}
          </Link>
          <Link href={`/${lang}/comunidades`} className="btn btn-secondary">
            {t.vazio.comunidades}
          </Link>
        </>
      }
    />
  )
}

type All = { rovers: import('@/lib/social/types').SearchedRover[]; comunidades: import('@/lib/social/types').CommunityCardData[]; topicos: import('@/lib/social/types').TopicCardData[]; paginas: import('@/lib/social/types').PageCardData[] }

function AllResults({ r, d, lang, agora: now, termo: term, tag, typeHref, folga: timeOff }: { r: All; d: Dictionary; lang: Ready; agora: string; termo: string; tag: boolean; typeHref: (t: SearchType) => string; folga: ReturnType<typeof searchFolga> }) {
  const t = d.socBusca
  const total = r.rovers.length + r.comunidades.length + r.topicos.length + r.paginas.length + timeOff.posts.length + timeOff.events.length
  if (total === 0) return <NoResult d={d} lang={lang} termo={term} />
  const order: SearchType[] = tag ? ['topicos', 'paginas', 'comunidades', 'rovers'] : ['rovers', 'comunidades', 'topicos', 'paginas']
  return (
    <div className="stack-large" aria-live="polite">
      {order.map((tp) => {
        const items = r[tp]
        if (items.length === 0) return null
        return (
          <section key={tp} aria-labelledby={`sec-${tp}`} className="search-section">
            <div className="section-top">
              <h2 id={`sec-${tp}`}>{plural(t.secao[tp], items.length)}</h2>
              {items.length >= 5 && <Link href={typeHref(tp)}>{t.verTodos}</Link>}
            </div>
            {tp === 'paginas' ? (
              <ul className="label-grid">
                {r.paginas.map((x) => (
                  <li key={x.id}>
                    <PageCard p={x} d={d} lang={lang} agora={now} termo={term} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="results">
                {tp === 'rovers' && r.rovers.map((x) => <li key={x.uid}><RoverResult r={x} lang={lang} termo={term} /></li>)}
                {tp === 'comunidades' && r.comunidades.map((x) => <li key={x.id}><CommunityCardMini c={x} d={d} lang={lang} agora={now} termo={term} /></li>)}
                {tp === 'topicos' && r.topicos.map((x) => <li key={x.id}><TopicCardMini t={x} d={d} lang={lang} agora={now} termo={term} /></li>)}
              </ul>
            )}
          </section>
        )
      }).flatMap((node, i) => (i === 0 ? [node, <FolgaResults key="folga" posts={timeOff.posts} events={timeOff.events} d={d} lang={lang} />] : [node]))}
    </div>
  )
}

function Home({ d, lang, ajuda: help, meUid }: { d: Dictionary; lang: Ready; ajuda: [Awaited<ReturnType<typeof load<import('@/lib/social/types').Trend[]>>>, Awaited<ReturnType<typeof load<import('@/lib/types').Discovery>>>]; meUid?: string | null }) {
  const t = d.socBusca
  const [tend, desc] = help
  return (
    <div className="stack-large">
      {tend.ok && tend.valor.length > 0 && (
        <section aria-labelledby="inicio-tags">
          <h2 id="inicio-tags" className="overline" style={{ marginBottom: 10 }}>
            {t.inicio.tags}
          </h2>
          <ul className="tag-cloud">
            {tend.valor.slice(0, 10).map((x) => (
              <li key={x.tag}>
                <Link href={`/${lang}/buscar?q=${encodeURIComponent('#' + x.tag)}`} className="tag-chip">
                  #{x.tag}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="block">
        <h2>{t.inicio.dicas}</h2>
        <ul className="search-tips">
          {t.inicio.lista.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
      {desc.ok && desc.valor.emAlta.length > 0 && (
        <section className="block">
          <h2>{t.inicio.rovers}</h2>
          <RoverList rovers={desc.valor.emAlta.slice(0, 4)} lang={lang} d={d} myUid={meUid} />
        </section>
      )}
    </div>
  )
}
