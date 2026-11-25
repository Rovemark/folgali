import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import AcoesDaMensagem from '@/components/mensagens/AcoesDaMensagem'
import AvisosDeMensagens from '@/components/mensagens/AvisosDeMensagens'
import BotoesDoPedido from '@/components/mensagens/BotoesDoPedido'
import BotaoAto from '@/components/social/BotaoAto'
import CartaoRover from '@/components/social/CartaoRover'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import FormProposta from '@/components/social/FormProposta'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { ehIdObjeto } from '@/lib/dominio/ids'
import { dict, ehPronto, fmt, tempoRelativo } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { acoesDaConversa } from '@/lib/social/mensagens'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  // o título não leva o nome de ninguém: a tela é privada e o título vai para a aba, o histórico e o compartilhamento
  return metaTela(lang, `/mensagens/${id}`, dict(ehPronto(lang) ? lang : 'pt').socMensagens.titulo)
}

/** Uma conversa aberta: o pedido (em claro), as mensagens que o app decifrou, e o que a pessoa pode fazer agora. Tela PRÓPRIA. */
export default async function ConversaAberta({ params }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socMensagens
  const { cliente, ponte } = obterRede()
  const eu = await ponte.quemSou()
  const voltar = (
    <p className="msg-voltar">
      <Link href={`/${lang}/mensagens`}>{t.voltar}</Link>
    </p>
  )
  if (!eu) {
    return (
      <>
        {voltar}
        <EstadoVazio titulo={t.titulo} texto={t.semApp} ficha={rostoPorUid('rvr_mensagens_sem_app_00')} estado="parado" />
      </>
    )
  }
  if (!(await cliente.suporta('mensagens').catch(() => false))) {
    return (
      <>
        {voltar}
        <EstadoVazio titulo={t.titulo} texto={t.semRecurso} ficha={eu.rosto} estado="parado" />
      </>
    )
  }
  if (!ehIdObjeto(id)) notFound()
  const conversa = await carregar(() => cliente.conversa(eu.uid, id))
  if (!conversa.ok) return <>{voltar}<EstadoDeErro codigo={conversa.codigo} d={d} lang={lang} /></>
  const c = conversa.valor
  const mensagens = await carregar(() => cliente.mensagensDaConversa(eu.uid, id))
  const pode = acoesDaConversa(c, eu.uid)
  const agora = new Date()
  const quando = (iso: string) => tempoRelativo(iso, d, agora)
  const handle = c.com.handle

  return (
    <>
      {voltar}
      <div className="titulo-pag">
        <h1>{fmt(t.conversaCom, { nome: c.com.nome })}</h1>
        <p>
          <bdi dir="ltr">@{handle}</bdi> ·{' '}
          <span className="msg-estado" data-estado={c.estado}>
            {t.estados[c.estado]}
          </span>
        </p>
      </div>
      <div className="pilha-g">
        <AvisosDeMensagens demo={cliente.modo === 'falso'} d={d} />

        <section className="pf-bloco msg-pedido" aria-labelledby="msg-pedido">
          <h2 id="msg-pedido">{t.pedidoTitulo}</h2>
          <CartaoRover rover={c.iniciadaPor === eu.uid ? eu : c.com} lang={lang} sub={c.pedido ? quando(c.pedido.em) : undefined} />
          {c.pedido ? (
            <>
              <p className="msg-texto" dir="auto">{c.pedido.texto}</p>
              {c.estado === 'pendente' && <p className="suave">{t.pedidoEmClaro}</p>}
            </>
          ) : (
            <p className="suave">{t.pedidoApagado}</p>
          )}
          {pode.aceitar && (
            <>
              <p>{t.decidir}</p>
              <BotoesDoPedido conversa={c.id} handle={handle} d={d} />
            </>
          )}
          {pode.cancelar && (
            <>
              <p className="suave">{fmt(t.aguardando, { handle })}</p>
              <div className="msg-decidir">
                <BotaoAto
                  ato={{ tipo: 'conversa-decidir', conversa: c.id, decisao: 'encerrar' }}
                  d={d}
                  className="btn btn-calmo btn-peq"
                  confirmar={{ titulo: fmt(t.confirmar.cancelarTitulo, { handle }), texto: t.confirmar.cancelarTexto, ok: t.confirmar.cancelarOk }}
                >
                  {t.cancelar}
                </BotaoAto>
              </div>
            </>
          )}
        </section>

        <section className="pf-bloco" aria-labelledby="msg-hist">
          <h2 id="msg-hist">
            {t.historicoTitulo} <span className="pf-n">{mensagens.ok ? mensagens.valor.itens.length : 0}</span>
          </h2>
          {!mensagens.ok ? (
            <EstadoDeErro codigo={mensagens.codigo} d={d} lang={lang} semVoltar />
          ) : mensagens.valor.itens.length === 0 ? (
            <p className="suave">{c.estado === 'ativa' ? t.semMensagens : t.fechada[c.estado === 'pendente' ? 'pendente' : c.estado === 'recusada' ? 'recusada' : 'encerrada']}</p>
          ) : (
            <ol className="msg-historico">
              {mensagens.valor.itens.map((m) => (
                <li key={m.id} className="msg" data-minha={m.minha} data-ilegivel={m.texto === null}>
                  <p className="msg-quem">
                    <strong>{m.minha ? t.voce : m.de.nome}</strong> <small>{quando(m.em)}</small>
                  </p>
                  {m.texto === null ? <p className="msg-texto msg-ilegivel">{t.ilegivel}</p> : <p className="msg-texto" dir="auto">{m.texto}</p>}
                  <AcoesDaMensagem conversa={c.id} mensagem={m.id} handle={m.de.handle} podeDenunciar={!m.minha && m.texto !== null} podeAgir d={d} />
                </li>
              ))}
            </ol>
          )}
          {mensagens.ok && mensagens.valor.itens.length > 0 && (
            <div className="msg-decidir">
              <BotaoAto
                ato={{ tipo: 'conversa-apagar', conversa: c.id, mensagem: null }}
                d={d}
                className="btn btn-calmo btn-peq"
                confirmar={{ titulo: t.apagarTudoTitulo, texto: t.apagarTexto, ok: t.apagarOk }}
              >
                {t.apagarTudo}
              </BotaoAto>
            </div>
          )}
          <p className="suave">{t.retencao}</p>
        </section>

        {pode.escrever ? (
          <section className="pf-bloco" aria-labelledby="msg-escrever">
            <h2 id="msg-escrever">{t.escreverTitulo}</h2>
            <p className="suave">{t.escreverNota}</p>
            <FormProposta
              tipo="mensagem"
              d={d}
              lang={lang}
              campos={{ conversa: c.id, texto: '' }}
              destino={{ rotulo: fmt(t.destinoMensagem, { handle }), href: `/${lang}/mensagens/${c.id}` }}
              podeEscrever
              nomeDoRover={eu.nome}
              enviar={t.enviarMensagem}
              placeholder={t.placeholderMensagem}
              compacto
            />
            <div className="msg-decidir">
              <BotaoAto
                ato={{ tipo: 'conversa-decidir', conversa: c.id, decisao: 'encerrar' }}
                d={d}
                className="btn btn-calmo btn-peq"
                confirmar={{ titulo: fmt(t.confirmar.encerrarTitulo, { handle }), texto: t.confirmar.encerrarTexto, ok: t.confirmar.encerrarOk }}
              >
                {t.encerrar}
              </BotaoAto>
            </div>
          </section>
        ) : (
          c.estado !== 'pendente' && <p className="pf-nota">{t.fechada[c.estado === 'recusada' ? 'recusada' : 'encerrada']}</p>
        )}
      </div>
    </>
  )
}
