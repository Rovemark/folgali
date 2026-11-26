import type { Metadata } from 'next'
import { canSeeAdult, gateAdult } from '@/lib/adult'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RoverList } from '@/components/RoverList'
import CommunityCardMini from '@/components/pages/CommunityCardMini'
import PageCard from '@/components/pages/PageCard'
import TopicCardMini from '@/components/pages/TopicCardMini'
import Portrait from '@/components/Portrait'
import { IcStar, IcMod, IcTrend } from '@/components/social/SocialIcons'
import { dict, isReady, fmt, plural, relativeTime, type Dictionary, type Ready } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import type { Window, Trend } from '@/lib/social/types'
import { routeMeta } from '@/lib/seo/metadata'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ janela?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'descobrir')
}

/** One type size per band of authors: the cloud shows what more people used, with no loose numbers. */
const band = (t: Trend, max: number) => (t.autores >= max ? 3 : t.autores * 2 >= max ? 2 : 1)

export default async function Discover({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const sp = await searchParams
  const window: Window = sp.janela === '7d' ? '7d' : '24h'
  const d = dict(lang)
  const t = d.socDescobrir
  const { cliente: client, ponte: bridge } = getNetwork()
  const now = new Date().toISOString()
  const me = await bridge.whoAmI()
  const profile = me ? await load(() => client.paginaDoRover(me.handle)) : null
  const interests = profile?.ok ? profile.valor.rover.interesses : []
  const [tend, topics, communities, pages, newly, sugComm, sugPage, sugRover, rovers] = gateAdult(await Promise.all([
    load(() => client.tendencias(window)),
    load(() => client.emAlta('topicos', window)),
    load(() => client.emAlta('comunidades', window)),
    load(() => client.emAlta('paginas', window)),
    load(() => client.recemChegadosSociais(10)),
    load(() => client.sugestoes('comunidades', interests)),
    load(() => client.sugestoes('paginas', interests)),
    load(() => client.sugestoes('rovers', interests)),
    load(() => client.descobrir()),
  ]), await canSeeAdult())
  const allOutside = [tend, topics, communities, pages, newly].every((x) => !x.ok)
  const tendOk = tend.ok ? tend.valor : []
  const maxAuthors = Math.max(1, ...tendOk.map((x) => x.autores))
  const base = `/${lang}/descobrir`

  return (
    <>
      <div className="page-title">
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>

      <div className="window" role="group" aria-label={t.janela.rotulo}>
        {(['24h', '7d'] as const).map((j) => (
          <Link key={j} href={j === '24h' ? base : `${base}?janela=7d`} className="chip-filter" aria-current={window === j ? 'true' : undefined}>
            {t.janela[j]}
          </Link>
        ))}
      </div>

      {allOutside && (
        <p className="error-field" role="alert">
          {d.socComum.erros['fora-do-ar'].texto}
        </p>
      )}

      <div className="showcase">
        {/* 1. trends: the tag cloud */}
        <section className="showcase-tags" aria-labelledby="v-tend">
          <h2 id="v-tend">
            <IcTrend width={22} height={22} /> {t.tendencias.titulo}
          </h2>
          <p className="soft">{t.tendencias.sub}</p>
          {tendOk.length > 0 ? (
            <ul className="tag-cloud">
              {tendOk.map((x) => (
                <li key={x.tag}>
                  <Link href={`/${lang}/buscar?q=${encodeURIComponent('#' + x.tag)}`} className={`tag-chip f${band(x, maxAuthors)}`} title={plural(t.tendencias.autores, x.autores)}>
                    #{x.tag}
                    <span className="tag-chip-n">{x.autores}</span>
                    <span className="reader-only"> {plural(t.tendencias.autores, x.autores)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">{t.tendencias.vazio}</p>
          )}
        </section>

        {/* 2. trending topics: a numbered list, no card per item */}
        <section className="vit-topicos" aria-labelledby="v-top">
          <h2 id="v-top">{t.topicos.titulo}</h2>
          <p className="soft">{t.topicos.sub}</p>
          {topics.ok && topics.valor.length > 0 ? (
            <ol className="topic-roll">
              {topics.valor.slice(0, 6).map((x, i) => (
                <li key={x.id}>
                  <TopicCardMini t={x} d={d} lang={lang} agora={now} posicao={i + 1} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="fine">{t.topicos.vazio}</p>
          )}
        </section>

        {/* 3. communities: a shelf that scrolls sideways */}
        <section className="showcase-shelf" aria-labelledby="v-com">
          <div className="section-top">
            <h2 id="v-com">{t.comunidades.titulo}</h2>
            <Link href={`/${lang}/comunidades`}>{t.comunidades.todas}</Link>
          </div>
          {communities.ok && communities.valor.length > 0 ? (
            <ul className="shelf" aria-label={t.comunidades.titulo}>
              {communities.valor.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <CommunityCardMini c={c} d={d} lang={lang} agora={now} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">{t.comunidades.vazio}</p>
          )}
        </section>

        {/* 4. trending pages: compact labels side by side */}
        <section aria-labelledby="v-pag">
          <div className="section-top">
            <h2 id="v-pag">{t.paginas.titulo}</h2>
            <Link href={`/${lang}/paginas`}>{t.paginas.todas}</Link>
          </div>
          {pages.ok && pages.valor.length > 0 ? (
            <ul className="label-grid">
              {pages.valor.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <PageCard p={p} d={d} lang={lang} agora={now} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">{t.paginas.vazio}</p>
          )}
        </section>

        {/* 5. newcomers */}
        {newly.ok && newly.valor.length > 0 && (
          <section aria-labelledby="v-rec">
            <h2 id="v-rec">{t.recem.titulo}</h2>
            <p className="soft">{t.recem.sub}</p>
            <ul className="queue-patches recent" aria-label={t.recem.titulo}>
              {newly.valor.map((r) => (
                <li key={r.uid}>
                  <Link href={`/${lang}/r/${r.handle}`} className="patch-item">
                    <Portrait ficha={r.rosto} nome={r.nome} tamanho={60} decorative />
                    <span>{r.nome}</span>
                    <small>{relativeTime(r.desde, d, new Date(now))}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 6. suggestions, only from what the person declared */}
        <Suggestions d={d} lang={lang} agora={now} interesses={interests} com={sugComm} page={sugPage} rover={sugRover} meUid={me?.uid} />

        {rovers.ok && rovers.valor.emAlta.length > 0 && (
          <section className="block" aria-labelledby="v-rov">
            <div>
              <h2 id="v-rov">{d.descobrir.emAlta}</h2>
              <p className="fine">{d.descobrir.pontos}</p>
            </div>
            <RoverList rovers={rovers.valor.emAlta} lang={lang} d={d} myUid={me?.uid} />
          </section>
        )}

        <p className="footer-discover">
          <IcMod width={18} height={18} />{' '}
          <Link href={`/${lang}/moderacao`}>{t.registro}</Link>
        </p>
      </div>
    </>
  )
}

type Carg<T> = Awaited<ReturnType<typeof load<T>>>

function Suggestions({ d, lang, agora: now, interesses: interests, com: using, page, rover, meUid }: { d: Dictionary; lang: Ready; agora: string; interesses: string[]; com: Carg<import('@/lib/social/types').CommunityCardData[]>; page: Carg<import('@/lib/social/types').PageCardData[]>; rover: Carg<import('@/lib/social/types').SearchedRover[]>; meUid?: string | null }) {
  const t = d.socDescobrir.sugestoes
  const hasSomething = (using.ok && using.valor.length > 0) || (page.ok && page.valor.length > 0) || (rover.ok && rover.valor.length > 0)
  if (!hasSomething) return null
  return (
    <section className="showcase-suggestions" aria-labelledby="v-sug">
      <div className="showcase-sug-head">
        <h2 id="v-sug">
          <IcStar width={22} height={22} /> {t.titulo}
        </h2>
        <p className="soft">{interests.length > 0 ? fmt(t.declarados, { n: interests.length }) : t.semInteresses}</p>
        {interests.length > 0 && (
          <ul className="labels" aria-label={t.titulo}>
            {interests.map((i) => (
              <li key={i} className="label-tag">
                {i}
              </li>
            ))}
          </ul>
        )}
        <p className="proposal-note">{t.nota}</p>
      </div>
      <div className="showcase-sug-columns">
        {using.ok && using.valor.length > 0 && (
          <div>
            <h3>{t.comunidades}</h3>
            <ul className="stack">
              {using.valor.slice(0, 3).map((c) => (
                <li key={c.id}>
                  <CommunityCardMini c={c} d={d} lang={lang} agora={now} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {page.ok && page.valor.length > 0 && (
          <div>
            <h3>{t.paginas}</h3>
            <ul className="stack">
              {page.valor.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <PageCard p={p} d={d} lang={lang} agora={now} compact />
                </li>
              ))}
            </ul>
          </div>
        )}
        {rover.ok && rover.valor.length > 0 && (
          <div>
            <h3>{t.rovers}</h3>
            <ul className="rover-list">
              {rover.valor.slice(0, 4).map((r) => (
                <li key={r.uid} style={{ gridTemplateColumns: 'auto 1fr' }}>
                  <Link href={`/${lang}/r/${r.handle}`} aria-label={d.perfil.ir.replace('{nome}', r.nome)}>
                    <Portrait ficha={r.rosto} nome={r.nome} tamanho={44} decorative />
                  </Link>
                  <Link href={`/${lang}/r/${r.handle}`} className="who">
                    <strong>{r.nome}</strong>
                    <span><bdi dir="ltr">@{r.handle}</bdi></span>
                  </Link>
                </li>
              ))}
            </ul>
            {meUid && null}
          </div>
        )}
      </div>
    </section>
  )
}
