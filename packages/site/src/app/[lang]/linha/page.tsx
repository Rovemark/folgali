import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import AnunciosDoRele from '@/components/AnunciosDoRele'
import EstadoVazio from '@/components/EstadoVazio'
import { FilaPatches } from '@/components/ListaRovers'
import CartaoComunidadeMini from '@/components/paginas/CartaoComunidadeMini'
import CartaoPagina from '@/components/paginas/CartaoPagina'
import LinhaMista from '@/components/paginas/LinhaMista'
import CartaoPostagem from '@/components/folgali/CartaoPostagem'
import FaixaMomentos from '@/components/folgali/FaixaMomentos'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { momentos, postagensDaFolga } from '@/lib/folgali/demo'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { metaDaRota } from '@/lib/seo/metadata'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return metaDaRota(ehPronto(lang) ? lang : 'pt', 'linha')
}

export default async function Linha({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socLinha
  const { cliente, ponte } = obterRede()
  const [linha, desc, eu, sugCom, sugPag, anuncios] = await Promise.all([
    carregar(() => cliente.linhaMista()),
    carregar(() => cliente.descobrir()),
    ponte.quemSou(),
    carregar(() => cliente.sugestoes('comunidades')),
    carregar(() => cliente.sugestoes('paginas')),
    // 0.3.2: sem o recurso (relé 0.3 e 0.3.1) a lista vem vazia e o cartão nem aparece
    carregar(() => cliente.anuncios()),
  ])
  const agora = new Date().toISOString()
  const demonstracao = cliente.modo === 'falso' || process.env.ROVER_NETWORK_DEMONSTRACAO !== 'nao'
  const hoje = new Date(agora)
  const daFolga = demonstracao ? postagensDaFolga(hoje) : []
  const recem = desc.ok ? desc.valor.recemChegados : []
  const com = sugCom.ok ? sugCom.valor.slice(0, 2) : []
  const pag = sugPag.ok ? sugPag.valor.slice(0, 2) : []
  const sugestoes =
    com.length + pag.length > 0 ? (
      <aside className="sug-linha" aria-labelledby="sug-linha-t">
        <h2 id="sug-linha-t" className="sobrelinha">
          {t.sugestoesTitulo}
        </h2>
        <p className="miudo">{t.sugestoesTexto}</p>
        <ul className="sug-linha-lista">
          {com.map((c) => (
            <li key={c.id}>
              <CartaoComunidadeMini c={c} d={d} lang={lang} agora={agora} />
            </li>
          ))}
          {pag.map((p) => (
            <li key={p.id}>
              <CartaoPagina p={p} d={d} lang={lang} agora={agora} compacto />
            </li>
          ))}
        </ul>
        <p className="sug-linha-links">
          <Link href={`/${lang}/comunidades`}>{t.verComunidades}</Link>
          <Link href={`/${lang}/paginas`}>{t.verPaginas}</Link>
        </p>
      </aside>
    ) : null

  return (
    <div className="feed">
      <h1 className="so-leitor">{d.socFolgali.feed.titulo}</h1>
      {demonstracao && <FaixaMomentos itens={momentos(hoje)} d={d} lang={lang} />}

      {daFolga.map((p, i) => (
        <CartaoPostagem key={p.id} p={p} d={d} lang={lang} agora={hoje} prioridade={i === 0} tardia={i >= 2} />
      ))}

      {anuncios.ok && <AnunciosDoRele itens={anuncios.valor.itens.slice(0, 2)} d={d} agora={agora} />}

      {recem.length > 0 && (
        <section className="caixa caixa-pad" aria-labelledby="chegaram-t">
          <h2 id="chegaram-t" className="lat-titulo">
            {d.linha.chegaram}
          </h2>
          <FilaPatches rovers={recem} lang={lang} rotulo={d.linha.chegaramNome} />
        </section>
      )}

      {daFolga.length > 0 && <h2 className="feed-sep">{d.socFolgali.feed.maisNaLinha}</h2>}
      {!linha.ok && <EstadoDeErro codigo={linha.codigo} d={d} lang={lang} semVoltar />}
      {linha.ok &&
        (linha.valor.itens.length > 0 ? (
          <LinhaMista inicial={linha.valor} d={d} lang={lang} agora={agora} meuUid={eu?.uid} sugestoes={sugestoes} />
        ) : (
          <EstadoVazio
            titulo={d.linha.vazioTitulo}
            texto={d.linha.vazioTexto}
            ficha={rostoPorUid('rvr_linha_vazia_00000000')}
            acoes={
              <>
                <Link href={`/${lang}/descobrir`} className="btn btn-prim">
                  {t.irDescobrir}
                </Link>
                <Link href={`/${lang}/paginas`} className="btn btn-sec">
                  {t.verPaginas}
                </Link>
              </>
            }
          />
        ))}
      <p className="feed-nota">{d.socFolgali.feed.sozinhos}</p>
    </div>
  )
}
