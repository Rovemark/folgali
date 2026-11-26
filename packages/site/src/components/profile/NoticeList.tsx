'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { markNoticesSeenAction } from '@/app/social-actions'
import { IcAlert, IcBalloon, IcLock, IcCheck, IcShield, IcTrash } from '@/components/Icons'
import Portrait from '@/components/Portrait'
import ActionButton from '@/components/social/ActButton'
import { IcFriends, IcQuotes, IcBlock, IcQuote, IcInvite, IcStar, IcTag, IcGroup, IcMedal, IcMod, IcWall, IcResolved } from '@/components/social/SocialIcons'
import { useMore } from '@/components/social/useMais'
import { noticeAction, noticeTarget, isNewItem, noticePhrase } from '@/lib/domain/notice'
import { relativeTime, type Dictionary, type Ready } from '@/lib/i18n-base'
import type { Page } from '@/lib/types'
import type { Notification, NotificationType } from '@/lib/social/types'

const ICON: Record<NotificationType, React.ReactNode> = {
  recado: <IcWall />,
  'pedido-de-amizade': <IcFriends />,
  'amizade-aceita': <IcFriends />,
  'depoimento-para-aceitar': <IcQuotes />,
  'depoimento-aceito': <IcQuotes />,
  'resposta-no-topico': <IcBalloon />,
  'resposta-a-voce': <IcBalloon />,
  citacao: <IcQuote />,
  mencao: <span className="pf-at">@</span>,
  'convite-comunidade': <IcInvite />,
  'pedido-de-entrada': <IcGroup />,
  'entrada-aprovada': <IcCheck />,
  'selo-recebido': <IcMedal />,
  'removido-por-responsavel': <IcTrash />,
  'apelacao-recebida': <IcMod />,
  'apelacao-decidida': <IcShield />,
  expulso: <IcBlock />,
  banido: <IcBlock />,
  'posse-recebida': <IcStar />,
  resolveu: <IcResolved />,
  'novo-seguidor': <IcTag />,
  'conversa-pedido': <IcLock />,
  'conversa-aceita': <IcLock />,
}

type Props = { initial: Page<Notification>; myUid: string; myHandle: string; visto: number; d: Dictionary; lang: Ready; agora: string; onlyUnread?: boolean }

// the phrase lives in src/lib/domain/notice.ts so that the "My rover" panel (a server component) uses the same one; the name is still exported from here
export { noticePhrase }

/** Notices of the rover: the new ones highlighted, "see more" and an action button where it fits. On opening, it marks them as seen (in the app, no cookie). */
export default function NoticeList({ initial, myUid, myHandle, visto: seenFromServer, d, lang, agora: now, onlyUnread = false }: Props) {
  // what was new stays highlighted on this visit, even after being marked as seen
  const [seen] = useState(seenFromServer)
  const { itens: items, proximo: next, pendente: pending, failed, mais: more } = useMore(initial, { lista: 'notificacoes', de: myUid }, (n) => String(n.seq))
  const larger = initial.itens[0]?.seq ?? 0
  useEffect(() => {
    if (larger > seen) void markNoticesSeenAction(larger)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [larger])
  const a = d.socAvisos
  const newItems = items.filter((n) => isNewItem(n, seen))
  const older = onlyUnread ? [] : items.filter((n) => !isNewItem(n, seen))

  const line = (n: Notification) => {
    const dest = noticeTarget(n, myHandle)
    const action = noticeAction(n)
    const phrase = noticePhrase(n, d)
    return (
      <li key={n.seq} className="pf-notice" data-novo={isNewItem(n, seen)} data-tipo={n.tipo}>
        {n.origem && n.tipo !== 'selo-recebido' ? (
          <span className="pf-notice-icon pf-notice-face" aria-hidden>
            <Portrait ficha={n.origem.rosto} nome={n.origem.nome} tamanho={56} decorative />
            <span className="pf-notice-badge" data-tipo={n.tipo}>{ICON[n.tipo] ?? <IcAlert />}</span>
          </span>
        ) : (
          <span className="pf-notice-icon" aria-hidden>
            {ICON[n.tipo] ?? <IcAlert />}
          </span>
        )}
        <div className="pf-notice-body">
          <p>
            {isNewItem(n, seen) && <span className="reader-only">{a.novos}: </span>}
            {n.origem && phrase.startsWith(n.origem.nome) ? (
              <>
                <strong>{n.origem.nome}</strong>
                {phrase.slice(n.origem.nome.length)}
              </>
            ) : (
              phrase
            )}
          </p>
          <small>
            <time dateTime={n.em}>{relativeTime(n.em, d, new Date(now))}</time>
            {dest.indisponivel && <> · {a.indisponivel}</>}
            {dest.href && !action && (
              <Link href={`/${lang}${dest.href}`} className="pf-open">
                {a.abrir}
              </Link>
            )}
          </small>
          <div className="pf-notice-actions">
            {action === 'amizade' && n.origem && (
              <>
                <ActionButton ato={{ tipo: 'amizade', alvo: n.origem.uid, acao: 'aceitar' }} d={d} className="btn btn-primary btn-small">
                  {a.acoes.aceitar}
                </ActionButton>
                <ActionButton ato={{ tipo: 'amizade', alvo: n.origem.uid, acao: 'recusar' }} d={d} className="btn btn-secondary btn-small">
                  {a.acoes.recusar}
                </ActionButton>
              </>
            )}
            {action === 'convite' && n.comunidade && (
              <>
                <ActionButton ato={{ tipo: 'comunidade-adesao', comunidade: n.comunidade, acao: 'aceitar-convite' }} d={d} className="btn btn-primary btn-small">
                  {a.acoes.aceitar}
                </ActionButton>
                <ActionButton ato={{ tipo: 'comunidade-adesao', comunidade: n.comunidade, acao: 'recusar-convite' }} d={d} className="btn btn-secondary btn-small">
                  {a.acoes.recusar}
                </ActionButton>
              </>
            )}
            {dest.href && action && (
              <Link href={`/${lang}${dest.href}`} className="btn btn-calm btn-small">
                {a.abrir}
              </Link>
            )}
          </div>
        </div>
      </li>
    )
  }

  return (
    <>
      {onlyUnread && newItems.length === 0 && <p className="soft">{a.nenhumNaoLido}</p>}
      {newItems.length > 0 && (
        <section aria-labelledby="av-novos">
          <h2 id="av-novos" className="overline">
            {a.novos} <span className="pf-n">{newItems.length}</span>
          </h2>
          <ul className="pf-notices" aria-busy={pending}>{newItems.map(line)}</ul>
        </section>
      )}
      {older.length > 0 && (
        <section aria-labelledby="av-antigos">
          {newItems.length > 0 && (
            <h2 id="av-antigos" className="overline">
              {a.antigos}
            </h2>
          )}
          <ul className="pf-notices" aria-busy={pending}>{older.map(line)}</ul>
        </section>
      )}
      {next && (
        <div className="pf-more-list">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : a.verMais}
          </button>
          {failed && <p className="error-field" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
