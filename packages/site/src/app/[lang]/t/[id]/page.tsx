import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import ReportDialog from '@/components/communities/ReportDialog'
import PollBlock from '@/components/communities/PollBlock'
import Thread from '@/components/communities/Thread'
import { ImageGallery } from '@/components/NetworkImage'
import TopicManagement, { type PossibleTarget } from '@/components/communities/TopicManagement'
import Marks from '@/components/communities/Brands'
import ReplyTopic from '@/components/communities/ReplyToTopic'
import { TopicBadges } from '@/components/communities/TopicCard'
import EmptyState from '@/components/EmptyState'
import Reactions from '@/components/Reactions'
import Portrait from '@/components/Portrait'
import { IcLock, IcHeart, IcLamp, IcTrash } from '@/components/Icons'
import { IcEdit, IcResolved, IcPadlock } from '@/components/social/SocialIcons'
import ActionButton from '@/components/social/ActButton'
import Emblem from '@/components/social/Emblem'
import ErrorState from '@/components/social/ErrorState'
import SocialText from '@/components/social/SocialText'
import { isComplete, isTeam, ID_OK, readCommunity, whoOf, whoAmI } from '@/lib/communities/data'
import { faceByUid } from '@/lib/domain/expression'
import { orderWindow, repliesOrder } from '@/lib/domain/order'
import { canEditTopic, canInCommunity } from '@/lib/domain/permissions'
import { missingGracePeriod, minutesToShow } from '@/lib/domain/deadlines'
import { galleryTexts } from '@/i18n/attach-gallery'
import { dict, isReady, plural, relativeTime } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import type { ForumReply } from '@/lib/social/types'
import { screenMeta } from '@/lib/seo/meta-screens'
import { EditButton, Editable, EditableText } from '@/components/edit/Editable'
import EditedMark from '@/components/edit/EditedMark'
import PersonWriter from '@/components/person/PersonWriter'
import { attachTexts } from '@/i18n/attach'
import { editTexts } from '@/i18n/edit'
import { personTexts } from '@/i18n/person'
import { issuersReady } from '@/lib/folgali/issuers'
import { currentPerson } from '@/lib/folgali/session'
import { legalDict } from '@/lib/legal-i18n'
import { isDemo } from '@/lib/site'
import type { TopicVersion } from '@/lib/social/types'
import { videoPlayerTexts } from '@/i18n/video-player'
import { videoTexts } from '@/i18n/video'
import NetworkVideo from '@/components/media/NetworkVideo'

type P = { params: Promise<{ lang: string; id: string }>; searchParams?: Promise<{ ordem?: string; janela?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  const t = ID_OK.test(id) ? await load(() => getNetwork().cliente.topico(id)) : null
  return screenMeta(lang, `/t/${id}`, t?.ok ? t.valor.titulo : 'Tópico', t?.ok ? t.valor.texto : undefined)
}

export default async function TopicPage({ params, searchParams }: P) {
  const { lang, id } = await params
  const sp = (await searchParams) ?? {}
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socForum.topico
  const { cliente: client } = getNetwork()
  const tr = ID_OK.test(id) ? await load(() => client.topico(id)) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!tr.ok && tr.codigo === 'nao-encontrado' && ID_OK.test(id)) {
    // the notice of a reply, quote and mention points to the id of the REPLY: it leads to its topic
    const owner = await load(() => client.topicoDeObjeto(id))
    if (owner.ok && owner.valor !== id) redirect(`/${lang}/t/${owner.valor}#r-${id.slice(-12)}`)
  }
  if (!tr.ok) {
    if (tr.codigo === 'removido') {
      return (
        <EmptyState
          titulo={t.removidoTitulo}
          texto={t.removidoTexto}
          ficha={faceByUid('rvr_topico_removido_0000')}
          estado="dormir"
          acoes={
            <Link href={`/${lang}/comunidades`} className="btn btn-secondary">
              {d.socComunidades.titulo}
            </Link>
          }
        />
      )
    }
    return <ErrorState codigo={tr.codigo} d={d} lang={lang} />
  }
  const topic = tr.valor
  const now = new Date().toISOString()
  const nowMs = Date.parse(now)
  const me = await whoAmI()
  // 0.3.2: reply order by distinct people, only if the relay declares it; child replies stay chronological (the conversation reads top to bottom)
  const byPeople = await client.suporta('ordem-por-pessoas')
  const order = repliesOrder(sp.ordem, byPeople)
  const window = orderWindow(order, sp.janela)
  const orderHref = (o: string, j?: string) => {
    const p = new URLSearchParams()
    if (o !== 'antigas') p.set('ordem', o)
    if (j) p.set('janela', j)
    const q = p.toString()
    return `/${lang}/t/${id}${q ? `?${q}` : ''}#respostas-t`
  }
  // 0.7.0: a person signed in with Rovemark replies here, signed by the device; a visitor is invited to sign in
  const login = !isDemo(client.modo) && issuersReady() !== null
  const person = login && !me && (await currentPerson()) !== null
  // 0.11.0 part 2 (`edicao`): the history of versions comes from the public history of edits, which also holds the older
  // `topico-editar` versions; a relay without it keeps the topic history of 0.3
  // 0.11.0 part 3: "attach video" only while the relay announces `video` (`RELAY_VIDEO=sim`)
  const [withEdit, freeMedia, withVideo] = await Promise.all([
    client.suporta('edicao').catch(() => false),
    person ? client.suporta('midia-livre').catch(() => false) : false,
    person ? client.suporta('video').catch(() => false) : false,
  ])
  const topicVersions = async (): Promise<TopicVersion[]> =>
    withEdit ? (await client.edicoes(id)).itens.map((v) => ({ versao: v.versao, titulo: v.titulo ?? '', texto: v.texto, tags: v.tags, criadoEm: v.criadoEm })) : client.historico(id)
  const [using, resp, hist] = await Promise.all([
    readCommunity(topic.comunidade),
    load(() => client.respostas(id, { ordem: order, janela: window })),
    topic.versoes > 1 ? load(topicVersions) : Promise.resolve(null),
  ])
  const et = editTexts(lang)
  const you = using.ok ? using.valor.voce : null
  const access = using.ok ? using.valor.acesso : 'aberta'
  const who = whoOf(you, new Date(now))
  const team = isTeam(you)
  const myTopic = !!me && me.uid === topic.autor.uid
  const ownerUid = using.ok && isComplete(using.valor) ? using.valor.dono.uid : ''
  const iAmModerator = you?.papel === 'moderador'

  const childrenById: Record<string, ForumReply[]> = {}
  if (resp.ok) {
    await Promise.all(
      resp.valor.itens
        .filter((r) => r.filhas > 0)
        .map(async (r) => {
          const f = await load(() => client.respostas(id, { em: r.id }))
          childrenById[r.id] = f.ok ? f.valor.itens : []
        }),
    )
  }

  // what the person can do and, when they cannot, the reason
  const pReply = canInCommunity('responder', who, access)
  // how many seconds are left of the 10 minute waiting period (only if the relay said since when the reader has been a member)
  const missingReply = missingGracePeriod(you?.membroDesde, 'resposta', new Date(now))
  let respond = pReply.ok
  let replyReason: string | undefined
  const rt = d.socForum.respostas
  if (topic.trancado && !team) {
    respond = false
    replyReason = rt.trancado
  } else if (!pReply.ok) {
    replyReason = pReply.motivo === 'banido' ? rt.banidoTexto : you?.pedidoPendente ? rt.pedidoAntes : pReply.motivo === 'conta-nova' ? (missingReply > 0 ? plural(rt.carenciaFalta, minutesToShow(missingReply)) : rt.carenciaTexto) : rt.entreAntes
  }
  const pVote = canInCommunity('votar', who, access).ok
  const canResolve = canInCommunity('resolver', who, access, { meuTopico: myTopic }).ok
  const edit = canEditTopic({ meuTopico: myTopic, createdAtMs: Date.parse(topic.criadoEm), nowMs, edicoes: topic.versoes - 1, trancado: topic.trancado })

  // possible destinations to move to (only the team needs this)
  let destinations: PossibleTarget[] = []
  if (team && me && you?.papel) {
    const mine = await load(() => client.comunidadesDoRover(me.uid))
    if (mine.ok) destinations = mine.valor.itens.filter((x) => x.papel !== 'membro').map((x) => ({ id: x.comunidade.id, nome: x.comunidade.nome, acesso: x.comunidade.acesso, papel: x.papel, categorias: x.comunidade.categorias }))
  }
  const replySolved = topic.resolvidoPor
  const ctx = {
    topico: id,
    resolvedId: replySolved?.resposta ?? null,
    autorDoTopico: topic.autor.uid,
    myUid: me?.uid ?? null,
    roverName: me?.nome,
    canWrite: me !== null,
    // a person writes with her own box at the end of the thread, and a visitor gets one invitation there: the rows of the replies do
    // not repeat "join first" (that is about a rover, read from the paired app)
    responder: login && !me ? false : respond,
    replyReason: login && !me ? undefined : replyReason,
    resolver: canResolve,
    equipe: team,
    iAmModerator,
    ownerUid,
  }

  return (
    <article className="topic-page">
      <p className="topic-crumb">
        {using.ok && isComplete(using.valor) ? <Emblem nome={using.valor.nome} tamanho={32} /> : null}
        <Link href={`/${lang}/comunidades/${topic.comunidade}`} aria-label={`${t.voltar}: ${topic.comunidadeNome}`}>
          {topic.comunidadeNome}
        </Link>
      </p>

      {replySolved && (
        <a className="band-resolved" href={`#r-${replySolved.resposta.slice(-12)}`}>
          <IcResolved />
          <span>{t.resolvidoFaixa.replace('{nome}', replySolved.por.nome)}</span>
          <span className="band-go">{t.irResolucao}</span>
        </a>
      )}

      <Editable alvo={{ id, tipo: 'topico', autor: topic.autor.uid, conteudo: { titulo: topic.titulo, texto: topic.texto, tags: topic.tags, adulto: false } }} lang={lang}>
        <header className="topic-head">
          <div className="flex-row">
            <TopicBadges t={topic} d={d} />
            <Marks marcas={topic.marcas} vocabulario={using.ok && isComplete(using.valor) ? using.valor.vocabulario : undefined} d={d} />
            {topic.categoria && <span className="label-tag">{t.categoria.replace('{nome}', topic.categoria)}</span>}
          </div>
          <h1>{topic.titulo}</h1>
          <div className="topic-author">
            <Link href={`/${lang}/r/${topic.autor.handle}`} tabIndex={-1} aria-hidden>
              <Portrait ficha={topic.autor.rosto} nome={topic.autor.nome} tamanho={44} decorative />
            </Link>
            <p>
              <Link href={`/${lang}/r/${topic.autor.handle}`} className="post-name">
                {topic.autor.nome}
              </Link>{' '}
              <span className="post-handle"><bdi dir="ltr">@{topic.autor.handle}</bdi></span>
              <br />
              <span className="fine">{t.publicado.replace('{quando}', relativeTime(topic.criadoEm, d, new Date(now)))}</span>
              {topic.edited && (
                <>
                  {' '}
                  <EditedMark marca={topic.edited} href={`/${lang}/t/${id}/edicoes`} d={d} lang={lang} agora={now} />
                </>
              )}
            </p>
          </div>
        </header>

        {topic.trancado && (
          <p className="notice-community" role="note">
            <IcPadlock />
            <span>
              <strong>{t.trancadoTitulo}.</strong> {t.trancadoTexto}
            </span>
          </p>
        )}

        <EditableText>
          <SocialText texto={topic.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="topic-text" />
        </EditableText>
        {/* 0.11.0 part 3 (`video`): the topic's video */}
        {topic.video && (
          <NetworkVideo video={topic.video} t={videoPlayerTexts(lang)} autor={{ nome: topic.autor.nome, handle: topic.autor.handle }} lang={lang} volta={`/t/${id}`} propria={myTopic} />
        )}
        {/* 0.11.0 (`midia-livre`): the topic's own attachments, and what the moderation removed from it */}
        {((topic.imagens?.length ?? 0) > 0 || (topic.anexosRemovidos ?? 0) > 0) && (
          <ImageGallery
            imagens={topic.imagens ?? []}
            rotulo={galleryTexts(lang).label}
            t={galleryTexts(lang)}
            autor={{ nome: topic.autor.nome, handle: topic.autor.handle }}
            lang={lang}
            volta={`/t/${id}`}
            propria={myTopic}
            removidos={topic.anexosRemovidos}
          />
        )}
        {topic.tags.length > 0 && (
          <ul className="labels" aria-label={t.tagsRotulo}>
            {topic.tags.map((x) => (
              <li key={x}>
                <Link href={`/${lang}/comunidades/${topic.comunidade}?tag=${x}`} className="label-tag">
                  {x}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {topic.pesquisa && <PollBlock topico={id} e={topic.pesquisa} canVote={pVote} d={d} agora={now} />}

        <div className="actions topic-actions">
          {/* 0.3.1 (`reacoes-do-topico`): with relay 0.3 the topic carries no counts and the bar does not even appear */}
          {topic.reacoes &&
            (me && canInCommunity('reagir', who, access).ok ? (
              <div role="group" aria-label={d.socForum.topico.reacoesRotulo} className="topico-reacoes">
                <Reactions id={id} reacoes={topic.reacoes} minha={topic.minhaReacao ?? null} rotulos={{ curtir: rt.curtir, util: rt.util }} />
              </div>
            ) : (
              <div role="group" aria-label={d.socForum.topico.reacoesRotulo} className="topico-reacoes">
                <span className="action-btn" aria-label={`${rt.curtir}: ${topic.reacoes.curtir}`}>
                  <IcHeart />
                  <span>{topic.reacoes.curtir || ''}</span>
                </span>
                <span className="action-btn" aria-label={`${rt.util}: ${topic.reacoes.util}`}>
                  <IcLamp />
                  <span>{topic.reacoes.util || ''}</span>
                </span>
              </div>
            ))}
          {/* 0.11.0 part 2: the person edits her own topic in place (title and text) */}
          <EditButton className="btn btn-secondary btn-small" />
          {myTopic && edit.ok && (
            <Link href={`/${lang}/t/${id}/editar`} className="btn btn-secondary btn-small">
              <IcEdit /> {t.editar}
            </Link>
          )}
          {myTopic && !edit.ok && 'motivo' in edit && (edit.motivo === 'fora-da-janela' || edit.motivo === 'limite-de-estrutura') && (
            <span className="fine">{edit.motivo === 'fora-da-janela' ? t.foraJanela : t.limiteEdicoes}</span>
          )}
          {myTopic && (
            <ActionButton ato={{ tipo: 'remocao-pelo-autor', alvo: id }} d={d} className="btn btn-calm btn-small" confirmar={{ titulo: t.apagarTitulo, texto: t.apagarTexto, ok: t.apagarOk }}>
              <IcTrash /> {t.apagar}
            </ActionButton>
          )}
          {!myTopic && <ReportDialog alvo={id} d={d} rotulo={d.socForum.respostas.denunciar} className="btn btn-calm btn-small" />}
        </div>
      </Editable>

      {topic.versoes > 1 && (
        <details className="history">
          <summary>
            <IcEdit /> {t.historicoTitulo} · {plural(t.versoes, topic.versoes)}
          </summary>
          <p className="fine">{t.historicoNota}</p>
          {hist?.ok && (
            <ol className="versions">
              {[...hist.valor].reverse().map((v, i) => (
                <li key={v.versao}>
                  <p className="overline">
                    {t.versaoN.replace('{n}', String(v.versao))}
                    {i === 0 ? ` · ${t.versaoAtual}` : ''} · {relativeTime(v.criadoEm, d, new Date(now))}
                  </p>
                  <p className="version-title">{v.titulo}</p>
                  <SocialText texto={v.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="version-text" />
                </li>
              ))}
            </ol>
          )}
        </details>
      )}

      {team && you?.papel && (
        <TopicManagement
          topico={id}
          fixado={topic.fixado}
          trancado={topic.trancado}
          origem={{ id: topic.comunidade, acesso: access, papel: you.papel }}
          destinations={destinations}
          canRemove={canInCommunity('remover-alheio', who, access, { conteudoDoDono: topic.autor.uid === ownerUid }).ok}
          d={d}
        />
      )}

      <section className="stack" aria-labelledby="respostas-t" style={{ marginTop: 28 }}>
        <h2 id="respostas-t">{plural(d.socForum.respostas.titulo, topic.respostas)}</h2>
        {byPeople && topic.respostas > 1 && (
          <nav className="sub-nav" aria-label={t.respostasOrdem.rotulo}>
            <Link href={orderHref('antigas')} aria-current={order === 'antigas' ? 'page' : undefined}>
              {t.respostasOrdem.antigas}
            </Link>
            <Link href={orderHref('melhores')} aria-current={order === 'melhores' ? 'page' : undefined}>
              {t.respostasOrdem.melhores}
            </Link>
            <Link href={orderHref('em-alta')} aria-current={order === 'em-alta' ? 'page' : undefined}>
              {t.respostasOrdem.emAlta}
            </Link>
          </nav>
        )}
        {order === 'em-alta' && (
          <div className="com-filter-group" role="group" aria-label={d.socForum.lista.janelaRotulo}>
            <Link href={orderHref('em-alta')} className="chip-filter" aria-current={!window ? 'true' : undefined}>
              {d.socForum.lista.janelas['24h']}
            </Link>
            <Link href={orderHref('em-alta', '7d')} className="chip-filter" aria-current={window === '7d' ? 'true' : undefined}>
              {d.socForum.lista.janelas['7d']}
            </Link>
          </div>
        )}
        {order !== 'antigas' && <p className="fine order-note">{d.socForum.lista.ordemNota}</p>}
        {!resp.ok ? (
          <ErrorState codigo={resp.codigo} d={d} lang={lang} noBack />
        ) : resp.valor.itens.length === 0 ? (
          <EmptyState titulo={rt.vazio.titulo} texto={rt.vazio.texto} ficha={faceByUid('rvr_sem_resposta_0000000')} estado="acenar" altura={110} />
        ) : (
          <Thread respostas={resp.valor.itens} filhas={childrenById} c={ctx} d={d} lang={lang} agora={now} />
        )}
        {person && !(topic.trancado && !team) ? (
          <section className="card" aria-labelledby="pw-forum-t">
            <h2 id="pw-forum-t">{et.reply.forumTitle}</h2>
            <PersonWriter
              t={personTexts(lang)}
              at={attachTexts(lang)}
              media={freeMedia}
              video={withVideo}
              vt={videoTexts(lang)}
              leak={legalDict(lang).vazamento}
              lang={lang}
              consentHref={`/${lang}/entrar`}
              mode={{ kind: 'forum', topico: id, em: null, comunidade: topic.comunidade, acesso: access }}
              rt={et.reply}
            />
          </section>
        ) : login && !person && !me && !topic.trancado ? (
          <div className="invite-reply">
            <p>{d.post.naoResponde}</p>
            <Link href={`/${lang}/entrar`} className="btn btn-primary btn-small">
              {et.reply.inviteLink}
            </Link>
          </div>
        ) : respond ? (
          <ReplyTopic topico={id} d={d} lang={lang} roverName={me?.nome} canWrite={me !== null} />
        ) : (
          replyReason && (
            <p className="notice-community" role="note">
              <IcLock />
              <span>{replyReason}</span>
            </p>
          )
        )}
      </section>
    </article>
  )
}
