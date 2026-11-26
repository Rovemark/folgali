import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import { IcArrow } from '@/components/Icons'
import FollowPageButton from '@/components/pages/FollowPageButton'
import ManagePage from '@/components/pages/ManagePage'
import UpdatesList from '@/components/pages/UpdateList'
import FollowersList from '@/components/pages/FollowerList'
import Portrait from '@/components/Portrait'
import ErrorState from '@/components/social/ErrorState'
import Emblem from '@/components/social/Emblem'
import ProposalForm from '@/components/social/ProposalForm'
import { IcEdit, IcTag } from '@/components/social/SocialIcons'
import { faceByUid } from '@/lib/domain/expression'
import { isObjectId } from '@/lib/domain/ids'
import { canOnPage } from '@/lib/domain/permissions'
import { shortDate, dict, isReady, plural } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load, stateType } from '@/lib/social/load'
import { shadeOf } from '@/lib/social/hue'
import { mergePages } from '@/lib/social/all'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ aba?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  if (!isReady(lang) || !isObjectId(id)) return { title: 'folgali' }
  const r = await load(() => getNetwork().cliente.pagina(id))
  return screenMeta(lang, `/paginas/${id}`, r.ok ? r.valor.nome : dict(lang).socPaginas.titulo, r.ok ? r.valor.descricao : undefined)
}

export default async function ProjectPage({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!isReady(lang) || !isObjectId(id)) notFound()
  const { aba: requestedTab } = await searchParams
  const d = dict(lang)
  const t = d.socPaginas
  const { cliente: client, ponte: bridge } = getNetwork()
  const [r, me] = await Promise.all([load(() => client.pagina(id)), bridge.whoAmI()])
  if (!r.ok) {
    if (stateType(r.codigo) === 'nao-existe') notFound()
    return <ErrorState codigo={r.codigo} d={d} lang={lang} />
  }
  // the owner is an administrator by definition (4.19 of the specification); the screen does not repeat them in the list nor allow removing them
  const p = { ...r.valor, administradores: r.valor.administradores.filter((a) => a.uid !== r.valor.dono.uid) }
  const role = p.voce?.papel ?? null
  const follows = p.voce?.segue ?? false
  const canPublish = canOnPage('publicar', role).ok
  const aba = requestedTab === 'seguidores' ? 'seguidores' : requestedTab === 'gerir' ? 'gerir' : 'atualizacoes'
  const now = new Date().toISOString()
  const base = `/${lang}/paginas/${p.id}`
  const hue = shadeOf(p.nome)

  // loads only what the tab shows
  const updR = aba === 'atualizacoes' ? await load(() => client.atualizacoes(p.id)) : null
  const folR = aba === 'seguidores' ? await load(() => client.seguidoresDaPagina(p.id)) : null
  let candidates: import('@/lib/types').RoverSummary[] = []
  if (aba === 'gerir' && role && me) {
    const am = await load(() => mergePages((c) => client.amigos(me.uid, c)))
    const already = new Set([p.dono.uid, ...p.administradores.map((a) => a.uid)])
    candidates = am.ok ? am.valor.map((x) => x.rover).filter((x) => !already.has(x.uid)) : []
  }

  return (
    <>
      <Link href={`/${lang}/paginas`} className="back">
        <IcArrow width={20} height={20} /> {t.titulo}
      </Link>

      <section className="pg-cover" style={{ ['--h' as string]: hue }} aria-labelledby="pg-nome">
        <div className="pg-cover-top">
          <Emblem nome={p.nome} forma="etiqueta" tamanho={84} />
          <div className="pg-cover-name">
            <span className="overline">{t.pagina.tipo}</span>
            <h1 id="pg-nome">{p.nome}</h1>
            <span className="theme-chip">#{p.tema}</span>
          </div>
        </div>
        {p.descricao && <p className="pg-desc">{p.descricao}</p>}
        <dl className="pg-meta">
          <div>
            <dt>{t.pagina.dono}</dt>
            <dd>
              <Link href={`/${lang}/r/${p.dono.handle}`} className="pg-person">
                <Portrait ficha={p.dono.rosto} nome={p.dono.nome} tamanho={28} decorative />
                <span>{p.dono.nome}</span>
              </Link>
            </dd>
          </div>
          {p.administradores.length > 0 && (
            <div>
              <dt>{t.pagina.administradores}</dt>
              <dd className="pg-admins">
                {p.administradores.map((a) => (
                  <Link key={a.uid} href={`/${lang}/r/${a.handle}`} className="pg-person">
                    <Portrait ficha={a.rosto} nome={a.nome} tamanho={28} decorative />
                    <span>{a.nome}</span>
                  </Link>
                ))}
              </dd>
            </div>
          )}
          <div>
            <dt>{t.pagina.seguidoresRotulo}</dt>
            <dd className="number">{plural(t.cartao.seguidores, p.seguidores)}</dd>
          </div>
          <div>
            <dt>{t.pagina.desde}</dt>
            <dd>{shortDate(p.criadaEm, lang)}</dd>
          </div>
        </dl>
        <div className="pg-actions">
          {role && (
            <span className="pill" data-tom="acao">
              <IcTag /> {role === 'dono' ? t.pagina.voceDono : t.pagina.voceAdmin}
            </span>
          )}
          {me && !role && <FollowPageButton pagina={p.id} segue={follows} d={d} />}
        </div>
      </section>

      <nav className="sub-nav" aria-label={t.pagina.abasRotulo}>
        <Link href={base} aria-current={aba === 'atualizacoes' ? 'page' : undefined}>
          {t.pagina.atualizacoes}
        </Link>
        <Link href={`${base}?aba=seguidores`} aria-current={aba === 'seguidores' ? 'page' : undefined}>
          {t.pagina.seguidoresAba}
        </Link>
        {role && (
          <Link href={`${base}?aba=gerir`} aria-current={aba === 'gerir' ? 'page' : undefined}>
            <IcEdit width={18} height={18} /> {t.pagina.gerirAba}
          </Link>
        )}
      </nav>

      {aba === 'atualizacoes' && (
        <div className="stack">
          {canPublish && (
            <details className="pg-publish card" open={false}>
              <summary>
                <IcEdit width={22} height={22} /> {t.pagina.publicarAbrir}
              </summary>
              <ProposalForm
                tipo="pagina-publicar"
                d={d}
                lang={lang}
                campos={{ pagina: p.id, titulo: '', texto: '', tags: [] }}
                destino={{ rotulo: p.nome, href: base }}
                canWrite={me !== null}
                roverName={me?.nome}
                enviar={t.pagina.publicarEnviar}
                placeholder={t.pagina.publicarPlaceholder}
              />
            </details>
          )}
          {updR && !updR.ok && <ErrorState codigo={updR.codigo} d={d} lang={lang} noBack />}
          {updR?.ok &&
            (updR.valor.itens.length > 0 ? (
              <UpdatesList initial={updR.valor} pagina={p.id} d={d} lang={lang} agora={now} myUid={me?.uid} iAmPageOwner={role === 'dono'} pageName={p.nome} />
            ) : (
              <EmptyState
                titulo={canPublish ? t.pagina.vazioAtuDono.titulo : t.pagina.vazioAtu.titulo}
                texto={canPublish ? t.pagina.vazioAtuDono.texto : t.pagina.vazioAtu.texto}
                ficha={faceByUid(`rvr_pagina_${p.id.slice(3, 20)}`)}
                estado="dormir"
              />
            ))}
        </div>
      )}

      {aba === 'seguidores' && (
        <div className="stack">
          <p className="proposal-note">{t.pagina.seguidoresNota}</p>
          {folR && !folR.ok && <ErrorState codigo={folR.codigo} d={d} lang={lang} noBack />}
          {folR?.ok &&
            (folR.valor.itens.length > 0 ? (
              <FollowersList initial={folR.valor} pagina={p.id} d={d} lang={lang} />
            ) : (
              <EmptyState titulo={t.pagina.seguidoresVazio.titulo} texto={t.pagina.seguidoresVazio.texto} ficha={faceByUid('rvr_pagina_sem_seguidores_0')} estado="pensar" />
            ))}
        </div>
      )}

      {aba === 'gerir' &&
        (role ? (
          <ManagePage p={p} d={d} lang={lang} papel={role} candidates={candidates} canWrite={me !== null} roverName={me?.nome} />
        ) : (
          <ErrorState codigo="sem-permissao" d={d} lang={lang} noBack />
        ))}
    </>
  )
}
