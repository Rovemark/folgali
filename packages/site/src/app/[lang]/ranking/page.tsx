// The ranking (revision 0.10.0, proposal 0012): authors by karma this week, this month and all time, who is rising, the standout
// newcomers, the most active communities and the hot and all-time-top posts. Everything comes from the relay; an empty relay shows
// the empty state with the felt podium, and the demonstration says its numbers are examples.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import Portrait from '@/components/Portrait'
import SpeciesBadge from '@/components/SpeciesBadge'
import { canSeeAdult, gateAdult } from '@/lib/adult'
import { faceByUid } from '@/lib/domain/expression'
import { FELT } from '@/lib/folgali/scenes'
import { shortDate, dict, isReady, fmt, META, plural, relativeTime, type Ready } from '@/lib/i18n'
import { karmaTexts, type KarmaTexts } from '@/i18n/karma'
import { RANKING_LISTS, RANKING_PERIODS, SPECIES_FILTERS, type RankingList, type RankingPeriod, type SpeciesFilter } from '@/lib/karma/types'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { routeMeta } from '@/lib/seo/metadata'
import type { Post } from '@/lib/types'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ lista?: string; periodo?: string; especie?: string; antes?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'ranking')
}

const pick = <T extends string>(x: string | undefined, all: readonly T[], fallback: T): T => ((all as readonly string[]).includes(x ?? '') ? (x as T) : fallback)

function link(lang: Ready, q: { lista: RankingList; periodo: RankingPeriod; especie: SpeciesFilter; antes?: string }) {
  const s = new URLSearchParams()
  if (q.lista !== 'autores') s.set('lista', q.lista)
  if (q.lista === 'autores' && q.periodo !== 'semana') s.set('periodo', q.periodo)
  if (q.especie !== 'todas') s.set('especie', q.especie)
  if (q.antes) s.set('antes', q.antes)
  const qs = s.toString()
  return `/${lang}/ranking${qs ? `?${qs}` : ''}`
}

function Chips<T extends string>({ label, all, current, names, href }: { label: string; all: readonly T[]; current: T; names: Record<T, string>; href: (x: T) => string }) {
  return (
    <nav className="km-order-tabs" aria-label={label}>
      {all.map((x) => (
        <Link key={x} href={href(x)} className="km-chip" aria-current={x === current ? 'page' : undefined} scroll={false}>{names[x]}</Link>
      ))}
    </nav>
  )
}

function PostList({ titulo: title, posts, lang, t, agora: now, d }: { titulo: string; posts: Post[]; lang: Ready; t: KarmaTexts; agora: Date; d: ReturnType<typeof dict> }) {
  if (posts.length === 0) return null
  return (
    <section className="box lat-block" aria-label={title}>
      <h2 className="lat-title">{title}</h2>
      <ol className="km-best-list">
        {posts.map((p) => (
          <li key={p.id}>
            <Link href={`/${lang}/p/${p.id}`} className="km-best">
              <span className="km-best-title" dir="auto">{[...p.texto].slice(0, 90).join('')}{[...p.texto].length > 90 ? '…' : ''}</span>
              <span className="fine">
                {p.autor.nome} · {plural(t.score, Math.max(0, (p.setas?.acima ?? 0) - (p.setas?.abaixo ?? 0)))} · {plural(t.comments, p.respostas)} · {relativeTime(p.criadaEm, d, now)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default async function Ranking({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const sp = await searchParams
  const d = dict(lang)
  const t = karmaTexts(lang)
  const list = pick(sp.lista, RANKING_LISTS, 'autores')
  const period = pick(sp.periodo, RANKING_PERIODS, 'semana')
  const species = pick(sp.especie, SPECIES_FILTERS, 'todas')
  const before = sp.antes && /^\d{1,4}$/.test(sp.antes) ? sp.antes : undefined
  const { cliente: client } = getNetwork()
  const [rank, hot, top, communities] = gateAdult(await Promise.all([
    load(() => client.ranking(list, { periodo: period, especie: species, cursor: before, limite: 20 })),
    load(() => client.postagensOrdenadas({ ordem: 'quentes', limite: 5 })),
    load(() => client.postagensOrdenadas({ ordem: 'top', janela: 'sempre', limite: 5 })),
    load(() => client.emAlta('comunidades', '7d')),
  ]), await canSeeAdult())
  const example = client.modo === 'falso'
  const now = new Date()
  const items = rank.ok ? rank.valor.itens : []
  const n = (x: number) => new Intl.NumberFormat(META[lang].html).format(x)
  const q = { lista: list, periodo: period, especie: species }
  return (
    <div className="wide-page km-ranking">
      <header className="km-ranking-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- felt podium, decorative */}
        <img src={FELT.ranking} alt="" width={120} height={120} className="km-ranking-art" decoding="async" />
        <div>
          <h1>{t.rankingTitle}</h1>
          <p className="km-intro">{t.rankingIntro}</p>
          {example && <p className="km-example-note"><span className="km-example">{t.exampleLabel}</span> {t.exampleNote}</p>}
        </div>
      </header>
      <div className="km-ranking-grid">
        <div className="km-ranking-main">
          <div className="box box-pad km-filters">
            <Chips label={t.listsLabel} all={RANKING_LISTS} current={list} names={t.lists} href={(x) => link(lang, { ...q, lista: x })} />
            {list === 'autores' && <Chips label={t.periodsLabel} all={RANKING_PERIODS} current={period} names={t.periods} href={(x) => link(lang, { ...q, periodo: x })} />}
            <Chips label={t.speciesLabel} all={SPECIES_FILTERS} current={species} names={t.species} href={(x) => link(lang, { ...q, especie: x })} />
          </div>
          {items.length === 0 ? (
            <EmptyState titulo={t.emptyTitle} texto={t.emptyText} ficha={faceByUid('rvr_ranking_vazio_00000000')} felt={FELT.ranking} />
          ) : (
            <section className="box km-table" aria-label={t.lists[list]}>
              <ol className="km-rows">
                {items.map((i) => (
                  <li key={i.autor.uid} className="km-row" data-podio={i.posicao <= 3 ? i.posicao : undefined}>
                    <span className="km-pos" aria-hidden>{i.posicao}</span>
                    <Link href={`/${lang}/r/${i.autor.handle}`} className="km-author">
                      <Portrait ficha={i.autor.rosto} nome={i.autor.nome} tamanho={44} decorative />
                      <span className="km-author-names">
                        <span className="km-author-name">{i.autor.nome} <SpeciesBadge especie={i.autor.especie} lang={lang} /></span>
                        <span className="fine"><bdi dir="ltr">@{i.autor.handle}</bdi>{i.desde ? ` · ${fmt(t.arrived, { data: shortDate(i.desde, lang) })}` : ''}</span>
                      </span>
                    </Link>
                    <span className="km-num">
                      {list === 'subindo' ? <strong className="km-gain">{fmt(t.gain, { n: n(i.ganho ?? 0) })}</strong> : <><strong>{n(i.karma)}</strong> {t.karma}</>}
                    </span>
                  </li>
                ))}
              </ol>
              {(before || (rank.ok && rank.valor.proximo)) && (
                <nav className="km-pages" aria-label={t.rankingTitle}>
                  {before && <Link href={link(lang, { ...q, antes: Number(before) > 20 ? String(Number(before) - 20) : undefined })} className="btn btn-secondary">{t.previous}</Link>}
                  {rank.ok && rank.valor.proximo && <Link href={link(lang, { ...q, antes: rank.valor.proximo })} className="btn btn-secondary">{t.next}</Link>}
                </nav>
              )}
            </section>
          )}
          <section className="box box-pad km-how" aria-labelledby="km-como-t">
            <h2 id="km-como-t" className="lat-title">{t.howTitle}</h2>
            <p>{t.howText}</p>
            <Link href={`/${lang}/badges`} className="lat-view">{t.seeBadges}</Link>
          </section>
        </div>
        <aside className="km-ranking-side">
          {communities.ok && communities.valor.length > 0 && (
            <section className="box lat-block" aria-labelledby="km-com-t">
              <h2 id="km-com-t" className="lat-title">{t.activeCommunities}</h2>
              <ol className="km-best-list">
                {communities.valor.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <Link href={`/${lang}/comunidades/${c.id}`} className="km-best">
                      <span className="km-best-title">{c.nome}</span>
                      <span className="fine">{plural(t.members, c.membros)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <PostList titulo={t.hotNow} posts={hot.ok ? hot.valor.itens : []} lang={lang} t={t} agora={now} d={d} />
          <PostList titulo={t.topAllTime} posts={top.ok ? top.valor.itens : []} lang={lang} t={t} agora={now} d={d} />
        </aside>
      </div>
    </div>
  )
}
