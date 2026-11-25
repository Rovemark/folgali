import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import BotaoAto from '@/components/social/BotaoAto'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import CartaoRover from '@/components/social/CartaoRover'
import Emblema from '@/components/social/Emblema'
import CartaoComunidade from '@/components/comunidades/CartaoComunidade'
import SubNavRede from '@/components/comunidades/SubNavRede'
import { quemSou } from '@/lib/comunidades/dados'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { dict, ehPronto, fmt, plural } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import type { ComunidadeCartao } from '@/lib/social/tipos'
import { metaDaRota } from '@/lib/seo/metadata'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ aba?: string; tema?: string; acesso?: string; ordem?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaDaRota(ehPronto(lang) ? lang : 'pt', 'comunidades')
}

const TEMA_RE = /^[a-z0-9][a-z0-9-]{1,23}$/

export default async function Comunidades({ params, searchParams }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const q = await searchParams
  const d = dict(lang)
  const t = d.socComunidades
  const aba = q.aba === 'minhas' || q.aba === 'convites' ? q.aba : 'todas'
  const tema = q.tema && TEMA_RE.test(q.tema) ? q.tema : undefined
  const acesso = q.acesso === 'aberta' || q.acesso === 'moderada' ? q.acesso : undefined
  const ordem = q.ordem === 'ativas' ? 'ativas' : 'recentes'
  const { cliente } = obterRede()
  const eu = await quemSou()
  const agora = new Date().toISOString()

  const [lista, todas, minhas, convites] = await Promise.all([
    carregar(() => cliente.comunidades({ tema, acesso, ordem })),
    carregar(() => cliente.comunidades({})),
    eu ? carregar(() => cliente.comunidadesDoRover(eu.uid)) : Promise.resolve(null),
    eu ? carregar(() => cliente.convites(eu.uid)) : Promise.resolve(null),
  ])
  const nConvites = convites?.ok ? convites.valor.length : 0
  const nMinhas = minhas?.ok ? minhas.valor.itens.length : 0
  const temas = todas.ok ? [...new Set(todas.valor.itens.map((c) => c.tema))].sort() : []
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const base = { tema, acesso, ordem: ordem === 'ativas' ? 'ativas' : undefined, ...extra }
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v)
    const s = p.toString()
    return `/${lang}/comunidades${s ? `?${s}` : ''}`
  }
  const filtrando = !!(tema || acesso || ordem !== 'recentes')

  return (
    <>
      <div className="titulo-pag">
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      <SubNavRede lang={lang} atual="comunidades" d={d} />
      <div className="com-barra">
        <nav className="abas-pag" aria-label={t.titulo}>
          <Link href={`/${lang}/comunidades`} aria-current={aba === 'todas' ? 'page' : undefined}>
            {t.abas.todas}
          </Link>
          <Link href={`/${lang}/comunidades?aba=minhas`} aria-current={aba === 'minhas' ? 'page' : undefined}>
            {t.abas.minhas}
            {nMinhas > 0 && <span className="num"> {nMinhas}</span>}
          </Link>
          <Link href={`/${lang}/comunidades?aba=convites`} aria-current={aba === 'convites' ? 'page' : undefined}>
            {t.abas.convites}
            {nConvites > 0 && <span className="selo-num selo-inline" aria-label={String(nConvites)}>{nConvites}</span>}
          </Link>
        </nav>
        {eu && (
          <Link href={`/${lang}/comunidades/nova`} className="btn btn-prim btn-peq">
            {t.criar}
          </Link>
        )}
      </div>

      {aba === 'todas' && (
        <div className="pilha-g">
          {nConvites > 0 && convites?.ok && (
            <Link href={`/${lang}/comunidades?aba=convites`} className="bilhete" style={{ textDecoration: 'none' }}>
              <Emblema nome={convites.valor[0].comunidade.nome} tamanho={52} />
              <div>
                <h2>{plural(t.convitesBilhete, nConvites)}</h2>
                <p>{fmt(t.convite.de, { nome: convites.valor[0].por.nome })}</p>
              </div>
            </Link>
          )}
          <section aria-labelledby="filtros-t" className="com-filtros">
            <h2 id="filtros-t" className="so-leitor">
              {t.filtros.rotulo}
            </h2>
            <div className="com-filtro-grupo" role="group" aria-label={t.filtros.acesso}>
              <Link href={href({ acesso: undefined })} className="chip-filtro" aria-current={!acesso ? 'true' : undefined}>
                {t.filtros.todos}
              </Link>
              <Link href={href({ acesso: 'aberta' })} className="chip-filtro" aria-current={acesso === 'aberta' ? 'true' : undefined}>
                {t.filtros.aberta}
              </Link>
              <Link href={href({ acesso: 'moderada' })} className="chip-filtro" aria-current={acesso === 'moderada' ? 'true' : undefined}>
                {t.filtros.moderada}
              </Link>
            </div>
            <div className="com-filtro-grupo" role="group" aria-label={t.filtros.ordem}>
              <Link href={href({ ordem: undefined })} className="chip-filtro" aria-current={ordem === 'recentes' ? 'true' : undefined}>
                {t.filtros.recentes}
              </Link>
              <Link href={href({ ordem: 'ativas' })} className="chip-filtro" aria-current={ordem === 'ativas' ? 'true' : undefined}>
                {t.filtros.ativas}
              </Link>
            </div>
            {temas.length > 0 && (
              <div className="com-filtro-grupo" role="group" aria-label={t.filtros.tagsTitulo}>
                {temas.map((x) => (
                  <Link key={x} href={href({ tema: tema === x ? undefined : x })} className="chip-filtro" aria-current={tema === x ? 'true' : undefined}>
                    #{x}
                  </Link>
                ))}
              </div>
            )}
            {filtrando && (
              <Link href={`/${lang}/comunidades`} className="miudo com-limpar">
                {t.filtros.limpar}
              </Link>
            )}
          </section>
          {!lista.ok ? (
            <EstadoDeErro codigo={lista.codigo} d={d} lang={lang} />
          ) : lista.valor.itens.length === 0 ? (
            <EstadoVazio titulo={t.listaVazia.titulo} texto={t.listaVazia.texto} ficha={rostoPorUid('rvr_comunidades_vazio_0000')} estado="pensar" />
          ) : (
            <div className="grade-cartoes">
              {lista.valor.itens.map((c) => (
                <CartaoComunidade key={c.id} c={c} d={d} lang={lang} agora={agora} />
              ))}
            </div>
          )}
        </div>
      )}

      {aba === 'minhas' && (
        <section className="pilha" aria-labelledby="minhas-t">
          <div>
            <h2 id="minhas-t">{eu ? fmt(t.minhasTitulo, { nome: eu.nome }) : t.abas.minhas}</h2>
            <p className="suave">{t.minhasTexto}</p>
          </div>
          {!minhas ? (
            <EstadoDeErro codigo="sem-permissao" d={d} lang={lang} />
          ) : !minhas.ok ? (
            <EstadoDeErro codigo={minhas.codigo} d={d} lang={lang} />
          ) : minhas.valor.itens.length === 0 ? (
            <EstadoVazio
              titulo={t.minhasVazio.titulo}
              texto={t.minhasVazio.texto}
              ficha={rostoPorUid('rvr_comunidades_minhas_vazio')}
              acoes={
                <Link href={`/${lang}/comunidades`} className="btn btn-prim">
                  {t.abas.todas}
                </Link>
              }
            />
          ) : (
            <div className="grade-cartoes">
              {minhas.valor.itens.map((x: { comunidade: ComunidadeCartao; papel: 'dono' | 'moderador' | 'membro' }) => (
                <CartaoComunidade key={x.comunidade.id} c={x.comunidade} d={d} lang={lang} agora={agora} papel={x.papel} />
              ))}
            </div>
          )}
        </section>
      )}

      {aba === 'convites' && (
        <section className="pilha" aria-labelledby="convites-t">
          <div>
            <h2 id="convites-t">{t.convitesTitulo}</h2>
            <p className="suave">{t.convitesTexto}</p>
          </div>
          {!convites ? (
            <EstadoDeErro codigo="sem-permissao" d={d} lang={lang} />
          ) : !convites.ok ? (
            <EstadoDeErro codigo={convites.codigo} d={d} lang={lang} />
          ) : convites.valor.length === 0 ? (
            <EstadoVazio titulo={t.convitesVazio.titulo} texto={t.convitesVazio.texto} ficha={rostoPorUid('rvr_comunidades_convite_vazio')} />
          ) : (
            <ul className="pilha">
              {convites.valor.map((cv) => (
                <li key={cv.comunidade.id} className="cartao convite-cartao" style={{ ['--h' as string]: 0 }}>
                  <div className="cc-topo">
                    <Emblema nome={cv.comunidade.nome} tamanho={56} />
                    <span className="cc-nome">
                      <strong>{cv.comunidade.nome}</strong>
                      <span className="miudo">{d.socComum.acessos[cv.comunidade.acesso].nome}</span>
                    </span>
                  </div>
                  {cv.comunidade.descricao && <p className="cc-desc">{cv.comunidade.descricao}</p>}
                  <CartaoRover rover={cv.por} lang={lang} tamanho={36} sub={fmt(t.convite.de, { nome: cv.por.nome })} />
                  <div className="linha-flex">
                    <BotaoAto ato={{ tipo: 'comunidade-adesao', comunidade: cv.comunidade.id, acao: 'aceitar-convite' }} d={d} className="btn btn-prim btn-peq">
                      {t.convite.aceitar}
                    </BotaoAto>
                    <BotaoAto ato={{ tipo: 'comunidade-adesao', comunidade: cv.comunidade.id, acao: 'recusar-convite' }} d={d} className="btn btn-sec btn-peq">
                      {t.convite.recusar}
                    </BotaoAto>
                    <Link href={`/${lang}/comunidades/${cv.comunidade.id}`} className="btn btn-calmo btn-peq">
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
