import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import { FELT } from '@/lib/folgali/scenes'
import FriendsGrid from '@/components/profile/FriendsGrid'
import RelationsList from '@/components/profile/RelationList'
import ActionButton from '@/components/social/ActButton'
import RoverCard from '@/components/social/RoverCard'
import ErrorState from '@/components/social/ErrorState'
import { faceByUid } from '@/lib/domain/expression'
import { dict, isReady, fmt, plural, relativeTime } from '@/lib/i18n'
import Link from 'next/link'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import Emblem from '@/components/social/Emblem'
import Portrait from '@/components/Portrait'
import { FriendCard, FriendCards } from '@/components/profile/FriendCards'
import { FOLGA_ANNIVERSARY, FRIEND_SUGGESTIONS, timeOffRover } from '@/lib/folgali/demo'
import { summaryOf } from '@/lib/demo-data'
import { isDemo } from '@/lib/site'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/amigos', dict(isReady(lang) ? lang : 'pt').socAmigos.titulo)
}

export default async function Friends({ params }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socAmigos
  const { cliente: client, ponte: bridge } = getNetwork()
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
        <EmptyState titulo={t.titulo} texto={t.semApp} ficha={faceByUid('rvr_amigos_sem_app_000000')} felt={FELT.emptyFriends} estado="parado" />
      </>
    )
  }
  const [pend, friends, rel, invites] = await Promise.all([
    load(() => client.amizadesPendentes(me.uid)),
    load(() => client.amigos(me.uid)),
    load(() => client.relacoes(me.uid)),
    load(() => client.convites(me.uid)),
  ])
  if (!pend.ok) return <>{header}<ErrorState codigo={pend.codigo} d={d} lang={lang} /></>
  const now = new Date()
  const when = (iso: string) => relativeTime(iso, d, now)
  const f = d.socFolgali.amigos
  // Suggestions and the folga anniversary are not in the protocol: demonstration only, and never someone already a friend.
  const demo = isDemo(client.modo)
  const friendUids = new Set([...(friends.ok ? friends.valor.itens.map((a) => a.rover.uid) : []), ...pend.valor.recebidos.map((p) => p.rover.uid), ...pend.valor.enviados.map((p) => p.rover.uid), ...(rel.ok ? rel.valor.itens.map((x) => x.rover.uid) : [])])
  const suggestions = demo ? FRIEND_SUGGESTIONS.map((x) => ({ ...x, rover: summaryOf(x.handle) })).filter((x) => !friendUids.has(x.rover.uid)) : []
  const anniversary = demo ? timeOffRover(FOLGA_ANNIVERSARY.handle) : null
  return (
    <>
      {header}
      <div className="stack-large">
        {invites.ok && invites.valor.length > 0 && (
          <section className="pf-block" aria-labelledby="am-conv">
            <h2 id="am-conv">{t.convites}</h2>
            <ul className="pf-rows">
              {invites.valor.map((c) => (
                <li key={c.comunidade.id} className="pf-invite">
                  <Emblem nome={c.comunidade.nome} tamanho={48} />
                  <div className="pf-invite-text">
                    <strong>{c.comunidade.nome}</strong>
                    <small>
                      <bdi dir="ltr">@{c.por.handle}</bdi> {t.convidadoPor} · {when(c.em)}
                    </small>
                  </div>
                  <div className="pf-row-buttons">
                    <ActionButton ato={{ tipo: 'comunidade-adesao', comunidade: c.comunidade.id, acao: 'aceitar-convite' }} d={d} className="btn btn-primary btn-small">
                      {t.entrar}
                    </ActionButton>
                    <ActionButton ato={{ tipo: 'comunidade-adesao', comunidade: c.comunidade.id, acao: 'recusar-convite' }} d={d} className="btn btn-secondary btn-small">
                      {t.recusarConvite}
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="pf-block" aria-labelledby="am-rec">
          <h2 id="am-rec">
            {t.recebidos} <span className="pf-n">{pend.valor.recebidos.length}</span>
          </h2>
          {pend.valor.recebidos.length > 0 ? (
            <FriendCards>
              {pend.valor.recebidos.map((p) => (
                <FriendCard
                  key={p.rover.uid}
                  rover={p.rover}
                  lang={lang}
                  sub={fmt(t.em, { quando: when(p.em) })}
                  actions={
                    <>
                      <ActionButton ato={{ tipo: 'amizade', alvo: p.rover.uid, acao: 'aceitar' }} d={d} className="btn btn-primary btn-small">
                        {t.aceitar}
                      </ActionButton>
                      <ActionButton ato={{ tipo: 'amizade', alvo: p.rover.uid, acao: 'recusar' }} d={d} className="btn btn-secondary btn-small">
                        {t.recusar}
                      </ActionButton>
                    </>
                  }
                />
              ))}
            </FriendCards>
          ) : (
            <p className="soft">{t.recebidosVazio}</p>
          )}
        </section>

        {suggestions.length > 0 && (
          <section className="pf-block" aria-labelledby="am-sug">
            <h2 id="am-sug">{fmt(f.sugestoes, { nome: me.nome })}</h2>
            <p className="fine">{f.sugestoesNota}</p>
            <FriendCards>
              {suggestions.map((x) => (
                <FriendCard
                  key={x.rover.uid}
                  rover={x.rover}
                  lang={lang}
                  sub={plural(f.emComum, x.mutual)}
                  actions={
                    <ActionButton ato={{ tipo: 'amizade', alvo: x.rover.uid, acao: 'pedir' }} d={d} className="btn btn-primary btn-small">
                      {f.adicionar}
                    </ActionButton>
                  }
                />
              ))}
            </FriendCards>
          </section>
        )}

        {anniversary && (
          <section className="pf-block am-aniversario" aria-labelledby="am-aniv">
            <h2 id="am-aniv">{f.aniversarios}</h2>
            <Link href={`/${lang}/r/${anniversary.handle}`} className="am-birthday-body">
              <Portrait ficha={anniversary.ficha} nome={anniversary.nome} tamanho={96} decorative />
              <span>{plural(f.aniversarioTexto, FOLGA_ANNIVERSARY.months, { nome: anniversary.nome })}</span>
            </Link>
          </section>
        )}

        <section className="pf-block" aria-labelledby="am-env">
          <h2 id="am-env">
            {t.enviados} <span className="pf-n">{pend.valor.enviados.length}</span>
          </h2>
          {pend.valor.enviados.length > 0 ? (
            <ul className="pf-rows">
              {pend.valor.enviados.map((p) => (
                <li key={p.rover.uid}>
                  <RoverCard
                    rover={p.rover}
                    lang={lang}
                    sub={fmt(t.enviouEm, { quando: when(p.em) })}
                    extra={
                      <ActionButton ato={{ tipo: 'amizade', alvo: p.rover.uid, acao: 'desfazer' }} d={d} className="btn btn-calm btn-small">
                        {t.cancelar}
                      </ActionButton>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="soft">{t.enviadosVazio}</p>
          )}
        </section>

        <section className="pf-block" aria-labelledby="am-meus">
          <h2 id="am-meus">{t.meusAmigos}</h2>
          {friends.ok && friends.valor.itens.length > 0 ? (
            <FriendsGrid initial={friends.valor} roverUid={me.uid} d={d} lang={lang} />
          ) : friends.ok ? (
            <EmptyState titulo={t.meusAmigosVazio} texto={t.meusAmigosVazioTexto} ficha={me.rosto} felt={FELT.emptyFriends} estado="acenar" altura={120} />
          ) : (
            <ErrorState codigo={friends.codigo} d={d} lang={lang} noBack />
          )}
        </section>

        <section className="pf-block" aria-labelledby="am-rel">
          <h2 id="am-rel">{t.relacoes}</h2>
          <p className="soft">{t.relacoesSub}</p>
          {rel.ok && rel.valor.itens.length > 0 ? <RelationsList initial={rel.valor} myUid={me.uid} d={d} lang={lang} /> : <p className="soft">{t.relacoesVazio}</p>}
        </section>
      </div>
    </>
  )
}
