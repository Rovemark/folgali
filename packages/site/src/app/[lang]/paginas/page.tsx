import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import CartaoPagina from '@/components/paginas/CartaoPagina'
import ListaPaginas from '@/components/paginas/ListaPaginas'
import { IcEtiqueta, IcGrupo } from '@/components/social/IconesSociais'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import EstadoVazio from '@/components/EstadoVazio'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { dict, ehPronto, plural } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { juntarPaginas } from '@/lib/social/todas'
import type { OrdemListada } from '@/lib/social/tipos'
import { metaDaRota } from '@/lib/seo/metadata'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ aba?: string; ordem?: string; tema?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaDaRota(ehPronto(lang) ? lang : 'pt', 'paginas')
}

export default async function Paginas({ params, searchParams }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const sp = await searchParams
  const d = dict(lang)
  const t = d.socPaginas
  const { cliente, ponte } = obterRede()
  const eu = await ponte.quemSou()
  const aba = sp.aba === 'minhas' || sp.aba === 'sigo' ? sp.aba : 'todas'
  const ordem: OrdemListada = sp.ordem === 'ativas' ? 'ativas' : 'recentes'
  const tema = sp.tema && /^[a-z0-9][a-z0-9-]{1,23}$/.test(sp.tema) ? sp.tema : undefined
  const agora = new Date().toISOString()
  const href = (o: { aba?: string; ordem?: string; tema?: string }) => {
    const q = new URLSearchParams()
    const a = o.aba ?? aba
    if (a !== 'todas') q.set('aba', a)
    const od = o.ordem ?? ordem
    if (od !== 'recentes') q.set('ordem', od)
    const tm = 'tema' in o ? o.tema : tema
    if (tm) q.set('tema', tm)
    return `/${lang}/paginas${q.size ? `?${q}` : ''}`
  }

  const [todasR, listaR, minhasR, temasR] = await Promise.all([
    carregar(() => juntarPaginas((c) => cliente.paginas({ cursor: c }))),
    aba === 'todas' ? carregar(() => cliente.paginas({ tema, ordem })) : Promise.resolve(null),
    aba !== 'todas' && eu ? carregar(() => juntarPaginas((c) => cliente.paginasDoRover(eu.uid, c))) : Promise.resolve(null),
    // 0.3.1 (`temas-de-paginas`): os temas do relé, do mais usado para o menos, com a conta de páginas. Relé 0.3 devolve lista vazia.
    carregar(() => cliente.temasDePaginas()),
  ])
  const doRele = temasR.ok ? temasR.valor : []
  // sem a lista do relé, os temas saem das páginas que a tela já carregou (o contorno de antes), sem contagem
  const temas: { tema: string; paginas?: number }[] =
    doRele.length > 0 ? doRele : todasR.ok ? [...new Set(todasR.valor.map((p) => p.tema))].sort().map((x) => ({ tema: x })) : []
  const meusCartoes = minhasR?.ok
    ? minhasR.valor.filter((x) => (aba === 'minhas' ? x.relacao !== 'seguidor' : x.relacao === 'seguidor')).filter((x) => !tema || x.pagina.tema === tema)
    : []

  return (
    <>
      <div className="titulo-pag">
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      <nav className="sub-nav" aria-label={t.secoes}>
        <Link href={`/${lang}/comunidades`}>
          <IcGrupo width={20} height={20} /> {t.irComunidades}
        </Link>
        <Link href={`/${lang}/paginas`} aria-current="page">
          <IcEtiqueta width={20} height={20} /> {t.titulo}
        </Link>
      </nav>

      <div className="pg-barra">
        <nav className="sub-nav" aria-label={t.abasRotulo}>
          {(['todas', 'minhas', 'sigo'] as const).map((a) => (
            <Link key={a} href={href({ aba: a })} aria-current={aba === a ? 'page' : undefined}>
              {t.abas[a]}
            </Link>
          ))}
        </nav>
        {eu && (
          <Link href={`/${lang}/paginas/nova`} className="btn btn-prim btn-peq">
            {t.nova}
          </Link>
        )}
      </div>

      <div className="pg-filtros">
        {aba === 'todas' && (
          <div className="ordem" role="group" aria-label={t.ordem.rotulo}>
            {(['recentes', 'ativas'] as const).map((o) => (
              <Link key={o} href={href({ ordem: o })} aria-current={ordem === o ? 'true' : undefined} className="chip-filtro">
                {t.ordem[o]}
              </Link>
            ))}
          </div>
        )}
        {temas.length > 1 && (
          <div className="temas" role="group" aria-label={t.tema.rotulo}>
            <Link href={href({ tema: undefined })} aria-current={!tema ? 'true' : undefined} className="chip-filtro">
              {t.tema.todos}
            </Link>
            {temas.map((x) => (
              <Link key={x.tema} href={href({ tema: x.tema })} aria-current={tema === x.tema ? 'true' : undefined} className="chip-filtro">
                #{x.tema}
                {x.paginas !== undefined && <span className="num">{x.paginas}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {aba === 'todas' && listaR && !listaR.ok && <EstadoDeErro codigo={listaR.codigo} d={d} lang={lang} />}
      {aba === 'todas' && listaR?.ok && (listaR.valor.itens.length > 0 ? (
        <>
          <p className="sobrelinha" aria-live="polite">
            {plural(t.total, todasR.ok && !tema ? todasR.valor.length : listaR.valor.itens.length)}
          </p>
          <ListaPaginas key={`${ordem}-${tema ?? ''}`} inicial={listaR.valor} opcoes={{ ordem, ...(tema ? { tema } : {}) }} d={d} lang={lang} agora={agora} />
        </>
      ) : (
        <EstadoVazio titulo={t.vazio.todas.titulo} texto={t.vazio.todas.texto} ficha={rostoPorUid('rvr_paginas_vazio_000000')} estado="dormir" acoes={eu ? <Link href={`/${lang}/paginas/nova`} className="btn btn-prim">{t.nova}</Link> : undefined} />
      ))}

      {aba !== 'todas' && !eu && <EstadoDeErro codigo="proibido" d={d} lang={lang} />}
      {aba !== 'todas' && eu && minhasR && !minhasR.ok && <EstadoDeErro codigo={minhasR.codigo} d={d} lang={lang} />}
      {aba !== 'todas' && eu && minhasR?.ok && (meusCartoes.length > 0 ? (
        <ul className="grade-etiquetas">
          {meusCartoes.map((x) => (
            <li key={x.pagina.id}>
              <CartaoPagina p={x.pagina} d={d} lang={lang} agora={agora} relacao={x.relacao} />
            </li>
          ))}
        </ul>
      ) : (
        <EstadoVazio
          titulo={t.vazio[aba].titulo}
          texto={t.vazio[aba].texto}
          ficha={rostoPorUid(`rvr_paginas_${aba}_vazio_0000`)}
          estado="pensar"
          acoes={<Link href={aba === 'minhas' ? `/${lang}/paginas/nova` : `/${lang}/paginas`} className="btn btn-prim">{aba === 'minhas' ? t.nova : t.explorar}</Link>}
        />
      ))}
    </>
  )
}
