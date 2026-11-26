import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import ActionWithReason from '@/components/communities/ActionWithReason'
import CommunityHeader from '@/components/communities/CommunityHeader'
import MembersModeration from '@/components/communities/ModerationMembers'
import Portrait from '@/components/Portrait'
import { IcMod } from '@/components/social/SocialIcons'
import ActionButton from '@/components/social/ActButton'
import RoverCard from '@/components/social/RoverCard'
import ErrorState from '@/components/social/ErrorState'
import { isComplete, isTeam, ID_OK, readCommunity, whoAmI } from '@/lib/communities/data'
import { faceByUid } from '@/lib/domain/expression'
import { dict, isReady, fmt, plural, relativeTime, type Ready } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import type { SocialReportReason } from '@/lib/social/types'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ aba?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/comunidades/${id}/moderacao`, dict(isReady(lang) ? lang : 'pt').socModeracao.titulo)
}

const TABS = ['fila', 'pedidos', 'convites', 'membros', 'banidos', 'apelacoes'] as const
type Tab = (typeof TABS)[number]

export default async function Moderation({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const q = await searchParams
  const d = dict(lang)
  const t = d.socModeracao
  const c = ID_OK.test(id) ? await readCommunity(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <ErrorState codigo={c.codigo} d={d} lang={lang} />
  const using = c.valor
  if (!isComplete(using)) return <CommunityHeader c={using} d={d} lang={lang} />
  if (!isTeam(using.voce)) {
    return (
      <>
        <CommunityHeader c={using} d={d} lang={lang} aba="moderacao" />
        <EmptyState titulo={t.soEquipe.titulo} texto={t.soEquipe.texto} ficha={faceByUid('rvr_moderacao_so_equipe')} estado="parado" erro />
      </>
    )
  }
  const owner = using.voce?.papel === 'dono'
  const visibleTabs = TABS.filter((a) => a !== 'apelacoes' || owner)
  const aba: Tab = (visibleTabs as readonly string[]).includes(q.aba ?? '') ? (q.aba as Tab) : 'fila'
  const me = await whoAmI()
  const { cliente: client } = getNetwork()
  const now = new Date().toISOString()
  const today = new Date(now)
  const base = `/${lang}/comunidades/${id}/moderacao`

  // loads only what the tab shows, but counts what can be counted for free (badge on the tabs)
  const [queue, requests, invites, canDismiss] = await Promise.all([
    load(() => client.filaDeModeracao(id)),
    load(() => client.pedidosDeEntrada(id)),
    load(() => client.convitesDaComunidade(id)),
    // 0.3.1 (`denuncia-dispensar`): relay 0.3 does not have the action, so the button does not even appear
    client.suporta('denuncia-dispensar').catch(() => false),
  ])
  const nQueue = queue.ok ? queue.valor.denuncias.length : 0
  const nRequests = requests.ok ? requests.valor.itens.length : 0
  const nAppeals = queue.ok ? queue.valor.apelacoes.length : 0
  const count: Partial<Record<Tab, number>> = { fila: nQueue, pedidos: nRequests, convites: invites.ok ? invites.valor.itens.length : 0, apelacoes: nAppeals }

  return (
    <>
      <CommunityHeader c={using} d={d} lang={lang} aba="moderacao" />
      <div className="stack-large">
        <div>
          <h2 className="mod-title">
            <IcMod /> {t.titulo}
          </h2>
          <p className="soft">{fmt(t.sub, { nome: using.nome })}</p>
        </div>
        <nav className="sub-nav break" aria-label={t.abasRotulo}>
          {visibleTabs.map((a) => (
            <Link key={a} href={`${base}?aba=${a}`} aria-current={aba === a ? 'page' : undefined}>
              {t.abas[a]}
              {(count[a] ?? 0) > 0 && <span className="num">{count[a]}</span>}
            </Link>
          ))}
        </nav>

        {aba === 'fila' && (
          <section className="stack" aria-labelledby="fila-t">
            <h3 id="fila-t" className="reader-only">
              {t.abas.fila}
            </h3>
            <p className="proposal-note">
              <IcMod width={18} height={18} /> <span>{t.fila.intro}</span>
            </p>
            {!queue.ok ? (
              <ErrorState codigo={queue.codigo} d={d} lang={lang} />
            ) : queue.valor.denuncias.length === 0 ? (
              <EmptyState titulo={t.fila.vazio.titulo} texto={t.fila.vazio.texto} ficha={faceByUid('rvr_fila_vazia_0000000')} estado="feliz" />
            ) : (
              <ul className="stack">
                {queue.valor.denuncias.map((x) => (
                  <li key={x.alvo} className="card queue-item">
                    <div className="flex-row">
                      <span className="pill" data-tom="aviso">
                        {x.alvoTipo === 'topico' ? t.fila.alvoTopico : t.fila.alvoResposta}
                      </span>
                      <span className="pill">{plural(t.fila.total, x.total)}</span>
                      <span className="pill" title={t.fila.pesoAjuda}>
                        {fmt(t.fila.peso, { n: x.peso })}
                      </span>
                    </div>
                    <ul className="flex-row fila-motivos" aria-label={d.socComum.campos.tipo}>
                      {Object.entries(x.motivos).map(([m, n]) => (
                        <li key={m} className="label-tag">
                          {d.socComum.motivosDenuncia[m as SocialReportReason]} · {n}
                        </li>
                      ))}
                    </ul>
                    {x.previa && (
                      <blockquote className="target-report queue-preview">
                        <span className="flex-row">
                          <Portrait ficha={x.previa.autor.rosto} nome={x.previa.autor.nome} tamanho={32} decorative />
                          <strong>{x.previa.autor.nome}</strong>
                          {x.previa.topico && <span className="fine">{fmt(t.fila.emTopico, { titulo: x.previa.topico })}</span>}
                        </span>
                        <q>{x.previa.trecho}</q>
                      </blockquote>
                    )}
                    <p className="fine">
                      {fmt(t.fila.primeira, { quando: relativeTime(x.primeiraEm, d, today) })} · {fmt(t.fila.ultima, { quando: relativeTime(x.ultimaEm, d, today) })}
                    </p>
                    <div className="flex-row">
                      {x.alvoTipo === 'topico' && (
                        <Link href={`/${lang}/t/${x.alvo}`} className="btn btn-secondary btn-small">
                          {t.fila.ver}
                        </Link>
                      )}
                      <ActionWithReason
                        ato={{ tipo: 'remocao-por-responsavel', alvo: x.alvo }}
                        d={d}
                        rotulo={t.fila.remover}
                        titulo={d.socForum.gestao.removerTitulo}
                        texto={d.socForum.gestao.removerTexto}
                        confirmar={d.socForum.gestao.confirmar}
                      />
                      {canDismiss && (
                        <ActionButton
                          ato={{ tipo: 'denuncia-dispensar', comunidade: id, alvo: x.alvo }}
                          d={d}
                          className="btn btn-calm btn-small"
                          confirmar={{ titulo: t.fila.dispensarTitulo, texto: t.fila.dispensarTexto, ok: t.fila.dispensarOk }}
                        >
                          {t.fila.dispensar}
                        </ActionButton>
                      )}
                    </div>
                    <p className="fine">{canDismiss ? t.fila.dispensarNota : t.fila.semAcao}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {aba === 'pedidos' && (
          <section className="stack" aria-labelledby="ped-t">
            <h3 id="ped-t">{t.pedidos.titulo}</h3>
            {!requests.ok ? (
              <ErrorState codigo={requests.codigo} d={d} lang={lang} />
            ) : requests.valor.itens.length === 0 ? (
              <EmptyState titulo={t.pedidos.vazio.titulo} texto={t.pedidos.vazio.texto} ficha={faceByUid('rvr_pedidos_vazio_00000')} />
            ) : (
              <ul className="stack">
                {requests.valor.itens.map((p) => (
                  <li key={p.rover.uid} className="card">
                    <RoverCard rover={p.rover} lang={lang} sub={fmt(t.pedidos.em, { quando: relativeTime(p.em, d, today) })} />
                    <div className="flex-row">
                      <ActionButton ato={{ tipo: 'comunidade-gestao', comunidade: id, alvo: p.rover.uid, acao: 'aprovar-pedido', motivo: null }} d={d} className="btn btn-primary btn-small">
                        {t.pedidos.aprovar}
                      </ActionButton>
                      <ActionButton ato={{ tipo: 'comunidade-gestao', comunidade: id, alvo: p.rover.uid, acao: 'recusar-pedido', motivo: null }} d={d} className="btn btn-secondary btn-small">
                        {t.pedidos.recusar}
                      </ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {aba === 'convites' && (
          <section className="stack" aria-labelledby="conv-t">
            <h3 id="conv-t">{t.convites.titulo}</h3>
            {!invites.ok ? (
              <ErrorState codigo={invites.codigo} d={d} lang={lang} />
            ) : invites.valor.itens.length === 0 ? (
              <EmptyState titulo={t.convites.vazio.titulo} texto={t.convites.vazio.texto} ficha={faceByUid('rvr_convites_vazio_0000')} />
            ) : (
              <ul className="stack">
                {invites.valor.itens.map((p) => (
                  <li key={p.rover.uid} className="card">
                    <RoverCard rover={p.rover} lang={lang} sub={`${fmt(t.convites.por, { nome: p.por.nome })} · ${relativeTime(p.em, d, today)}`} />
                    <div className="flex-row">
                      <ActionButton ato={{ tipo: 'comunidade-gestao', comunidade: id, alvo: p.rover.uid, acao: 'cancelar-convite', motivo: null }} d={d} className="btn btn-secondary btn-small">
                        {t.convites.cancelar}
                      </ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {aba === 'membros' && <MembersTab id={id} lang={lang} d={d} papel={using.voce!.papel!} acesso={using.acesso} myUid={me?.uid ?? ''} agora={now} />}
        {aba === 'banidos' && <BannedTab id={id} lang={lang} d={d} agora={today} />}

        {aba === 'apelacoes' && owner && (
          <section className="stack" aria-labelledby="ap-t">
            <div>
              <h3 id="ap-t">{t.apelacoes.titulo}</h3>
              <p className="soft">{t.apelacoes.intro}</p>
            </div>
            {!queue.ok ? (
              <ErrorState codigo={queue.codigo} d={d} lang={lang} />
            ) : queue.valor.apelacoes.length === 0 ? (
              <EmptyState titulo={t.apelacoes.vazio.titulo} texto={t.apelacoes.vazio.texto} ficha={faceByUid('rvr_apelacoes_vazio_00')} />
            ) : (
              <ul className="stack">
                {queue.valor.apelacoes.map((a) => (
                  <li key={a.id} className="card appeal-item">
                    <div className="flex-row">
                      <span className="pill" data-tom="aviso">
                        {t.apelacoes.tipo[a.tipo]}
                      </span>
                      <span className="fine">{relativeTime(a.em, d, today)}</span>
                    </div>
                    <RoverCard rover={a.autor} lang={lang} tamanho={40} />
                    <div>
                      <p className="overline">{t.apelacoes.texto}</p>
                      <p className="appeal-text">{a.texto}</p>
                    </div>
                    <div>
                      <p className="overline">{t.apelacoes.conteudo}</p>
                      {a.conteudo ? <blockquote className="target-report"><q>{a.conteudo}</q></blockquote> : <p className="fine">{t.apelacoes.conteudoVazio}</p>}
                    </div>
                    <div className="flex-row">
                      <ActionButton
                        ato={{ tipo: 'apelacao-decisao', apelacao: a.id, resultado: 'revertida' }}
                        d={d}
                        className="btn btn-primary btn-small"
                        confirmar={{ titulo: t.apelacoes.reverterTitulo, texto: t.apelacoes.reverterTexto, ok: t.apelacoes.reverter }}
                      >
                        {t.apelacoes.reverter}
                      </ActionButton>
                      <ActionButton
                        ato={{ tipo: 'apelacao-decisao', apelacao: a.id, resultado: 'mantida' }}
                        d={d}
                        className="btn btn-secondary btn-small"
                        confirmar={{ titulo: t.apelacoes.manterTitulo, texto: t.apelacoes.manterTexto, ok: t.apelacoes.manter }}
                      >
                        {t.apelacoes.manter}
                      </ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  )
}

async function MembersTab({ id, lang, d, papel: role, acesso: access, myUid, agora: now }: { id: string; lang: Ready; d: ReturnType<typeof dict>; papel: 'dono' | 'moderador' | 'membro'; acesso: 'aberta' | 'moderada' | 'fechada'; myUid: string; agora: string }) {
  const list = await load(() => getNetwork().cliente.membros(id))
  const t = d.socModeracao.membros
  return (
    <section className="stack" aria-labelledby="mem-t">
      <h3 id="mem-t">{t.titulo}</h3>
      {!list.ok ? (
        <ErrorState codigo={list.codigo} d={d} lang={lang} />
      ) : (
        <MembersModeration initial={list.valor} comunidade={id} acesso={access} myRole={role} myUid={myUid} d={d} lang={lang} agora={now} />
      )}
    </section>
  )
}

async function BannedTab({ id, lang, d, agora: now }: { id: string; lang: Ready; d: ReturnType<typeof dict>; agora: Date }) {
  const list = await load(() => getNetwork().cliente.banidos(id))
  const t = d.socModeracao.banidos
  return (
    <section className="stack" aria-labelledby="ban-t">
      <h3 id="ban-t">{t.titulo}</h3>
      {!list.ok ? (
        <ErrorState codigo={list.codigo} d={d} lang={lang} />
      ) : list.valor.itens.length === 0 ? (
        <EmptyState titulo={t.vazio.titulo} texto={t.vazio.texto} ficha={faceByUid('rvr_banidos_vazio_0000')} estado="feliz" />
      ) : (
        <ul className="stack">
          {list.valor.itens.map((b) => (
            <li key={b.rover.uid} className="card">
              <RoverCard rover={b.rover} lang={lang} sub={`${fmt(t.por, { papel: d.socComum.papeis[b.por].toLowerCase() })} · ${relativeTime(b.em, d, now)}`} />
              <div className="flex-row">
                <span className="label-tag">{d.socComum.motivosModeracao[b.motivo]}</span>
                <span className="pill" data-tom={b.apelacao === 'aberta' ? 'aviso' : b.apelacao === 'revertida' ? 'ok' : undefined}>
                  {t.apelacao[b.apelacao ?? 'nenhuma']}
                </span>
              </div>
              <div className="flex-row">
                <ActionButton ato={{ tipo: 'comunidade-gestao', comunidade: id, alvo: b.rover.uid, acao: 'desbanir', motivo: null }} d={d} className="btn btn-secondary btn-small">
                  {t.desbanir}
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
