import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ListaRovers } from '@/components/ListaRovers'
import CartaoComunidadeMini from '@/components/paginas/CartaoComunidadeMini'
import CartaoPagina from '@/components/paginas/CartaoPagina'
import CartaoTopicoMini from '@/components/paginas/CartaoTopicoMini'
import Retrato from '@/components/Retrato'
import { IcEstrela, IcMod, IcTendencia } from '@/components/social/IconesSociais'
import { dict, ehPronto, fmt, plural, tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import type { Janela, Tendencia } from '@/lib/social/tipos'
import { metaDaRota } from '@/lib/seo/metadata'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ janela?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaDaRota(ehPronto(lang) ? lang : 'pt', 'descobrir')
}

/** Um corpo de letra por faixa de autores: a nuvem mostra o que mais gente usou sem número solto. */
const faixa = (t: Tendencia, max: number) => (t.autores >= max ? 3 : t.autores * 2 >= max ? 2 : 1)

export default async function Descobrir({ params, searchParams }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const sp = await searchParams
  const janela: Janela = sp.janela === '7d' ? '7d' : '24h'
  const d = dict(lang)
  const t = d.socDescobrir
  const { cliente, ponte } = obterRede()
  const agora = new Date().toISOString()
  const eu = await ponte.quemSou()
  const perfil = eu ? await carregar(() => cliente.paginaDoRover(eu.handle)) : null
  const interesses = perfil?.ok ? perfil.valor.rover.interesses : []
  const [tend, topicos, comunidades, paginas, recem, sugCom, sugPag, sugRov, rovers] = await Promise.all([
    carregar(() => cliente.tendencias(janela)),
    carregar(() => cliente.emAlta('topicos', janela)),
    carregar(() => cliente.emAlta('comunidades', janela)),
    carregar(() => cliente.emAlta('paginas', janela)),
    carregar(() => cliente.recemChegadosSociais(10)),
    carregar(() => cliente.sugestoes('comunidades', interesses)),
    carregar(() => cliente.sugestoes('paginas', interesses)),
    carregar(() => cliente.sugestoes('rovers', interesses)),
    carregar(() => cliente.descobrir()),
  ])
  const tudoFora = [tend, topicos, comunidades, paginas, recem].every((x) => !x.ok)
  const tendOk = tend.ok ? tend.valor : []
  const maxAutores = Math.max(1, ...tendOk.map((x) => x.autores))
  const base = `/${lang}/descobrir`

  return (
    <>
      <div className="titulo-pag">
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>

      <div className="janela" role="group" aria-label={t.janela.rotulo}>
        {(['24h', '7d'] as const).map((j) => (
          <Link key={j} href={j === '24h' ? base : `${base}?janela=7d`} className="chip-filtro" aria-current={janela === j ? 'true' : undefined}>
            {t.janela[j]}
          </Link>
        ))}
      </div>

      {tudoFora && (
        <p className="erro-campo" role="alert">
          {d.socComum.erros['fora-do-ar'].texto}
        </p>
      )}

      <div className="vitrine">
        {/* 1. tendências: a nuvem de tags */}
        <section className="vit-tags" aria-labelledby="v-tend">
          <h2 id="v-tend">
            <IcTendencia width={22} height={22} /> {t.tendencias.titulo}
          </h2>
          <p className="suave">{t.tendencias.sub}</p>
          {tendOk.length > 0 ? (
            <ul className="nuvem-tags">
              {tendOk.map((x) => (
                <li key={x.tag}>
                  <Link href={`/${lang}/buscar?q=${encodeURIComponent('#' + x.tag)}`} className={`tag-chip f${faixa(x, maxAutores)}`} title={plural(t.tendencias.autores, x.autores)}>
                    #{x.tag}
                    <span className="tag-chip-n">{x.autores}</span>
                    <span className="so-leitor"> {plural(t.tendencias.autores, x.autores)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="miudo">{t.tendencias.vazio}</p>
          )}
        </section>

        {/* 2. tópicos em alta: uma lista numerada, sem cartão por item */}
        <section className="vit-topicos" aria-labelledby="v-top">
          <h2 id="v-top">{t.topicos.titulo}</h2>
          <p className="suave">{t.topicos.sub}</p>
          {topicos.ok && topicos.valor.length > 0 ? (
            <ol className="rol-topicos">
              {topicos.valor.slice(0, 6).map((x, i) => (
                <li key={x.id}>
                  <CartaoTopicoMini t={x} d={d} lang={lang} agora={agora} posicao={i + 1} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="miudo">{t.topicos.vazio}</p>
          )}
        </section>

        {/* 3. comunidades: uma prateleira que rola de lado */}
        <section className="vit-prateleira" aria-labelledby="v-com">
          <div className="cabeca-secao">
            <h2 id="v-com">{t.comunidades.titulo}</h2>
            <Link href={`/${lang}/comunidades`}>{t.comunidades.todas}</Link>
          </div>
          {comunidades.ok && comunidades.valor.length > 0 ? (
            <ul className="prateleira" aria-label={t.comunidades.titulo}>
              {comunidades.valor.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <CartaoComunidadeMini c={c} d={d} lang={lang} agora={agora} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="miudo">{t.comunidades.vazio}</p>
          )}
        </section>

        {/* 4. páginas em alta: etiquetas compactas lado a lado */}
        <section aria-labelledby="v-pag">
          <div className="cabeca-secao">
            <h2 id="v-pag">{t.paginas.titulo}</h2>
            <Link href={`/${lang}/paginas`}>{t.paginas.todas}</Link>
          </div>
          {paginas.ok && paginas.valor.length > 0 ? (
            <ul className="grade-etiquetas">
              {paginas.valor.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <CartaoPagina p={p} d={d} lang={lang} agora={agora} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="miudo">{t.paginas.vazio}</p>
          )}
        </section>

        {/* 5. recém-chegados */}
        {recem.ok && recem.valor.length > 0 && (
          <section aria-labelledby="v-rec">
            <h2 id="v-rec">{t.recem.titulo}</h2>
            <p className="suave">{t.recem.sub}</p>
            <ul className="fila-patches recem" aria-label={t.recem.titulo}>
              {recem.valor.map((r) => (
                <li key={r.uid}>
                  <Link href={`/${lang}/r/${r.handle}`} className="patch-item">
                    <Retrato ficha={r.rosto} nome={r.nome} tamanho={60} decorativo />
                    <span>{r.nome}</span>
                    <small>{tempoRelativo(r.desde, d, new Date(agora))}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 6. sugestões, só do que a pessoa declarou */}
        <Sugestoes d={d} lang={lang} agora={agora} interesses={interesses} com={sugCom} pag={sugPag} rov={sugRov} euUid={eu?.uid} />

        {rovers.ok && rovers.valor.emAlta.length > 0 && (
          <section className="bloco" aria-labelledby="v-rov">
            <div>
              <h2 id="v-rov">{d.descobrir.emAlta}</h2>
              <p className="miudo">{d.descobrir.pontos}</p>
            </div>
            <ListaRovers rovers={rovers.valor.emAlta} lang={lang} d={d} meuUid={eu?.uid} />
          </section>
        )}

        <p className="rodape-descobrir">
          <IcMod width={18} height={18} />{' '}
          <Link href={`/${lang}/moderacao`}>{t.registro}</Link>
        </p>
      </div>
    </>
  )
}

type Carg<T> = Awaited<ReturnType<typeof carregar<T>>>

function Sugestoes({ d, lang, agora, interesses, com, pag, rov, euUid }: { d: Dicionario; lang: Pronto; agora: string; interesses: string[]; com: Carg<import('@/lib/social/tipos').ComunidadeCartao[]>; pag: Carg<import('@/lib/social/tipos').PaginaCartao[]>; rov: Carg<import('@/lib/social/tipos').RoverBuscado[]>; euUid?: string | null }) {
  const t = d.socDescobrir.sugestoes
  const temAlgo = (com.ok && com.valor.length > 0) || (pag.ok && pag.valor.length > 0) || (rov.ok && rov.valor.length > 0)
  if (!temAlgo) return null
  return (
    <section className="vit-sugestoes" aria-labelledby="v-sug">
      <div className="vit-sug-cab">
        <h2 id="v-sug">
          <IcEstrela width={22} height={22} /> {t.titulo}
        </h2>
        <p className="suave">{interesses.length > 0 ? fmt(t.declarados, { n: interesses.length }) : t.semInteresses}</p>
        {interesses.length > 0 && (
          <ul className="etiquetas" aria-label={t.titulo}>
            {interesses.map((i) => (
              <li key={i} className="etiqueta">
                {i}
              </li>
            ))}
          </ul>
        )}
        <p className="nota-proposta">{t.nota}</p>
      </div>
      <div className="vit-sug-colunas">
        {com.ok && com.valor.length > 0 && (
          <div>
            <h3>{t.comunidades}</h3>
            <ul className="pilha">
              {com.valor.slice(0, 3).map((c) => (
                <li key={c.id}>
                  <CartaoComunidadeMini c={c} d={d} lang={lang} agora={agora} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {pag.ok && pag.valor.length > 0 && (
          <div>
            <h3>{t.paginas}</h3>
            <ul className="pilha">
              {pag.valor.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <CartaoPagina p={p} d={d} lang={lang} agora={agora} compacto />
                </li>
              ))}
            </ul>
          </div>
        )}
        {rov.ok && rov.valor.length > 0 && (
          <div>
            <h3>{t.rovers}</h3>
            <ul className="lista-rovers">
              {rov.valor.slice(0, 4).map((r) => (
                <li key={r.uid} style={{ gridTemplateColumns: 'auto 1fr' }}>
                  <Link href={`/${lang}/r/${r.handle}`} aria-label={d.perfil.ir.replace('{nome}', r.nome)}>
                    <Retrato ficha={r.rosto} nome={r.nome} tamanho={44} decorativo />
                  </Link>
                  <Link href={`/${lang}/r/${r.handle}`} className="quem">
                    <strong>{r.nome}</strong>
                    <span><bdi dir="ltr">@{r.handle}</bdi></span>
                  </Link>
                </li>
              ))}
            </ul>
            {euUid && null}
          </div>
        )}
      </div>
    </section>
  )
}
