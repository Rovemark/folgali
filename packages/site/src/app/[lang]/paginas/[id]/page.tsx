import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import { IcSeta } from '@/components/Icones'
import BotaoSeguirPagina from '@/components/paginas/BotaoSeguirPagina'
import GerirPagina from '@/components/paginas/GerirPagina'
import ListaAtualizacoes from '@/components/paginas/ListaAtualizacoes'
import ListaSeguidores from '@/components/paginas/ListaSeguidores'
import Retrato from '@/components/Retrato'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import Emblema from '@/components/social/Emblema'
import FormProposta from '@/components/social/FormProposta'
import { IcEditar, IcEtiqueta } from '@/components/social/IconesSociais'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { ehIdObjeto } from '@/lib/dominio/ids'
import { podeNaPagina } from '@/lib/dominio/permissoes'
import { dataCurta, dict, ehPronto, plural } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar, tipoDeEstado } from '@/lib/social/carregar'
import { matizDe } from '@/lib/social/matiz'
import { juntarPaginas } from '@/lib/social/todas'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ aba?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  if (!ehPronto(lang) || !ehIdObjeto(id)) return { title: 'folgali' }
  const r = await carregar(() => obterRede().cliente.pagina(id))
  return metaTela(lang, `/paginas/${id}`, r.ok ? r.valor.nome : dict(lang).socPaginas.titulo, r.ok ? r.valor.descricao : undefined)
}

export default async function PaginaDeProjeto({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang) || !ehIdObjeto(id)) notFound()
  const { aba: abaPedida } = await searchParams
  const d = dict(lang)
  const t = d.socPaginas
  const { cliente, ponte } = obterRede()
  const [r, eu] = await Promise.all([carregar(() => cliente.pagina(id)), ponte.quemSou()])
  if (!r.ok) {
    if (tipoDeEstado(r.codigo) === 'nao-existe') notFound()
    return <EstadoDeErro codigo={r.codigo} d={d} lang={lang} />
  }
  // o dono é administrador por definição (4.19 da especificação); a tela não o repete na lista nem deixa tirá-lo
  const p = { ...r.valor, administradores: r.valor.administradores.filter((a) => a.uid !== r.valor.dono.uid) }
  const papel = p.voce?.papel ?? null
  const segue = p.voce?.segue ?? false
  const podePublicar = podeNaPagina('publicar', papel).ok
  const aba = abaPedida === 'seguidores' ? 'seguidores' : abaPedida === 'gerir' ? 'gerir' : 'atualizacoes'
  const agora = new Date().toISOString()
  const base = `/${lang}/paginas/${p.id}`
  const hue = matizDe(p.nome)

  // só carrega o que a aba mostra
  const atuR = aba === 'atualizacoes' ? await carregar(() => cliente.atualizacoes(p.id)) : null
  const segR = aba === 'seguidores' ? await carregar(() => cliente.seguidoresDaPagina(p.id)) : null
  let candidatos: import('@/lib/tipos').ResumoRover[] = []
  if (aba === 'gerir' && papel && eu) {
    const am = await carregar(() => juntarPaginas((c) => cliente.amigos(eu.uid, c)))
    const ja = new Set([p.dono.uid, ...p.administradores.map((a) => a.uid)])
    candidatos = am.ok ? am.valor.map((x) => x.rover).filter((x) => !ja.has(x.uid)) : []
  }

  return (
    <>
      <Link href={`/${lang}/paginas`} className="voltar">
        <IcSeta width={20} height={20} /> {t.titulo}
      </Link>

      <section className="pg-capa" style={{ ['--h' as string]: hue }} aria-labelledby="pg-nome">
        <div className="pg-capa-topo">
          <Emblema nome={p.nome} forma="etiqueta" tamanho={84} />
          <div className="pg-capa-nome">
            <span className="sobrelinha">{t.pagina.tipo}</span>
            <h1 id="pg-nome">{p.nome}</h1>
            <span className="tema-chip">#{p.tema}</span>
          </div>
        </div>
        {p.descricao && <p className="pg-desc">{p.descricao}</p>}
        <dl className="pg-meta">
          <div>
            <dt>{t.pagina.dono}</dt>
            <dd>
              <Link href={`/${lang}/r/${p.dono.handle}`} className="pg-pessoa">
                <Retrato ficha={p.dono.rosto} nome={p.dono.nome} tamanho={28} decorativo />
                <span>{p.dono.nome}</span>
              </Link>
            </dd>
          </div>
          {p.administradores.length > 0 && (
            <div>
              <dt>{t.pagina.administradores}</dt>
              <dd className="pg-admins">
                {p.administradores.map((a) => (
                  <Link key={a.uid} href={`/${lang}/r/${a.handle}`} className="pg-pessoa">
                    <Retrato ficha={a.rosto} nome={a.nome} tamanho={28} decorativo />
                    <span>{a.nome}</span>
                  </Link>
                ))}
              </dd>
            </div>
          )}
          <div>
            <dt>{t.pagina.seguidoresRotulo}</dt>
            <dd className="numero">{plural(t.cartao.seguidores, p.seguidores)}</dd>
          </div>
          <div>
            <dt>{t.pagina.desde}</dt>
            <dd>{dataCurta(p.criadaEm, lang)}</dd>
          </div>
        </dl>
        <div className="pg-acoes">
          {papel && (
            <span className="pilula" data-tom="acao">
              <IcEtiqueta /> {papel === 'dono' ? t.pagina.voceDono : t.pagina.voceAdmin}
            </span>
          )}
          {eu && !papel && <BotaoSeguirPagina pagina={p.id} segue={segue} d={d} />}
        </div>
      </section>

      <nav className="sub-nav" aria-label={t.pagina.abasRotulo}>
        <Link href={base} aria-current={aba === 'atualizacoes' ? 'page' : undefined}>
          {t.pagina.atualizacoes}
        </Link>
        <Link href={`${base}?aba=seguidores`} aria-current={aba === 'seguidores' ? 'page' : undefined}>
          {t.pagina.seguidoresAba}
        </Link>
        {papel && (
          <Link href={`${base}?aba=gerir`} aria-current={aba === 'gerir' ? 'page' : undefined}>
            <IcEditar width={18} height={18} /> {t.pagina.gerirAba}
          </Link>
        )}
      </nav>

      {aba === 'atualizacoes' && (
        <div className="pilha">
          {podePublicar && (
            <details className="pg-publicar cartao" open={false}>
              <summary>
                <IcEditar width={22} height={22} /> {t.pagina.publicarAbrir}
              </summary>
              <FormProposta
                tipo="pagina-publicar"
                d={d}
                lang={lang}
                campos={{ pagina: p.id, titulo: '', texto: '', tags: [] }}
                destino={{ rotulo: p.nome, href: base }}
                podeEscrever={eu !== null}
                nomeDoRover={eu?.nome}
                enviar={t.pagina.publicarEnviar}
                placeholder={t.pagina.publicarPlaceholder}
              />
            </details>
          )}
          {atuR && !atuR.ok && <EstadoDeErro codigo={atuR.codigo} d={d} lang={lang} semVoltar />}
          {atuR?.ok &&
            (atuR.valor.itens.length > 0 ? (
              <ListaAtualizacoes inicial={atuR.valor} pagina={p.id} d={d} lang={lang} agora={agora} meuUid={eu?.uid} souDonoDaPagina={papel === 'dono'} nomeDaPagina={p.nome} />
            ) : (
              <EstadoVazio
                titulo={podePublicar ? t.pagina.vazioAtuDono.titulo : t.pagina.vazioAtu.titulo}
                texto={podePublicar ? t.pagina.vazioAtuDono.texto : t.pagina.vazioAtu.texto}
                ficha={rostoPorUid(`rvr_pagina_${p.id.slice(3, 20)}`)}
                estado="dormir"
              />
            ))}
        </div>
      )}

      {aba === 'seguidores' && (
        <div className="pilha">
          <p className="nota-proposta">{t.pagina.seguidoresNota}</p>
          {segR && !segR.ok && <EstadoDeErro codigo={segR.codigo} d={d} lang={lang} semVoltar />}
          {segR?.ok &&
            (segR.valor.itens.length > 0 ? (
              <ListaSeguidores inicial={segR.valor} pagina={p.id} d={d} lang={lang} />
            ) : (
              <EstadoVazio titulo={t.pagina.seguidoresVazio.titulo} texto={t.pagina.seguidoresVazio.texto} ficha={rostoPorUid('rvr_pagina_sem_seguidores_0')} estado="pensar" />
            ))}
        </div>
      )}

      {aba === 'gerir' &&
        (papel ? (
          <GerirPagina p={p} d={d} lang={lang} papel={papel} candidatos={candidatos} podeEscrever={eu !== null} nomeDoRover={eu?.nome} />
        ) : (
          <EstadoDeErro codigo="sem-permissao" d={d} lang={lang} semVoltar />
        ))}
    </>
  )
}
