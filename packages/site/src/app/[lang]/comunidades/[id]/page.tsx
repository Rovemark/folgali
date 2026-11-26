import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import { BanNotice, InviteNotice } from '@/components/communities/CommunityNotice'
import CommunityHeader from '@/components/communities/CommunityHeader'
import TopicCard from '@/components/communities/TopicCard'
import CommunitySide from '@/components/communities/CommunitySide'
import { UpcomingInCommunity } from '@/components/events/MiniEvents'
import { isDemo } from '@/lib/site'
import { TagChip, StatusChip } from '@/components/communities/Brands'
import { TopicsMore } from '@/components/communities/MoreLists'
import ErrorState from '@/components/social/ErrorState'
import { isComplete, ID_OK, readCommunity, whoOf, whoAmI } from '@/lib/communities/data'
import { faceByUid } from '@/lib/domain/expression'
import { orderWindow, topicOrder } from '@/lib/domain/order'
import { canInCommunity } from '@/lib/domain/permissions'
import { statusForFilter } from '@/lib/domain/vocabulary'
import { dict, isReady } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ ordem?: string; categoria?: string; tag?: string; janela?: string; status?: string; etiqueta?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  const c = ID_OK.test(id) ? await readCommunity(id) : null
  const d = dict(isReady(lang) ? lang : 'pt')
  return screenMeta(lang, `/comunidades/${id}`, c?.ok ? c.valor.nome : d.socComunidades.titulo, c?.ok ? c.valor.descricao : undefined)
}

export default async function CommunityPage({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const q = await searchParams
  const d = dict(lang)
  const t = d.socForum.lista
  const c = ID_OK.test(id) ? await readCommunity(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <ErrorState codigo={c.codigo} d={d} lang={lang} />
  const using = c.valor
  const now = new Date().toISOString()
  const me = await whoAmI()

  if (!isComplete(using)) {
    return (
      <>
        <CommunityHeader c={using} d={d} lang={lang} />
        <InviteNotice d={d} />
      </>
    )
  }

  // 0.3.2: the by-people orders are only offered if the relay declares the feature; the vocabulary comes in the community itself (relay 0.3 and 0.3.1 do not send it)
  const byPeople = await getNetwork().cliente.suporta('ordem-por-pessoas')
  const order = topicOrder(q.ordem, byPeople)
  const window = orderWindow(order, q.janela)
  const category = q.categoria && using.categorias.includes(q.categoria) ? q.categoria : undefined
  const tag = q.tag && /^[a-z0-9][a-z0-9-]{1,23}$/.test(q.tag) ? q.tag : undefined
  const vocab = using.vocabulario
  const status = vocab?.status.find((s) => s.chave === q.status)?.chave
  const label = vocab?.etiquetas.find((e) => e.chave === q.etiqueta)?.chave
  const [list, record, members] = await Promise.all([
    load(() => getNetwork().cliente.topicos(id, { ordem: order, categoria: category, tag, janela: window, status, etiqueta: label })),
    // relay 0.3: the ban date comes from the public record; relay 0.3.1 already sends it in `voce.banidoEm` and the call is not even made
    using.voce?.banido && me && !using.voce.banidoEm ? load(() => getNetwork().cliente.registroDaComunidade(id)) : Promise.resolve(null),
    load(() => getNetwork().cliente.membros(id)),
  ])
  const people = members.ok ? members.valor.itens : []
  const team = people.filter((m) => m.papel !== 'membro')
  const bannedAt = using.voce?.banidoEm ?? (record?.ok ? (record.valor.itens.find((r) => r.acao === 'banimento' && typeof r.alvo === 'object' && r.alvo.uid === me?.uid)?.em ?? null) : null)
  const who = whoOf(using.voce)
  const canOpen = canInCommunity('postar-topico', who, using.acesso).ok
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const base = { ordem: order === 'recentes' ? undefined : order, janela: window, categoria: category, tag, status, etiqueta: label, ...extra }
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v)
    const s = p.toString()
    return `/${lang}/comunidades/${id}${s ? `?${s}` : ''}`
  }

  return (
    <div className="wide-page com-pagina">
      <CommunityHeader c={using} d={d} lang={lang} aba="conversas" faces={people.slice(0, 5).map((m) => m.rover)} />
      {using.voce?.banido && <BanNotice id={id} d={d} lang={lang} banidoEm={bannedAt} agora={now} />}
      <div className="com-grid">
      <section className="stack" aria-labelledby="conversas-t">
        <div className="section-top">
          <h2 id="conversas-t">{t.titulo}</h2>
          {canOpen && (
            <Link href={`/${lang}/comunidades/${id}/novo`} className="btn btn-primary btn-small">
              {t.novo}
            </Link>
          )}
        </div>
        <nav className="sub-nav" aria-label={t.abasRotulo}>
          <Link href={href({ ordem: undefined })} aria-current={order === 'recentes' ? 'page' : undefined}>
            {t.abas.recentes}
          </Link>
          <Link href={href({ ordem: 'ativos' })} aria-current={order === 'ativos' ? 'page' : undefined}>
            {t.abas.ativos}
          </Link>
          <Link href={href({ ordem: 'sem-resposta' })} aria-current={order === 'sem-resposta' ? 'page' : undefined}>
            {t.abas.semResposta}
          </Link>
          {byPeople && (
            <>
              <Link href={href({ ordem: 'melhores', janela: undefined })} aria-current={order === 'melhores' ? 'page' : undefined}>
                {t.abas.melhores}
              </Link>
              <Link href={href({ ordem: 'em-alta', janela: undefined })} aria-current={order === 'em-alta' ? 'page' : undefined}>
                {t.abas.emAlta}
              </Link>
            </>
          )}
        </nav>
        {(order === 'melhores' || order === 'em-alta') && (
          <div className="order-people">
            <p className="fine">{t.ordemNota}</p>
            {order === 'em-alta' && (
              <div className="com-filter-group" role="group" aria-label={t.janelaRotulo}>
                <Link href={href({ janela: undefined })} className="chip-filter" aria-current={!window ? 'true' : undefined}>
                  {t.janelas['24h']}
                </Link>
                <Link href={href({ janela: '7d' })} className="chip-filter" aria-current={window === '7d' ? 'true' : undefined}>
                  {t.janelas['7d']}
                </Link>
              </div>
            )}
          </div>
        )}
        {vocab && (vocab.status.length > 0 || vocab.etiquetas.length > 0) && (
          <div className="vocab-filters">
            {vocab.status.length > 0 && (
              <div className="com-filter-group" role="group" aria-label={t.statusRotulo}>
                <Link href={href({ status: undefined })} className="chip-filter" aria-current={!status ? 'true' : undefined}>
                  {t.todas}
                </Link>
                {statusForFilter(vocab, category).map((s) => (
                  <Link key={s.chave} href={href({ status: status === s.chave ? undefined : s.chave })} className="vocab-filter" aria-current={status === s.chave ? 'true' : undefined}>
                    <StatusChip s={s} d={d} />
                  </Link>
                ))}
              </div>
            )}
            {vocab.etiquetas.length > 0 && (
              <div className="com-filter-group" role="group" aria-label={t.etiquetaRotulo}>
                <Link href={href({ etiqueta: undefined })} className="chip-filter" aria-current={!label ? 'true' : undefined}>
                  {t.todas}
                </Link>
                {vocab.etiquetas.map((e) => (
                  <Link key={e.chave} href={href({ etiqueta: label === e.chave ? undefined : e.chave })} className="vocab-filter" aria-current={label === e.chave ? 'true' : undefined}>
                    <TagChip e={e} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
        {(using.categorias.length > 0 || tag) && (
          <div className="com-filter-group" role="group" aria-label={t.categoriaRotulo}>
            {using.categorias.length > 0 && (
              <Link href={href({ categoria: undefined })} className="chip-filter" aria-current={!category ? 'true' : undefined}>
                {t.todas}
              </Link>
            )}
            {using.categorias.map((cat) => (
              <Link key={cat} href={href({ categoria: category === cat ? undefined : cat })} className="chip-filter" aria-current={category === cat ? 'true' : undefined}>
                {cat}
              </Link>
            ))}
            {tag && (
              <Link href={href({ tag: undefined })} className="chip-filter active-tag" aria-label={t.tirarTag}>
                {t.tagFiltro.replace('{tag}', `#${tag}`)} ×
              </Link>
            )}
          </div>
        )}

        {!list.ok ? (
          <ErrorState codigo={list.codigo} d={d} lang={lang} />
        ) : (
          <>
            {list.valor.fixados && list.valor.fixados.length > 0 && (
              <div className="pinned-topics" aria-label={t.fixados}>
                <h3 className="overline">{t.fixados}</h3>
                <div className="topics-list">
                  {list.valor.fixados.map((x) => (
                    <TopicCard key={x.id} t={x} d={d} lang={lang} agora={now} vocabulario={vocab} />
                  ))}
                </div>
              </div>
            )}
            {list.valor.itens.length === 0 && !(list.valor.fixados && list.valor.fixados.length > 0) ? (
              <EmptyState
                titulo={status || label ? t.vazioMarca.titulo : order === 'sem-resposta' ? t.vazioSemResposta.titulo : category || tag ? t.vazioFiltro.titulo : t.vazio.titulo}
                texto={status || label ? t.vazioMarca.texto : order === 'sem-resposta' ? t.vazioSemResposta.texto : category || tag ? t.vazioFiltro.texto : t.vazio.texto}
                ficha={faceByUid(`rvr_forum_vazio_${order}00000`)}
                estado={order === 'sem-resposta' ? 'feliz' : 'dormir'}
                acoes={
                  canOpen ? (
                    <Link href={`/${lang}/comunidades/${id}/novo`} className="btn btn-primary">
                      {t.novo}
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <TopicsMore initial={{ itens: list.valor.itens, proximo: list.valor.proximo }} comunidade={id} opcoes={{ ordem: order, ...(window ? { janela: window } : {}), ...(category ? { categoria: category } : {}), ...(tag ? { tag } : {}), ...(status ? { status } : {}), ...(label ? { etiqueta: label } : {}) }} d={d} lang={lang} agora={now} vocabulario={vocab} />
            )}
          </>
        )}
      </section>
      <CommunitySide
        c={using}
        team={team}
        d={d}
        lang={lang}
        demonstration={isDemo(getNetwork().cliente.modo)}
        nextEvents={isDemo(getNetwork().cliente.modo) ? undefined : <UpcomingInCommunity community={id} lang={lang} title={d.socFolgali.comunidade.proximoEvento} />}
      />
      </div>
    </div>
  )
}
