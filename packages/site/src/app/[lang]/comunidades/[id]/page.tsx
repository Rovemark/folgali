import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import { AvisoDeBanimento, AvisoDeConvite } from '@/components/comunidades/AvisoDaComunidade'
import CabecalhoComunidade from '@/components/comunidades/CabecalhoComunidade'
import CartaoTopico from '@/components/comunidades/CartaoTopico'
import { ChipDeEtiqueta, ChipDeStatus } from '@/components/comunidades/Marcas'
import { TopicosMais } from '@/components/comunidades/ListasMais'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { ehCompleta, ID_OK, lerComunidade, quemDe, quemSou } from '@/lib/comunidades/dados'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { janelaDaOrdem, ordemDosTopicos } from '@/lib/dominio/ordem'
import { podeNaComunidade } from '@/lib/dominio/permissoes'
import { statusParaFiltro } from '@/lib/dominio/vocabulario'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ ordem?: string; categoria?: string; tag?: string; janela?: string; status?: string; etiqueta?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  const c = ID_OK.test(id) ? await lerComunidade(id) : null
  const d = dict(ehPronto(lang) ? lang : 'pt')
  return metaTela(lang, `/comunidades/${id}`, c?.ok ? c.valor.nome : d.socComunidades.titulo, c?.ok ? c.valor.descricao : undefined)
}

export default async function ComunidadePagina({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const q = await searchParams
  const d = dict(lang)
  const t = d.socForum.lista
  const c = ID_OK.test(id) ? await lerComunidade(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <EstadoDeErro codigo={c.codigo} d={d} lang={lang} />
  const com = c.valor
  const agora = new Date().toISOString()
  const eu = await quemSou()

  if (!ehCompleta(com)) {
    return (
      <>
        <CabecalhoComunidade c={com} d={d} lang={lang} />
        <AvisoDeConvite d={d} />
      </>
    )
  }

  // 0.3.2: as ordens por pessoas só são oferecidas se o relé declara o recurso; o vocabulário vem na própria comunidade (relé 0.3 e 0.3.1 não o mandam)
  const porPessoas = await obterRede().cliente.suporta('ordem-por-pessoas')
  const ordem = ordemDosTopicos(q.ordem, porPessoas)
  const janela = janelaDaOrdem(ordem, q.janela)
  const categoria = q.categoria && com.categorias.includes(q.categoria) ? q.categoria : undefined
  const tag = q.tag && /^[a-z0-9][a-z0-9-]{1,23}$/.test(q.tag) ? q.tag : undefined
  const voc = com.vocabulario
  const status = voc?.status.find((s) => s.chave === q.status)?.chave
  const etiqueta = voc?.etiquetas.find((e) => e.chave === q.etiqueta)?.chave
  const [lista, registro] = await Promise.all([
    carregar(() => obterRede().cliente.topicos(id, { ordem, categoria, tag, janela, status, etiqueta })),
    // relé 0.3: a data do banimento sai do registro público; relé 0.3.1 já a manda em `voce.banidoEm` e a chamada nem sai
    com.voce?.banido && eu && !com.voce.banidoEm ? carregar(() => obterRede().cliente.registroDaComunidade(id)) : Promise.resolve(null),
  ])
  const banidoEm = com.voce?.banidoEm ?? (registro?.ok ? (registro.valor.itens.find((r) => r.acao === 'banimento' && typeof r.alvo === 'object' && r.alvo.uid === eu?.uid)?.em ?? null) : null)
  const quem = quemDe(com.voce)
  const podeAbrir = podeNaComunidade('postar-topico', quem, com.acesso).ok
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const base = { ordem: ordem === 'recentes' ? undefined : ordem, janela, categoria, tag, status, etiqueta, ...extra }
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v)
    const s = p.toString()
    return `/${lang}/comunidades/${id}${s ? `?${s}` : ''}`
  }

  return (
    <>
      <CabecalhoComunidade c={com} d={d} lang={lang} aba="conversas" />
      {com.voce?.banido && <AvisoDeBanimento id={id} d={d} lang={lang} banidoEm={banidoEm} agora={agora} />}
      <section className="pilha" aria-labelledby="conversas-t">
        <div className="cabeca-secao">
          <h2 id="conversas-t">{t.titulo}</h2>
          {podeAbrir && (
            <Link href={`/${lang}/comunidades/${id}/novo`} className="btn btn-prim btn-peq">
              {t.novo}
            </Link>
          )}
        </div>
        <nav className="sub-nav" aria-label={t.abasRotulo}>
          <Link href={href({ ordem: undefined })} aria-current={ordem === 'recentes' ? 'page' : undefined}>
            {t.abas.recentes}
          </Link>
          <Link href={href({ ordem: 'ativos' })} aria-current={ordem === 'ativos' ? 'page' : undefined}>
            {t.abas.ativos}
          </Link>
          <Link href={href({ ordem: 'sem-resposta' })} aria-current={ordem === 'sem-resposta' ? 'page' : undefined}>
            {t.abas.semResposta}
          </Link>
          {porPessoas && (
            <>
              <Link href={href({ ordem: 'melhores', janela: undefined })} aria-current={ordem === 'melhores' ? 'page' : undefined}>
                {t.abas.melhores}
              </Link>
              <Link href={href({ ordem: 'em-alta', janela: undefined })} aria-current={ordem === 'em-alta' ? 'page' : undefined}>
                {t.abas.emAlta}
              </Link>
            </>
          )}
        </nav>
        {(ordem === 'melhores' || ordem === 'em-alta') && (
          <div className="ordem-pessoas">
            <p className="miudo">{t.ordemNota}</p>
            {ordem === 'em-alta' && (
              <div className="com-filtro-grupo" role="group" aria-label={t.janelaRotulo}>
                <Link href={href({ janela: undefined })} className="chip-filtro" aria-current={!janela ? 'true' : undefined}>
                  {t.janelas['24h']}
                </Link>
                <Link href={href({ janela: '7d' })} className="chip-filtro" aria-current={janela === '7d' ? 'true' : undefined}>
                  {t.janelas['7d']}
                </Link>
              </div>
            )}
          </div>
        )}
        {voc && (voc.status.length > 0 || voc.etiquetas.length > 0) && (
          <div className="voc-filtros">
            {voc.status.length > 0 && (
              <div className="com-filtro-grupo" role="group" aria-label={t.statusRotulo}>
                <Link href={href({ status: undefined })} className="chip-filtro" aria-current={!status ? 'true' : undefined}>
                  {t.todas}
                </Link>
                {statusParaFiltro(voc, categoria).map((s) => (
                  <Link key={s.chave} href={href({ status: status === s.chave ? undefined : s.chave })} className="voc-filtro" aria-current={status === s.chave ? 'true' : undefined}>
                    <ChipDeStatus s={s} d={d} />
                  </Link>
                ))}
              </div>
            )}
            {voc.etiquetas.length > 0 && (
              <div className="com-filtro-grupo" role="group" aria-label={t.etiquetaRotulo}>
                <Link href={href({ etiqueta: undefined })} className="chip-filtro" aria-current={!etiqueta ? 'true' : undefined}>
                  {t.todas}
                </Link>
                {voc.etiquetas.map((e) => (
                  <Link key={e.chave} href={href({ etiqueta: etiqueta === e.chave ? undefined : e.chave })} className="voc-filtro" aria-current={etiqueta === e.chave ? 'true' : undefined}>
                    <ChipDeEtiqueta e={e} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
        {(com.categorias.length > 0 || tag) && (
          <div className="com-filtro-grupo" role="group" aria-label={t.categoriaRotulo}>
            {com.categorias.length > 0 && (
              <Link href={href({ categoria: undefined })} className="chip-filtro" aria-current={!categoria ? 'true' : undefined}>
                {t.todas}
              </Link>
            )}
            {com.categorias.map((cat) => (
              <Link key={cat} href={href({ categoria: categoria === cat ? undefined : cat })} className="chip-filtro" aria-current={categoria === cat ? 'true' : undefined}>
                {cat}
              </Link>
            ))}
            {tag && (
              <Link href={href({ tag: undefined })} className="chip-filtro ativo-tag" aria-label={t.tirarTag}>
                {t.tagFiltro.replace('{tag}', `#${tag}`)} ×
              </Link>
            )}
          </div>
        )}

        {!lista.ok ? (
          <EstadoDeErro codigo={lista.codigo} d={d} lang={lang} />
        ) : (
          <>
            {lista.valor.fixados && lista.valor.fixados.length > 0 && (
              <div className="topicos-fixados" aria-label={t.fixados}>
                <h3 className="sobrelinha">{t.fixados}</h3>
                <div className="topicos-lista">
                  {lista.valor.fixados.map((x) => (
                    <CartaoTopico key={x.id} t={x} d={d} lang={lang} agora={agora} vocabulario={voc} />
                  ))}
                </div>
              </div>
            )}
            {lista.valor.itens.length === 0 && !(lista.valor.fixados && lista.valor.fixados.length > 0) ? (
              <EstadoVazio
                titulo={status || etiqueta ? t.vazioMarca.titulo : ordem === 'sem-resposta' ? t.vazioSemResposta.titulo : categoria || tag ? t.vazioFiltro.titulo : t.vazio.titulo}
                texto={status || etiqueta ? t.vazioMarca.texto : ordem === 'sem-resposta' ? t.vazioSemResposta.texto : categoria || tag ? t.vazioFiltro.texto : t.vazio.texto}
                ficha={rostoPorUid(`rvr_forum_vazio_${ordem}00000`)}
                estado={ordem === 'sem-resposta' ? 'feliz' : 'dormir'}
                acoes={
                  podeAbrir ? (
                    <Link href={`/${lang}/comunidades/${id}/novo`} className="btn btn-prim">
                      {t.novo}
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <TopicosMais inicial={{ itens: lista.valor.itens, proximo: lista.valor.proximo }} comunidade={id} opcoes={{ ordem, ...(janela ? { janela } : {}), ...(categoria ? { categoria } : {}), ...(tag ? { tag } : {}), ...(status ? { status } : {}), ...(etiqueta ? { etiqueta } : {}) }} d={d} lang={lang} agora={agora} vocabulario={voc} />
            )}
          </>
        )}
      </section>
    </>
  )
}
