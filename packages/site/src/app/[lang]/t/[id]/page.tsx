import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import DenunciarDialogo from '@/components/comunidades/DenunciarDialogo'
import EnqueteBloco from '@/components/comunidades/EnqueteBloco'
import Fio from '@/components/comunidades/Fio'
import GestaoTopico, { type DestinoPossivel } from '@/components/comunidades/GestaoTopico'
import Marcas from '@/components/comunidades/Marcas'
import ResponderTopico from '@/components/comunidades/ResponderTopico'
import { SelosDoTopico } from '@/components/comunidades/CartaoTopico'
import EstadoVazio from '@/components/EstadoVazio'
import Reacoes from '@/components/Reacoes'
import Retrato from '@/components/Retrato'
import { IcCadeado, IcCoracao, IcLampada, IcLixo } from '@/components/Icones'
import { IcEditar, IcResolvido, IcTrancar } from '@/components/social/IconesSociais'
import BotaoAto from '@/components/social/BotaoAto'
import Emblema from '@/components/social/Emblema'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import TextoSocial from '@/components/social/TextoSocial'
import { ehCompleta, ehEquipe, ID_OK, lerComunidade, quemDe, quemSou } from '@/lib/comunidades/dados'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { janelaDaOrdem, ordemDasRespostas } from '@/lib/dominio/ordem'
import { podeEditarTopico, podeNaComunidade } from '@/lib/dominio/permissoes'
import { faltaDeCarencia, minutosParaMostrar } from '@/lib/dominio/prazos'
import { dict, ehPronto, plural, tempoRelativo } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import type { RespostaForum } from '@/lib/social/tipos'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }>; searchParams?: Promise<{ ordem?: string; janela?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  const t = ID_OK.test(id) ? await carregar(() => obterRede().cliente.topico(id)) : null
  return metaTela(lang, `/t/${id}`, t?.ok ? t.valor.titulo : 'Tópico', t?.ok ? t.valor.texto : undefined)
}

export default async function TopicoPagina({ params, searchParams }: P) {
  const { lang, id } = await params
  const sp = (await searchParams) ?? {}
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socForum.topico
  const { cliente } = obterRede()
  const tr = ID_OK.test(id) ? await carregar(() => cliente.topico(id)) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!tr.ok && tr.codigo === 'nao-encontrado' && ID_OK.test(id)) {
    // o aviso de resposta, citação e menção aponta para o id da RESPOSTA: leva ao tópico dela
    const dono = await carregar(() => cliente.topicoDeObjeto(id))
    if (dono.ok && dono.valor !== id) redirect(`/${lang}/t/${dono.valor}#r-${id.slice(-12)}`)
  }
  if (!tr.ok) {
    if (tr.codigo === 'removido') {
      return (
        <EstadoVazio
          titulo={t.removidoTitulo}
          texto={t.removidoTexto}
          ficha={rostoPorUid('rvr_topico_removido_0000')}
          estado="dormir"
          acoes={
            <Link href={`/${lang}/comunidades`} className="btn btn-sec">
              {d.socComunidades.titulo}
            </Link>
          }
        />
      )
    }
    return <EstadoDeErro codigo={tr.codigo} d={d} lang={lang} />
  }
  const topico = tr.valor
  const agora = new Date().toISOString()
  const agoraMs = Date.parse(agora)
  const eu = await quemSou()
  // 0.3.2: ordem das respostas por pessoas distintas, só se o relé declara; as filhas seguem cronológicas (a conversa se lê de cima para baixo)
  const porPessoas = await cliente.suporta('ordem-por-pessoas')
  const ordem = ordemDasRespostas(sp.ordem, porPessoas)
  const janela = janelaDaOrdem(ordem, sp.janela)
  const hrefOrdem = (o: string, j?: string) => {
    const p = new URLSearchParams()
    if (o !== 'antigas') p.set('ordem', o)
    if (j) p.set('janela', j)
    const q = p.toString()
    return `/${lang}/t/${id}${q ? `?${q}` : ''}#respostas-t`
  }
  const [com, resp, hist] = await Promise.all([
    lerComunidade(topico.comunidade),
    carregar(() => cliente.respostas(id, { ordem, janela })),
    topico.versoes > 1 ? carregar(() => cliente.historico(id)) : Promise.resolve(null),
  ])
  const voce = com.ok ? com.valor.voce : null
  const acesso = com.ok ? com.valor.acesso : 'aberta'
  const quem = quemDe(voce, new Date(agora))
  const equipe = ehEquipe(voce)
  const meuTopico = !!eu && eu.uid === topico.autor.uid
  const donoUid = com.ok && ehCompleta(com.valor) ? com.valor.dono.uid : ''
  const euModerador = voce?.papel === 'moderador'

  const filhasPorId: Record<string, RespostaForum[]> = {}
  if (resp.ok) {
    await Promise.all(
      resp.valor.itens
        .filter((r) => r.filhas > 0)
        .map(async (r) => {
          const f = await carregar(() => cliente.respostas(id, { em: r.id }))
          filhasPorId[r.id] = f.ok ? f.valor.itens : []
        }),
    )
  }

  // o que a pessoa pode e, quando não pode, a razão
  const pResponder = podeNaComunidade('responder', quem, acesso)
  // quantos segundos faltam da carência de 10 minutos (só se o relé disse desde quando o leitor é membro)
  const faltaResposta = faltaDeCarencia(voce?.membroDesde, 'resposta', new Date(agora))
  let responder = pResponder.ok
  let responderMotivo: string | undefined
  const rt = d.socForum.respostas
  if (topico.trancado && !equipe) {
    responder = false
    responderMotivo = rt.trancado
  } else if (!pResponder.ok) {
    responderMotivo = pResponder.motivo === 'banido' ? rt.banidoTexto : voce?.pedidoPendente ? rt.pedidoAntes : pResponder.motivo === 'conta-nova' ? (faltaResposta > 0 ? plural(rt.carenciaFalta, minutosParaMostrar(faltaResposta)) : rt.carenciaTexto) : rt.entreAntes
  }
  const pVotar = podeNaComunidade('votar', quem, acesso).ok
  const resolver = podeNaComunidade('resolver', quem, acesso, { meuTopico }).ok
  const edicao = podeEditarTopico({ meuTopico, criadoEmMs: Date.parse(topico.criadoEm), agoraMs, edicoes: topico.versoes - 1, trancado: topico.trancado })

  // destinos possíveis para mover (só a equipe precisa)
  let destinos: DestinoPossivel[] = []
  if (equipe && eu && voce?.papel) {
    const minhas = await carregar(() => cliente.comunidadesDoRover(eu.uid))
    if (minhas.ok) destinos = minhas.valor.itens.filter((x) => x.papel !== 'membro').map((x) => ({ id: x.comunidade.id, nome: x.comunidade.nome, acesso: x.comunidade.acesso, papel: x.papel, categorias: x.comunidade.categorias }))
  }
  const respostaResolveu = topico.resolvidoPor
  const ctx = {
    topico: id,
    resolvidaId: respostaResolveu?.resposta ?? null,
    autorDoTopico: topico.autor.uid,
    meuUid: eu?.uid ?? null,
    nomeDoRover: eu?.nome,
    podeEscrever: eu !== null,
    responder,
    responderMotivo,
    resolver,
    equipe,
    euModerador,
    donoUid,
  }

  return (
    <article className="topico-pagina">
      <p className="topico-crumb">
        {com.ok && ehCompleta(com.valor) ? <Emblema nome={com.valor.nome} tamanho={32} /> : null}
        <Link href={`/${lang}/comunidades/${topico.comunidade}`} aria-label={`${t.voltar}: ${topico.comunidadeNome}`}>
          {topico.comunidadeNome}
        </Link>
      </p>

      {respostaResolveu && (
        <a className="faixa-resolvido" href={`#r-${respostaResolveu.resposta.slice(-12)}`}>
          <IcResolvido />
          <span>{t.resolvidoFaixa.replace('{nome}', respostaResolveu.por.nome)}</span>
          <span className="faixa-ir">{t.irResolucao}</span>
        </a>
      )}

      <header className="topico-cab">
        <div className="linha-flex">
          <SelosDoTopico t={topico} d={d} />
          <Marcas marcas={topico.marcas} vocabulario={com.ok && ehCompleta(com.valor) ? com.valor.vocabulario : undefined} d={d} />
          {topico.categoria && <span className="etiqueta">{t.categoria.replace('{nome}', topico.categoria)}</span>}
        </div>
        <h1>{topico.titulo}</h1>
        <div className="topico-autor">
          <Link href={`/${lang}/r/${topico.autor.handle}`} tabIndex={-1} aria-hidden>
            <Retrato ficha={topico.autor.rosto} nome={topico.autor.nome} tamanho={44} decorativo />
          </Link>
          <p>
            <Link href={`/${lang}/r/${topico.autor.handle}`} className="post-nome">
              {topico.autor.nome}
            </Link>{' '}
            <span className="post-handle"><bdi dir="ltr">@{topico.autor.handle}</bdi></span>
            <br />
            <span className="miudo">{t.publicado.replace('{quando}', tempoRelativo(topico.criadoEm, d, new Date(agora)))}</span>
          </p>
        </div>
      </header>

      {topico.trancado && (
        <p className="aviso-comunidade" role="note">
          <IcTrancar />
          <span>
            <strong>{t.trancadoTitulo}.</strong> {t.trancadoTexto}
          </span>
        </p>
      )}

      <TextoSocial texto={topico.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="topico-texto" />
      {topico.tags.length > 0 && (
        <ul className="etiquetas" aria-label={t.tagsRotulo}>
          {topico.tags.map((x) => (
            <li key={x}>
              <Link href={`/${lang}/comunidades/${topico.comunidade}?tag=${x}`} className="etiqueta">
                {x}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {topico.pesquisa && <EnqueteBloco topico={id} e={topico.pesquisa} podeVotar={pVotar} d={d} agora={agora} />}

      <div className="acoes topico-acoes">
        {/* 0.3.1 (`reacoes-do-topico`): com o relé 0.3 o tópico não traz as contagens e a barra nem aparece */}
        {topico.reacoes &&
          (eu && podeNaComunidade('reagir', quem, acesso).ok ? (
            <div role="group" aria-label={d.socForum.topico.reacoesRotulo} className="topico-reacoes">
              <Reacoes id={id} reacoes={topico.reacoes} minha={topico.minhaReacao ?? null} rotulos={{ curtir: rt.curtir, util: rt.util }} />
            </div>
          ) : (
            <div role="group" aria-label={d.socForum.topico.reacoesRotulo} className="topico-reacoes">
              <span className="acao-btn" aria-label={`${rt.curtir}: ${topico.reacoes.curtir}`}>
                <IcCoracao />
                <span>{topico.reacoes.curtir || ''}</span>
              </span>
              <span className="acao-btn" aria-label={`${rt.util}: ${topico.reacoes.util}`}>
                <IcLampada />
                <span>{topico.reacoes.util || ''}</span>
              </span>
            </div>
          ))}
        {meuTopico && edicao.ok && (
          <Link href={`/${lang}/t/${id}/editar`} className="btn btn-sec btn-peq">
            <IcEditar /> {t.editar}
          </Link>
        )}
        {meuTopico && !edicao.ok && 'motivo' in edicao && (edicao.motivo === 'fora-da-janela' || edicao.motivo === 'limite-de-estrutura') && (
          <span className="miudo">{edicao.motivo === 'fora-da-janela' ? t.foraJanela : t.limiteEdicoes}</span>
        )}
        {meuTopico && (
          <BotaoAto ato={{ tipo: 'remocao-pelo-autor', alvo: id }} d={d} className="btn btn-calmo btn-peq" confirmar={{ titulo: t.apagarTitulo, texto: t.apagarTexto, ok: t.apagarOk }}>
            <IcLixo /> {t.apagar}
          </BotaoAto>
        )}
        {!meuTopico && <DenunciarDialogo alvo={id} d={d} rotulo={d.socForum.respostas.denunciar} className="btn btn-calmo btn-peq" />}
      </div>

      {topico.versoes > 1 && (
        <details className="historico">
          <summary>
            <IcEditar /> {t.historicoTitulo} · {plural(t.versoes, topico.versoes)}
          </summary>
          <p className="miudo">{t.historicoNota}</p>
          {hist?.ok && (
            <ol className="versoes">
              {[...hist.valor].reverse().map((v, i) => (
                <li key={v.versao}>
                  <p className="sobrelinha">
                    {t.versaoN.replace('{n}', String(v.versao))}
                    {i === 0 ? ` · ${t.versaoAtual}` : ''} · {tempoRelativo(v.criadoEm, d, new Date(agora))}
                  </p>
                  <p className="versao-titulo">{v.titulo}</p>
                  <TextoSocial texto={v.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="versao-texto" />
                </li>
              ))}
            </ol>
          )}
        </details>
      )}

      {equipe && voce?.papel && (
        <GestaoTopico
          topico={id}
          fixado={topico.fixado}
          trancado={topico.trancado}
          origem={{ id: topico.comunidade, acesso, papel: voce.papel }}
          destinos={destinos}
          podeRemover={podeNaComunidade('remover-alheio', quem, acesso, { conteudoDoDono: topico.autor.uid === donoUid }).ok}
          d={d}
        />
      )}

      <section className="pilha" aria-labelledby="respostas-t" style={{ marginTop: 28 }}>
        <h2 id="respostas-t">{plural(d.socForum.respostas.titulo, topico.respostas)}</h2>
        {porPessoas && topico.respostas > 1 && (
          <nav className="sub-nav" aria-label={t.respostasOrdem.rotulo}>
            <Link href={hrefOrdem('antigas')} aria-current={ordem === 'antigas' ? 'page' : undefined}>
              {t.respostasOrdem.antigas}
            </Link>
            <Link href={hrefOrdem('melhores')} aria-current={ordem === 'melhores' ? 'page' : undefined}>
              {t.respostasOrdem.melhores}
            </Link>
            <Link href={hrefOrdem('em-alta')} aria-current={ordem === 'em-alta' ? 'page' : undefined}>
              {t.respostasOrdem.emAlta}
            </Link>
          </nav>
        )}
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
        {ordem !== 'antigas' && <p className="miudo ordem-nota">{d.socForum.lista.ordemNota}</p>}
        {!resp.ok ? (
          <EstadoDeErro codigo={resp.codigo} d={d} lang={lang} semVoltar />
        ) : resp.valor.itens.length === 0 ? (
          <EstadoVazio titulo={rt.vazio.titulo} texto={rt.vazio.texto} ficha={rostoPorUid('rvr_sem_resposta_0000000')} estado="acenar" altura={110} />
        ) : (
          <Fio respostas={resp.valor.itens} filhas={filhasPorId} c={ctx} d={d} lang={lang} agora={agora} />
        )}
        {responder ? (
          <ResponderTopico topico={id} d={d} lang={lang} nomeDoRover={eu?.nome} podeEscrever={eu !== null} />
        ) : (
          responderMotivo && (
            <p className="aviso-comunidade" role="note">
              <IcCadeado />
              <span>{responderMotivo}</span>
            </p>
          )
        )}
      </section>
    </article>
  )
}
