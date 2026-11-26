import type { Metadata } from 'next'
import { canSeeAdult, gateAdult } from '@/lib/adult'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import { FELT } from '@/lib/folgali/scenes'
import ActionButton from '@/components/social/ActButton'
import ErrorState from '@/components/social/ErrorState'
import RoverCard from '@/components/social/RoverCard'
import Emblem from '@/components/social/Emblem'
import CommunityCard from '@/components/communities/CommunityCard'
import Photo from '@/components/folgali/Photo'
import { themeCover } from '@/lib/folgali/demo'
import NetworkSubNav from '@/components/communities/NetworkSubNav'
import { whoAmI } from '@/lib/communities/data'
import { faceByUid } from '@/lib/domain/expression'
import { dict, isReady, fmt, plural } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import type { CommunityCardData } from '@/lib/social/types'
import { routeMeta } from '@/lib/seo/metadata'
import { CATEGORIES } from '@/lib/folgali/categories'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ aba?: string; tema?: string; acesso?: string; ordem?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'comunidades')
}

const THEME_RE = /^[a-z0-9][a-z0-9-]{1,23}$/

export default async function Communities({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const q = await searchParams
  const d = dict(lang)
  const t = d.socComunidades
  const aba = q.aba === 'minhas' || q.aba === 'convites' ? q.aba : 'todas'
  const theme = q.tema && THEME_RE.test(q.tema) ? q.tema : undefined
  const access = q.acesso === 'aberta' || q.acesso === 'moderada' ? q.acesso : undefined
  const order = q.ordem === 'ativas' ? 'ativas' : 'recentes'
  const { cliente: client } = getNetwork()
  const me = await whoAmI()
  const now = new Date().toISOString()

  const [list, all, mine, invites] = gateAdult(await Promise.all([
    load(() => client.comunidades({ tema: theme, acesso: access, ordem: order })),
    load(() => client.comunidades({})),
    me ? load(() => client.comunidadesDoRover(me.uid)) : Promise.resolve(null),
    me ? load(() => client.convites(me.uid)) : Promise.resolve(null),
  ]), await canSeeAdult())
  const inviteCount = invites?.ok ? invites.valor.length : 0
  const mineCount = mine?.ok ? mine.valor.itens.length : 0
  const themes = all.ok ? [...new Set(all.valor.itens.map((c) => c.tema))].sort() : []
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const base = { tema: theme, acesso: access, ordem: order === 'ativas' ? 'ativas' : undefined, ...extra }
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v)
    const s = p.toString()
    return `/${lang}/comunidades${s ? `?${s}` : ''}`
  }
  const filtering = !!(theme || access || order !== 'recentes')
  // reference screen comunidades-descobrir: with no filter on, the busiest community opens the list, big, and the reader's own
  // communities sit above it with their photos
  const items = list.ok ? list.valor.itens : []
  const highlight = !filtering && items.length > 1 ? items.reduce((a, b) => (b.membros > a.membros ? b : a)) : null
  const grid = highlight ? items.filter((c) => c.id !== highlight.id) : items
  const yours = mine?.ok ? mine.valor.itens.slice(0, 6) : []
  const iAmMember = (id: string) => yours.some((x) => x.comunidade.id === id)

  return (
    <>
      <div className="page-title">
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      <NetworkSubNav lang={lang} atual="comunidades" d={d} />
      <div className="com-bar">
        <nav className="page-tabs" aria-label={t.titulo}>
          <Link href={`/${lang}/comunidades`} aria-current={aba === 'todas' ? 'page' : undefined}>
            {t.abas.todas}
          </Link>
          <Link href={`/${lang}/comunidades?aba=minhas`} aria-current={aba === 'minhas' ? 'page' : undefined}>
            {t.abas.minhas}
            {mineCount > 0 && <span className="num"> {mineCount}</span>}
          </Link>
          <Link href={`/${lang}/comunidades?aba=convites`} aria-current={aba === 'convites' ? 'page' : undefined}>
            {t.abas.convites}
            {inviteCount > 0 && <span className="badge-num badge-inline" aria-label={String(inviteCount)}>{inviteCount}</span>}
          </Link>
        </nav>
        {me && (
          <Link href={`/${lang}/comunidades/nova`} className="btn btn-primary btn-small">
            {t.criar}
          </Link>
        )}
      </div>

      {aba === 'todas' && (
        <div className="stack-large">
          {inviteCount > 0 && invites?.ok && (
            <Link href={`/${lang}/comunidades?aba=convites`} className="slip" style={{ textDecoration: 'none' }}>
              <Emblem nome={invites.valor[0].comunidade.nome} tamanho={52} />
              <div>
                <h2>{plural(t.convitesBilhete, inviteCount)}</h2>
                <p>{fmt(t.convite.de, { nome: invites.valor[0].por.nome })}</p>
              </div>
            </Link>
          )}
          <nav className="com-categories" aria-label={d.socFolgali.comunidade.categorias}>
            {CATEGORIES.map((c) => (
              <Link key={c.key} href={href({ tema: theme === c.tema ? undefined : c.tema })} className="com-category" data-cor={c.color} aria-current={theme === c.tema ? 'true' : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/marca/folgali/icones/${c.key}.webp`} alt="" width={36} height={36} />
                {d.socFolgali.comunidade.cats[c.key]}
              </Link>
            ))}
          </nav>
          <section aria-labelledby="filtros-t" className="com-filters">
            <h2 id="filtros-t" className="reader-only">
              {t.filtros.rotulo}
            </h2>
            <div className="com-filter-group" role="group" aria-label={t.filtros.acesso}>
              <Link href={href({ acesso: undefined })} className="chip-filter" aria-current={!access ? 'true' : undefined}>
                {t.filtros.todos}
              </Link>
              <Link href={href({ acesso: 'aberta' })} className="chip-filter" aria-current={access === 'aberta' ? 'true' : undefined}>
                {t.filtros.aberta}
              </Link>
              <Link href={href({ acesso: 'moderada' })} className="chip-filter" aria-current={access === 'moderada' ? 'true' : undefined}>
                {t.filtros.moderada}
              </Link>
            </div>
            <div className="com-filter-group" role="group" aria-label={t.filtros.ordem}>
              <Link href={href({ ordem: undefined })} className="chip-filter" aria-current={order === 'recentes' ? 'true' : undefined}>
                {t.filtros.recentes}
              </Link>
              <Link href={href({ ordem: 'ativas' })} className="chip-filter" aria-current={order === 'ativas' ? 'true' : undefined}>
                {t.filtros.ativas}
              </Link>
            </div>
            {themes.length > 0 && (
              <div className="com-filter-group" role="group" aria-label={t.filtros.tagsTitulo}>
                {themes.map((x) => (
                  <Link key={x} href={href({ tema: theme === x ? undefined : x })} className="chip-filter" aria-current={theme === x ? 'true' : undefined}>
                    #{x}
                  </Link>
                ))}
              </div>
            )}
            {filtering && (
              <Link href={`/${lang}/comunidades`} className="fine com-clear">
                {t.filtros.limpar}
              </Link>
            )}
          </section>
          {!list.ok ? (
            <ErrorState codigo={list.codigo} d={d} lang={lang} />
          ) : list.valor.itens.length === 0 ? (
            <EmptyState titulo={t.listaVazia.titulo} texto={t.listaVazia.texto} ficha={faceByUid('rvr_comunidades_vazio_0000')} felt={FELT.emptyCommunities} estado="pensar" />
          ) : (
            <>
              {yours.length > 0 && !filtering && (
                <section className="com-yours" aria-labelledby="com-suas-t">
                  <h2 id="com-suas-t">{d.socFolgali.comunidade.suas}</h2>
                  <ul>
                    {yours.map(({ comunidade: c }) => (
                      <li key={c.id}>
                        <Link href={`/${lang}/comunidades/${c.id}`}>
                          <Photo foto={themeCover(c.tema, c.id)} alt="" late />
                          <strong>{c.nome}</strong>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {highlight && (
                <article className="com-highlight" aria-labelledby="com-destaque-t">
                  <div className="com-highlight-text">
                    <h2 id="com-destaque-t">{highlight.nome}</h2>
                    <p>
                      {plural(t.cartao.membros, highlight.membros)} · {plural(t.cartao.topicos, highlight.topicos)}
                    </p>
                    {highlight.descricao && <p>{highlight.descricao}</p>}
                    <Link href={`/${lang}/comunidades/${highlight.id}`} className="btn btn-primary">
                      {iAmMember(highlight.id) ? d.socFolgali.comunidade.abrir : d.socFolgali.comunidade.participar}
                    </Link>
                  </div>
                  <Photo foto={themeCover(highlight.tema, highlight.id)} alt="" prioridade sizes="(min-width: 960px) 420px, 100vw" />
                </article>
              )}
              <div className="card-grid">
                {grid.map((c) => (
                  <CommunityCard key={c.id} c={c} d={d} lang={lang} agora={now} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {aba === 'minhas' && (
        <section className="stack" aria-labelledby="minhas-t">
          <div>
            <h2 id="minhas-t">{me ? fmt(t.minhasTitulo, { nome: me.nome }) : t.abas.minhas}</h2>
            <p className="soft">{t.minhasTexto}</p>
          </div>
          {!mine ? (
            <ErrorState codigo="sem-permissao" d={d} lang={lang} />
          ) : !mine.ok ? (
            <ErrorState codigo={mine.codigo} d={d} lang={lang} />
          ) : mine.valor.itens.length === 0 ? (
            <EmptyState
              titulo={t.minhasVazio.titulo}
              texto={t.minhasVazio.texto}
              ficha={faceByUid('rvr_comunidades_minhas_vazio')}
              felt={FELT.emptyCommunities}
              acoes={
                <Link href={`/${lang}/comunidades`} className="btn btn-primary">
                  {t.abas.todas}
                </Link>
              }
            />
          ) : (
            <div className="card-grid">
              {mine.valor.itens.map((x: { comunidade: CommunityCardData; papel: 'dono' | 'moderador' | 'membro' }) => (
                <CommunityCard key={x.comunidade.id} c={x.comunidade} d={d} lang={lang} agora={now} papel={x.papel} />
              ))}
            </div>
          )}
        </section>
      )}

      {aba === 'convites' && (
        <section className="stack" aria-labelledby="convites-t">
          <div>
            <h2 id="convites-t">{t.convitesTitulo}</h2>
            <p className="soft">{t.convitesTexto}</p>
          </div>
          {!invites ? (
            <ErrorState codigo="sem-permissao" d={d} lang={lang} />
          ) : !invites.ok ? (
            <ErrorState codigo={invites.codigo} d={d} lang={lang} />
          ) : invites.valor.length === 0 ? (
            <EmptyState titulo={t.convitesVazio.titulo} texto={t.convitesVazio.texto} ficha={faceByUid('rvr_comunidades_convite_vazio')} />
          ) : (
            <ul className="stack">
              {invites.valor.map((cv) => (
                <li key={cv.comunidade.id} className="card invite-card" style={{ ['--h' as string]: 0 }}>
                  <div className="cc-top">
                    <Emblem nome={cv.comunidade.nome} tamanho={56} />
                    <span className="cc-name">
                      <strong>{cv.comunidade.nome}</strong>
                      <span className="fine">{d.socComum.acessos[cv.comunidade.acesso].nome}</span>
                    </span>
                  </div>
                  {cv.comunidade.descricao && <p className="cc-desc">{cv.comunidade.descricao}</p>}
                  <RoverCard rover={cv.por} lang={lang} tamanho={36} sub={fmt(t.convite.de, { nome: cv.por.nome })} />
                  <div className="flex-row">
                    <ActionButton ato={{ tipo: 'comunidade-adesao', comunidade: cv.comunidade.id, acao: 'aceitar-convite' }} d={d} className="btn btn-primary btn-small">
                      {t.convite.aceitar}
                    </ActionButton>
                    <ActionButton ato={{ tipo: 'comunidade-adesao', comunidade: cv.comunidade.id, acao: 'recusar-convite' }} d={d} className="btn btn-secondary btn-small">
                      {t.convite.recusar}
                    </ActionButton>
                    <Link href={`/${lang}/comunidades/${cv.comunidade.id}`} className="btn btn-calm btn-small">
                      {t.convite.abrir}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}
