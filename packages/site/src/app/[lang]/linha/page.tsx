import type { Metadata } from 'next'
import { canSeeAdult, gateAdult } from '@/lib/adult'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import RelayAnnouncements from '@/components/RelayAnnouncements'
import EmptyState from '@/components/EmptyState'
import { FELT } from '@/lib/folgali/scenes'
import { PatchQueue } from '@/components/RoverList'
import CommunityCardMini from '@/components/pages/CommunityCardMini'
import PageCard from '@/components/pages/PageCard'
import MixedTimeline from '@/components/pages/MixedTimeline'
import PostCard from '@/components/folgali/PostCard'
import MomentsStrip from '@/components/folgali/MomentsStrip'
import ErrorState from '@/components/social/ErrorState'
import NewPosts from '@/components/life/NewPosts'
import { lifeTexts } from '@/components/life/texts'
import { faceByUid } from '@/lib/domain/expression'
import { moments, timeOffPosts } from '@/lib/folgali/demo'
import { dict, isReady, type Ready } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { isDemo } from '@/lib/site'
import { load } from '@/lib/social/load'
import { routeMeta } from '@/lib/seo/metadata'
import PersonWriter from '@/components/person/PersonWriter'
import { attachTexts } from '@/i18n/attach'
import { videoTexts } from '@/i18n/video'
import { personTexts } from '@/i18n/person'
import { issuersReady } from '@/lib/folgali/issuers'
import { currentPerson } from '@/lib/folgali/session'
import { legalDict } from '@/lib/legal-i18n'
import SortTabs from '@/components/karma/SortTabs'
import Post from '@/components/Post'
import { karmaTexts } from '@/i18n/karma'
import { isPostOrder, isTopWindow, type PostOrder, type TopWindow } from '@/lib/karma/types'

/** The feed in one of the four orders of revision 0.10.0. An empty relay shows the empty state; the demonstration says it is an example. */
async function SortedFeed({ lang, ordem: order, janela: window, antes: before }: { lang: Ready; ordem: PostOrder; janela: TopWindow; antes?: string }) {
  const d = dict(lang)
  const t = karmaTexts(lang)
  const { cliente: client, ponte: bridge } = getNetwork()
  const [page, me] = await Promise.all([
    load(() => client.postagensOrdenadas({ ordem: order, janela: window, cursor: before && /^\d{1,12}$/.test(before) ? before : undefined })),
    bridge.whoAmI().catch(() => null),
  ])
  const [list] = gateAdult([page], await canSeeAdult())
  // the author cards carry their karma: one batch read for the page
  const karma = list.ok ? await client.karmaBatch([...new Set(list.valor.itens.map((p) => p.autor.uid))]).catch(() => ({}) as Record<string, number>) : {}
  const now = new Date().toISOString()
  const base = `/${lang}/linha?ordem=${order}${order === 'top' || order === 'comentadas' ? `&janela=${window}` : ''}`
  return (
    <div className="feed">
      <h1 className="reader-only">{t.orders[order]}</h1>
      <SortTabs base={`/${lang}/linha`} ordem={order} janela={window} t={t} />
      {client.modo === 'falso' && <p className="km-example-note"><span className="km-example">{t.exampleLabel}</span> {t.exampleNote}</p>}
      {!list.ok && <ErrorState codigo={list.codigo} d={d} lang={lang} noBack />}
      {list.ok && list.valor.itens.length === 0 && (
        <EmptyState titulo={t.emptyPostsTitle} texto={t.emptyPostsText} ficha={faceByUid('rvr_linha_vazia_00000000')} felt={FELT.emptyFeed} />
      )}
      {list.ok && list.valor.itens.length > 0 && (
        <div className="lista-postagens">
          {list.valor.itens.map((p, i) => <Post key={p.id} p={p} d={d} lang={lang} agora={now} myUid={me?.uid} i={i} karma={karma[p.autor.uid]} karmaLabel={t.karmaOf} />)}
        </div>
      )}
      {list.ok && list.valor.proximo && (
        <p className="km-pages"><Link href={`${base}&antes=${list.valor.proximo}`} className="btn btn-secondary">{t.next}</Link></p>
      )}
    </div>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'linha')
}

export default async function Timeline({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams?: Promise<{ ordem?: string; janela?: string; antes?: string }> }) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  // 0.10.0: Hot, New, Top and Most commented over the whole network (GET /v1/postagens); no `ordem` keeps the feed as it was
  const sp = (await searchParams) ?? {}
  const order = isPostOrder(sp.ordem) ? sp.ordem : null
  const window = isTopWindow(sp.janela) ? sp.janela : 'semana'
  if (order) return <SortedFeed lang={lang} ordem={order} janela={window} antes={sp.antes} />
  const d = dict(lang)
  const t = d.socLinha
  const { cliente: client, ponte: bridge } = getNetwork()
  const canAdult = await canSeeAdult()
  const [line, desc, me, sugComm, sugPage, announcements] = gateAdult(await Promise.all([
    load(() => client.linhaMista()),
    load(() => client.descobrir()),
    bridge.whoAmI(),
    load(() => client.sugestoes('comunidades')),
    load(() => client.sugestoes('paginas')),
    // 0.3.2: without the feature (relay 0.3 and 0.3.1) the list comes empty and the card does not even appear
    load(() => client.anuncios()),
  ]), canAdult)
  const now = new Date().toISOString()
  const demoMode = isDemo(client.modo)
  // 0.7.0: in the real mode a signed-in person writes here, with the device key (src/components/person/PersonWriter.tsx)
  const writes = !demoMode && issuersReady() !== null && (await currentPerson()) !== null
  // 0.11.0: "attach image" only while the relay takes attachments without approval (`midia-livre`); `RELAY_MEDIA=nao` turns it off here too
  // 0.11.0 part 3: "attach video" only while the relay announces `video` (`RELAY_VIDEO=sim`)
  const [freeMedia, withVideo] = writes ? await Promise.all([client.suporta('midia-livre').catch(() => false), client.suporta('video').catch(() => false)]) : [false, false]
  const today = new Date(now)
  const ofTimeOff = demoMode ? timeOffPosts(today) : []
  const newly = desc.ok ? desc.valor.recemChegados : []
  const using = sugComm.ok ? sugComm.valor.slice(0, 2) : []
  const page = sugPage.ok ? sugPage.valor.slice(0, 2) : []
  const suggestions =
    using.length + page.length > 0 ? (
      <aside className="sug-row" aria-labelledby="sug-linha-t">
        <h2 id="sug-linha-t" className="overline">
          {t.sugestoesTitulo}
        </h2>
        <p className="fine">{t.sugestoesTexto}</p>
        <ul className="sug-row-list">
          {using.map((c) => (
            <li key={c.id}>
              <CommunityCardMini c={c} d={d} lang={lang} agora={now} />
            </li>
          ))}
          {page.map((p) => (
            <li key={p.id}>
              <PageCard p={p} d={d} lang={lang} agora={now} compact />
            </li>
          ))}
        </ul>
        <p className="sug-row-links">
          <Link href={`/${lang}/comunidades`}>{t.verComunidades}</Link>
          <Link href={`/${lang}/paginas`}>{t.verPaginas}</Link>
        </p>
      </aside>
    ) : null

  return (
    <div className="feed">
      <h1 className="reader-only">{d.socFolgali.feed.titulo}</h1>
      <SortTabs base={`/${lang}/linha`} ordem={null} janela="semana" t={karmaTexts(lang)} />
      {line.ok && (
        <NewPosts
          topo={line.valor.itens[0] ? (line.valor.itens[0].tipo === 'postagem' ? line.valor.itens[0].postagem.id : line.valor.itens[0].atualizacao.id) : null}
          rotulo={lifeTexts(lang).novasPostagens}
          anuncio={lifeTexts(lang).chegaramNovas}
        />
      )}
      {demoMode && <MomentsStrip itens={moments(today)} d={d} lang={lang} />}
      {writes && <PersonWriter t={personTexts(lang)} at={attachTexts(lang)} media={freeMedia} video={withVideo} vt={videoTexts(lang)} leak={legalDict(lang).vazamento} lang={lang} consentHref={`/${lang}/entrar`} />}

      {ofTimeOff.map((p, i) => (
        <PostCard key={p.id} p={p} d={d} lang={lang} agora={today} prioridade={i === 0} late={i >= 2} />
      ))}

      {announcements.ok && <RelayAnnouncements itens={announcements.valor.itens.slice(0, 2)} d={d} agora={now} />}

      {newly.length > 0 && (
        <section className="box box-pad" aria-labelledby="chegaram-t">
          <h2 id="chegaram-t" className="lat-title">
            {d.linha.chegaram}
          </h2>
          <PatchQueue rovers={newly} lang={lang} rotulo={d.linha.chegaramNome} />
        </section>
      )}

      {ofTimeOff.length > 0 && <h2 className="feed-sep">{d.socFolgali.feed.maisNaLinha}</h2>}
      {!line.ok && <ErrorState codigo={line.codigo} d={d} lang={lang} noBack />}
      {line.ok &&
        (line.valor.itens.length > 0 ? (
          <MixedTimeline initial={line.valor} d={d} lang={lang} agora={now} myUid={me?.uid} sugestoes={suggestions} />
        ) : (
          <EmptyState
            titulo={d.linha.vazioTitulo}
            texto={d.linha.vazioTexto}
            ficha={faceByUid('rvr_linha_vazia_00000000')}
            felt={FELT.emptyFeed}
            acoes={
              <>
                <Link href={`/${lang}/descobrir`} className="btn btn-primary">
                  {t.irDescobrir}
                </Link>
                <Link href={`/${lang}/paginas`} className="btn btn-secondary">
                  {t.verPaginas}
                </Link>
              </>
            }
          />
        ))}
      <p className="feed-note">{d.socFolgali.feed.sozinhos}</p>
    </div>
  )
}
