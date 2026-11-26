import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import MessageActions from '@/components/messages/MessageActions'
import MessageNotices from '@/components/messages/MessageNotices'
import RequestButtons from '@/components/messages/RequestButtons'
import ActionButton from '@/components/social/ActButton'
import RoverCard from '@/components/social/RoverCard'
import ErrorState from '@/components/social/ErrorState'
import ProposalForm from '@/components/social/ProposalForm'
import Typing from '@/components/life/Typing'
import { lifeTexts } from '@/components/life/texts'
import { faceByUid } from '@/lib/domain/expression'
import { isObjectId } from '@/lib/domain/ids'
import { dict, isReady, fmt, relativeTime } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { conversationActions } from '@/lib/social/messages'
import { screenMeta } from '@/lib/seo/meta-screens'
import PersonMessagesPage from '@/components/messages/PersonMessagesPage'
import { issuersReady } from '@/lib/folgali/issuers'
import { isDemo } from '@/lib/site'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  // the title carries nobody's name: the screen is private and the title goes to the tab, the history and sharing
  return screenMeta(lang, `/mensagens/${id}`, dict(isReady(lang) ? lang : 'pt').socMensagens.titulo)
}

/** An open conversation: the request (in clear), the messages the app decrypted, and what the person can do now. OWN screen. */
export default async function OpenConversation({ params }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socMensagens
  const { cliente: client, ponte: bridge } = getNetwork()
  // 0.4.0 for a PERSON in the real mode: the same three-column screen, opened on this conversation
  if (!isDemo(client.modo) && issuersReady() !== null) {
    if (!isObjectId(id)) notFound()
    return <PersonMessagesPage lang={lang} initial={id} />
  }
  const me = await bridge.whoAmI()
  const back = (
    <p className="msg-back">
      <Link href={`/${lang}/mensagens`}>{t.voltar}</Link>
    </p>
  )
  if (!me) {
    return (
      <>
        {back}
        <EmptyState titulo={t.titulo} texto={t.semApp} ficha={faceByUid('rvr_mensagens_sem_app_00')} estado="parado" />
      </>
    )
  }
  if (!(await client.suporta('mensagens').catch(() => false))) {
    return (
      <>
        {back}
        <EmptyState titulo={t.titulo} texto={t.semRecurso} ficha={me.rosto} estado="parado" />
      </>
    )
  }
  if (!isObjectId(id)) notFound()
  const conversation = await load(() => client.conversa(me.uid, id))
  if (!conversation.ok) return <>{back}<ErrorState codigo={conversation.codigo} d={d} lang={lang} /></>
  const c = conversation.valor
  const messages = await load(() => client.mensagensDaConversa(me.uid, id))
  const can = conversationActions(c, me.uid)
  const now = new Date()
  const when = (iso: string) => relativeTime(iso, d, now)
  const handle = c.com.handle

  return (
    <>
      {back}
      <div className="page-title">
        <h1>{fmt(t.conversaCom, { nome: c.com.nome })}</h1>
        <p>
          <bdi dir="ltr">@{handle}</bdi> ·{' '}
          <span className="msg-state" data-estado={c.estado}>
            {t.estados[c.estado]}
          </span>
        </p>
      </div>
      <div className="stack-large">
        <MessageNotices demo={client.modo === 'falso'} d={d} />

        <section className="pf-block msg-pedido" aria-labelledby="msg-pedido">
          <h2 id="msg-pedido">{t.pedidoTitulo}</h2>
          <RoverCard rover={c.iniciadaPor === me.uid ? me : c.com} lang={lang} sub={c.pedido ? when(c.pedido.em) : undefined} />
          {c.pedido ? (
            <>
              <p className="msg-text" dir="auto">{c.pedido.texto}</p>
              {c.estado === 'pendente' && <p className="soft">{t.pedidoEmClaro}</p>}
            </>
          ) : (
            <p className="soft">{t.pedidoApagado}</p>
          )}
          {can.aceitar && (
            <>
              <p>{t.decidir}</p>
              <RequestButtons conversa={c.id} handle={handle} d={d} />
            </>
          )}
          {can.cancelar && (
            <>
              <p className="soft">{fmt(t.aguardando, { handle })}</p>
              <div className="msg-decide">
                <ActionButton
                  ato={{ tipo: 'conversa-decidir', conversa: c.id, decisao: 'encerrar' }}
                  d={d}
                  className="btn btn-calm btn-small"
                  confirmar={{ titulo: fmt(t.confirmar.cancelarTitulo, { handle }), texto: t.confirmar.cancelarTexto, ok: t.confirmar.cancelarOk }}
                >
                  {t.cancelar}
                </ActionButton>
              </div>
            </>
          )}
        </section>

        <section className="pf-block" aria-labelledby="msg-hist">
          <h2 id="msg-hist">
            {t.historicoTitulo} <span className="pf-n">{messages.ok ? messages.valor.itens.length : 0}</span>
          </h2>
          {!messages.ok ? (
            <ErrorState codigo={messages.codigo} d={d} lang={lang} noBack />
          ) : messages.valor.itens.length === 0 ? (
            <p className="soft">{c.estado === 'ativa' ? t.semMensagens : t.fechada[c.estado === 'pendente' ? 'pendente' : c.estado === 'recusada' ? 'recusada' : 'encerrada']}</p>
          ) : (
            <ol className="msg-history">
              {messages.valor.itens.map((m) => (
                <li key={m.id} className="msg" data-minha={m.minha} data-ilegivel={m.texto === null}>
                  <p className="msg-who">
                    <strong>{m.minha ? t.voce : m.de.nome}</strong> <small>{when(m.em)}</small>
                  </p>
                  {m.texto === null ? <p className="msg-text msg-unreadable">{t.ilegivel}</p> : <p className="msg-text" dir="auto">{m.texto}</p>}
                  <MessageActions conversa={c.id} mensagem={m.id} handle={m.de.handle} canReport={!m.minha && m.texto !== null} canAct d={d} />
                </li>
              ))}
            </ol>
          )}
          {/* demonstration: the other rover appears typing (the protocol has no typing signal yet) */}
          {client.modo === 'falso' && c.estado === 'ativa' && messages.ok && messages.valor.itens.length > 0 && <Typing nome={c.com.nome} texto={lifeTexts(lang).digitando} />}
          {messages.ok && messages.valor.itens.length > 0 && (
            <div className="msg-decide">
              <ActionButton
                ato={{ tipo: 'conversa-apagar', conversa: c.id, mensagem: null }}
                d={d}
                className="btn btn-calm btn-small"
                confirmar={{ titulo: t.apagarTudoTitulo, texto: t.apagarTexto, ok: t.apagarOk }}
              >
                {t.apagarTudo}
              </ActionButton>
            </div>
          )}
          <p className="soft">{t.retencao}</p>
        </section>

        {can.escrever ? (
          <section className="pf-block" aria-labelledby="msg-escrever">
            <h2 id="msg-escrever">{t.escreverTitulo}</h2>
            <p className="soft">{t.escreverNota}</p>
            <ProposalForm
              tipo="mensagem"
              d={d}
              lang={lang}
              campos={{ conversa: c.id, texto: '' }}
              destino={{ rotulo: fmt(t.destinoMensagem, { handle }), href: `/${lang}/mensagens/${c.id}` }}
              canWrite
              roverName={me.nome}
              enviar={t.enviarMensagem}
              placeholder={t.placeholderMensagem}
              compact
            />
            <div className="msg-decide">
              <ActionButton
                ato={{ tipo: 'conversa-decidir', conversa: c.id, decisao: 'encerrar' }}
                d={d}
                className="btn btn-calm btn-small"
                confirmar={{ titulo: fmt(t.confirmar.encerrarTitulo, { handle }), texto: t.confirmar.encerrarTexto, ok: t.confirmar.encerrarOk }}
              >
                {t.encerrar}
              </ActionButton>
            </div>
          </section>
        ) : (
          c.estado !== 'pendente' && <p className="pf-note">{t.fechada[c.estado === 'recusada' ? 'recusada' : 'encerrada']}</p>
        )}
      </div>
    </>
  )
}
