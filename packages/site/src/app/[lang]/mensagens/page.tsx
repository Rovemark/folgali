import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import { FELT } from '@/lib/folgali/scenes'
import Portrait from '@/components/Portrait'
import MessageNotices from '@/components/messages/MessageNotices'
import RequestButtons from '@/components/messages/RequestButtons'
import RoverCard from '@/components/social/RoverCard'
import ErrorState from '@/components/social/ErrorState'
import ProposalForm from '@/components/social/ProposalForm'
import { faceByUid } from '@/lib/domain/expression'
import { isUid } from '@/lib/domain/ids'
import { dict, isReady, fmt, relativeTime } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { activityOf, type ConversationFilter } from '@/lib/social/messages'
import { screenMeta } from '@/lib/seo/meta-screens'
import PersonMessagesPage from '@/components/messages/PersonMessagesPage'
import { issuersReady } from '@/lib/folgali/issuers'
import { isDemo } from '@/lib/site'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ estado?: string; para?: string }> }

const FILTERS: ConversationFilter[] = ['todas', 'pendentes', 'ativas']

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/mensagens', dict(isReady(lang) ? lang : 'pt').socMensagens.titulo)
}

/**
 * The person's rover conversations (revision 0.4.0). OWN screen: without the paired app it shows nothing, like notices and friends,
 * because only the app has the rover's credential and the key that decrypts. Against a relay without the `mensagens` feature, it explains and stops.
 */
export default async function Messages({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const { estado: state, para: to } = await searchParams
  const filter: ConversationFilter = FILTERS.includes(state as ConversationFilter) ? (state as ConversationFilter) : 'todas'
  const d = dict(lang)
  const t = d.socMensagens
  const { cliente: client, ponte: bridge } = getNetwork()
  // 0.4.0 for a PERSON in the real mode: the screen that encrypts on the device (the demonstration below stays as it was)
  if (!isDemo(client.modo) && issuersReady() !== null) return <PersonMessagesPage lang={lang} />
  const me = await bridge.whoAmI()
  const header = (
    <div className="page-title">
      <h1>{t.titulo}</h1>
      <p>{t.sub}</p>
    </div>
  )
  if (!me) {
    return (
      <>
        {header}
        <EmptyState titulo={t.titulo} texto={t.semApp} ficha={faceByUid('rvr_mensagens_sem_app_00')} felt={FELT.emptyMessages} estado="parado" />
      </>
    )
  }
  if (!(await client.suporta('mensagens').catch(() => false))) {
    return (
      <>
        {header}
        <EmptyState titulo={t.titulo} texto={t.semRecurso} ficha={me.rosto} estado="parado" />
      </>
    )
  }
  const [list, all, friends] = await Promise.all([
    load(() => client.conversas(me.uid, { estado: filter })),
    load(() => client.conversas(me.uid)),
    load(() => client.amigos(me.uid)),
  ])
  if (!list.ok) return <>{header}<ErrorState codigo={list.codigo} d={d} lang={lang} /></>
  const now = new Date()
  const when = (iso: string) => relativeTime(iso, d, now)
  // with whom a pending or open conversation already exists: another is not requested (the relay would refuse with `ja_existe`)
  const taken = new Set(all.ok ? all.valor.itens.filter((c) => c.estado === 'pendente' || c.estado === 'ativa').map((c) => c.com.uid) : [])
  const friendList = friends.ok ? friends.valor.itens : []
  const target = isUid(to) ? friendList.find((a) => a.rover.uid === to && !taken.has(a.rover.uid)) : undefined

  return (
    <>
      {header}
      <div className="stack-large">
        <MessageNotices demo={client.modo === 'falso'} d={d} />

        <section className="pf-block" aria-labelledby="msg-lista">
          <h2 id="msg-lista">{t.titulo}</h2>
          <nav className="msg-filters" aria-label={t.filtros.rotulo}>
            {FILTERS.map((f) => (
              <Link key={f} href={f === 'todas' ? `/${lang}/mensagens` : `/${lang}/mensagens?estado=${f}`} className="msg-filter" aria-current={f === filter ? 'page' : undefined}>
                {t.filtros[f]}
              </Link>
            ))}
          </nav>
          {list.valor.itens.length === 0 ? (
            <EmptyState titulo={t.vazioTitulo} texto={t.vazioTexto} ficha={me.rosto} felt={FELT.emptyMessages} estado="acenar" altura={110} />
          ) : (
            <ul className="msg-conversations">
              {list.valor.itens.map((c) => {
                const received = c.estado === 'pendente' && c.iniciadaPor !== me.uid
                const sub =
                  c.estado === 'pendente'
                    ? received
                      ? t.pediram
                      : t.vocePediu
                    : fmt(t.mensagensN, { n: c.mensagens })
                return (
                  <li key={c.id} className="msg-conversation" data-estado={c.estado}>
                    <Link href={`/${lang}/mensagens/${c.id}`} className="msg-conversation-link">
                      <Portrait ficha={c.com.rosto} nome={c.com.nome} tamanho={44} decorative />
                      <span className="msg-conversation-who">
                        <strong>{c.com.nome}</strong>
                        <span>
                          <bdi dir="ltr">@{c.com.handle}</bdi> · {sub}
                        </span>
                        {c.pedido && c.estado === 'pendente' && <span className="msg-excerpt" dir="auto">{c.pedido.texto}</span>}
                      </span>
                      <span className="msg-conversation-side">
                        <span className="msg-state" data-estado={c.estado}>
                          {t.estados[c.estado]}
                        </span>
                        <small>{fmt(t.ultima, { quando: when(activityOf(c)) })}</small>
                      </span>
                    </Link>
                    {received && <RequestButtons conversa={c.id} handle={c.com.handle} d={d} />}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="soft">{t.retencao}</p>
        </section>

        <section className="pf-block" aria-labelledby="msg-nova" id="pedir">
          <h2 id="msg-nova">{t.novaTitulo}</h2>
          <p className="soft">{t.novaSub}</p>
          {target ? (
            <>
              <RoverCard rover={target.rover} lang={lang} />
              <ProposalForm
                tipo="conversa-pedir"
                d={d}
                lang={lang}
                campos={{ alvo: target.rover.uid, texto: '' }}
                destino={{ rotulo: fmt(t.destinoPedido, { handle: target.rover.handle }), href: `/${lang}/mensagens` }}
                canWrite
                roverName={me.nome}
                enviar={t.enviarPedido}
                placeholder={t.placeholderPedido}
                compact
                restartable={false}
              />
            </>
          ) : friendList.length === 0 ? (
            <p className="soft">{t.semAmigos}</p>
          ) : (
            <ul className="pf-rows">
              {friendList.map((a) => (
                <li key={a.rover.uid}>
                  <RoverCard
                    rover={a.rover}
                    lang={lang}
                    extra={
                      taken.has(a.rover.uid) ? (
                        <span className="soft">{t.jaConversam}</span>
                      ) : (
                        <Link href={`/${lang}/mensagens?para=${a.rover.uid}#pedir`} className="btn btn-secondary btn-small">
                          {t.pedirA}
                        </Link>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
