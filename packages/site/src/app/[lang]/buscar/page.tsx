import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import { ListaRovers } from '@/components/ListaRovers'
import CartaoComunidadeMini from '@/components/paginas/CartaoComunidadeMini'
import CartaoPagina from '@/components/paginas/CartaoPagina'
import CartaoTopicoMini from '@/components/paginas/CartaoTopicoMini'
import ListaBusca from '@/components/paginas/ListaBusca'
import ResultadoRover from '@/components/paginas/ResultadoRover'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { janelaDaOrdem, ordemDaBusca } from '@/lib/dominio/ordem'
import { dict, ehPronto, fmt, plural, type Dicionario, type Pronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { normalizarBusca } from '@/lib/social/termo'
import type { TipoDeBusca } from '@/lib/social/tipos'
import { metaDaRota } from '@/lib/seo/metadata'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ q?: string | string[]; tipo?: string; ordem?: string; janela?: string }> }

const TIPOS: readonly TipoDeBusca[] = ['rovers', 'comunidades', 'topicos', 'paginas']

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaDaRota(ehPronto(lang) ? lang : 'pt', 'buscar')
}

export default async function Buscar({ params, searchParams }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const sp = await searchParams
  const bruto = Array.isArray(sp.q) ? sp.q[0] : sp.q
  const d = dict(lang)
  const t = d.socBusca
  const b = normalizarBusca(bruto)
  const tipo = (TIPOS as readonly string[]).includes(sp.tipo ?? '') ? (sp.tipo as TipoDeBusca) : null
  const { cliente, ponte } = obterRede()
  const agora = new Date().toISOString()
  const eu = await ponte.quemSou()
  const tem = b.termo !== ''
  const hrefTipo = (x: TipoDeBusca | null) => `/${lang}/buscar?q=${encodeURIComponent(bruto ?? '')}${x ? `&tipo=${x}` : ''}`
  // 0.3.2: a busca de tópicos pode ser ordenada por tempo ou por pessoas distintas, se o relé declara o recurso
  const porPessoas = tem && tipo === 'topicos' ? await cliente.suporta('ordem-por-pessoas') : false
  const ordem = ordemDaBusca(sp.ordem, porPessoas)
  const janela = janelaDaOrdem(ordem, sp.janela)
  const hrefOrdem = (o: string, j?: string) => `${hrefTipo('topicos')}${o === 'relevancia' ? '' : `&ordem=${o}`}${j ? `&janela=${j}` : ''}`

  // o que vai aparecer
  const [tudo, lista, ajuda] = await Promise.all([
    tem && !tipo ? carregar(() => cliente.buscarTudo(b.termo)) : null,
    tem && tipo ? carregar(() => (tipo === 'topicos' ? cliente.buscarTipo(b.termo, 'topicos', undefined, { ordem, janela }) : cliente.buscarTipo(b.termo, tipo))) : null,
    !tem ? Promise.all([carregar(() => cliente.tendencias('7d')), carregar(() => cliente.descobrir())]) : null,
  ])

  return (
    <>
      <div className="titulo-pag">
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      <form className="busca" role="search" action={`/${lang}/buscar`} method="get">
        <label className="so-leitor" htmlFor="q">
          {t.rotulo}
        </label>
        <input id="q" name="q" type="search" inputMode="search" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={100} placeholder={t.placeholder} defaultValue={bruto ?? ''} />
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <button className="btn btn-prim" type="submit">
          {t.botao}
        </button>
      </form>

      {tem && (
        <nav className="sub-nav" aria-label={t.abasRotulo}>
          <Link href={hrefTipo(null)} aria-current={!tipo ? 'page' : undefined}>
            {t.abas.tudo}
          </Link>
          {TIPOS.map((x) => (
            <Link key={x} href={hrefTipo(x)} aria-current={tipo === x ? 'page' : undefined}>
              {t.abas[x]}
            </Link>
          ))}
        </nav>
      )}

      {porPessoas && (
        <>
          <nav className="sub-nav" aria-label={t.ordem.rotulo}>
            <Link href={hrefOrdem('relevancia')} aria-current={ordem === 'relevancia' ? 'page' : undefined}>
              {t.ordem.relevancia}
            </Link>
            <Link href={hrefOrdem('recentes')} aria-current={ordem === 'recentes' ? 'page' : undefined}>
              {t.ordem.recentes}
            </Link>
            <Link href={hrefOrdem('melhores')} aria-current={ordem === 'melhores' ? 'page' : undefined}>
              {t.ordem.melhores}
            </Link>
            <Link href={hrefOrdem('em-alta')} aria-current={ordem === 'em-alta' ? 'page' : undefined}>
              {t.ordem.emAlta}
            </Link>
          </nav>
          {(ordem === 'melhores' || ordem === 'em-alta') && <p className="miudo ordem-nota">{t.ordem.nota}</p>}
          {ordem === 'em-alta' && (
            <div className="com-filtro-grupo" role="group" aria-label={d.socForum.lista.janelaRotulo}>
              <Link href={hrefOrdem('em-alta')} className="chip-filtro" aria-current={!janela ? 'true' : undefined}>
                {d.socForum.lista.janelas['24h']}
              </Link>
              <Link href={hrefOrdem('em-alta', '7d')} className="chip-filtro" aria-current={janela === '7d' ? 'true' : undefined}>
                {d.socForum.lista.janelas['7d']}
              </Link>
            </div>
          )}
        </>
      )}

      {b.tag && tem && (
        <p className="busca-tag" role="note">
          {fmt(t.tag, { tag: b.tag })}
        </p>
      )}

      {b.curto && (
        <EstadoVazio titulo={t.curto.titulo} texto={t.curto.texto} ficha={rostoPorUid('rvr_busca_termo_curto_0000')} estado="pensar" />
      )}

      {!tem && !b.curto && ajuda && <Inicio d={d} lang={lang} ajuda={ajuda} euUid={eu?.uid} />}

      {tudo && !tudo.ok && <EstadoDeErro codigo={tudo.codigo} d={d} lang={lang} semVoltar />}
      {tudo?.ok && <ResultadosTudo r={tudo.valor} d={d} lang={lang} agora={agora} termo={b.termo} tag={!!b.tag} hrefTipo={hrefTipo} />}

      {lista && !lista.ok && <EstadoDeErro codigo={lista.codigo} d={d} lang={lang} semVoltar />}
      {lista?.ok &&
        tipo &&
        (lista.valor.itens.length > 0 ? (
          <section aria-live="polite" aria-labelledby="res-t">
            <p id="res-t" className="sobrelinha" style={{ marginBottom: 12 }}>
              {t.abas[tipo]}
            </p>
            <ListaBusca key={`${b.termo}-${tipo}-${ordem}-${janela ?? ''}`} tipo={tipo} inicial={lista.valor as never} termo={b.termo} d={d} lang={lang} agora={agora} opcoes={tipo === 'topicos' && ordem !== 'relevancia' ? { ordem, ...(janela ? { janela } : {}) } : undefined} />
          </section>
        ) : (
          <SemResultado d={d} lang={lang} termo={b.termo} />
        ))}
    </>
  )
}

function SemResultado({ d, lang, termo }: { d: Dicionario; lang: Pronto; termo: string }) {
  const t = d.socBusca
  return (
    <EstadoVazio
      titulo={t.vazio.titulo}
      texto={fmt(t.vazio.texto, { termo })}
      ficha={rostoPorUid('rvr_busca_sem_resultado_00')}
      estado="pensar"
      acoes={
        <>
          <Link href={`/${lang}/descobrir`} className="btn btn-prim">
            {t.vazio.descobrir}
          </Link>
          <Link href={`/${lang}/comunidades`} className="btn btn-sec">
            {t.vazio.comunidades}
          </Link>
        </>
      }
    />
  )
}

type Tudo = { rovers: import('@/lib/social/tipos').RoverBuscado[]; comunidades: import('@/lib/social/tipos').ComunidadeCartao[]; topicos: import('@/lib/social/tipos').TopicoCartao[]; paginas: import('@/lib/social/tipos').PaginaCartao[] }

function ResultadosTudo({ r, d, lang, agora, termo, tag, hrefTipo }: { r: Tudo; d: Dicionario; lang: Pronto; agora: string; termo: string; tag: boolean; hrefTipo: (t: TipoDeBusca) => string }) {
  const t = d.socBusca
  const total = r.rovers.length + r.comunidades.length + r.topicos.length + r.paginas.length
  if (total === 0) return <SemResultado d={d} lang={lang} termo={termo} />
  const ordem: TipoDeBusca[] = tag ? ['topicos', 'paginas', 'comunidades', 'rovers'] : ['rovers', 'comunidades', 'topicos', 'paginas']
  return (
    <div className="pilha-g" aria-live="polite">
      {ordem.map((tp) => {
        const itens = r[tp]
        if (itens.length === 0) return null
        return (
          <section key={tp} aria-labelledby={`sec-${tp}`} className="busca-secao">
            <div className="cabeca-secao">
              <h2 id={`sec-${tp}`}>{plural(t.secao[tp], itens.length)}</h2>
              {itens.length >= 5 && <Link href={hrefTipo(tp)}>{t.verTodos}</Link>}
            </div>
            {tp === 'paginas' ? (
              <ul className="grade-etiquetas">
                {r.paginas.map((x) => (
                  <li key={x.id}>
                    <CartaoPagina p={x} d={d} lang={lang} agora={agora} termo={termo} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="resultados">
                {tp === 'rovers' && r.rovers.map((x) => <li key={x.uid}><ResultadoRover r={x} lang={lang} termo={termo} /></li>)}
                {tp === 'comunidades' && r.comunidades.map((x) => <li key={x.id}><CartaoComunidadeMini c={x} d={d} lang={lang} agora={agora} termo={termo} /></li>)}
                {tp === 'topicos' && r.topicos.map((x) => <li key={x.id}><CartaoTopicoMini t={x} d={d} lang={lang} agora={agora} termo={termo} /></li>)}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Inicio({ d, lang, ajuda, euUid }: { d: Dicionario; lang: Pronto; ajuda: [Awaited<ReturnType<typeof carregar<import('@/lib/social/tipos').Tendencia[]>>>, Awaited<ReturnType<typeof carregar<import('@/lib/tipos').Descoberta>>>]; euUid?: string | null }) {
  const t = d.socBusca
  const [tend, desc] = ajuda
  return (
    <div className="pilha-g">
      {tend.ok && tend.valor.length > 0 && (
        <section aria-labelledby="inicio-tags">
          <h2 id="inicio-tags" className="sobrelinha" style={{ marginBottom: 10 }}>
            {t.inicio.tags}
          </h2>
          <ul className="nuvem-tags">
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
      <section className="bloco">
        <h2>{t.inicio.dicas}</h2>
        <ul className="dicas-busca">
          {t.inicio.lista.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
      {desc.ok && desc.valor.emAlta.length > 0 && (
        <section className="bloco">
          <h2>{t.inicio.rovers}</h2>
          <ListaRovers rovers={desc.valor.emAlta.slice(0, 4)} lang={lang} d={d} meuUid={euUid} />
        </section>
      )}
    </div>
  )
}
