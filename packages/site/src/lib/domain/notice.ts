// Where a notice leads and what the screen writes in it. The notice NEVER carries content text: only the type and
// pointers (who, which object, which community). To read, the person opens the object, and the reading obeys
// current visibility; when the pointer is null, the notice says "no longer available". Pure.

import { fmt, type Dictionary } from '../i18n-base'
import type { Notification, NotificationType } from '../social/types'

export interface Destination {
  /** path after /<lang>; null when there is nowhere to go */
  href: string | null
  /** the notice points to something that can no longer be read */
  indisponivel: boolean
}

const FROM_TOPIC: NotificationType[] = ['resposta-no-topico', 'resposta-a-voce', 'citacao', 'mencao', 'resolveu']
const FROM_COMMUNITY: NotificationType[] = ['convite-comunidade', 'pedido-de-entrada', 'entrada-aprovada', 'expulso', 'banido', 'posse-recebida', 'apelacao-recebida', 'apelacao-decidida']

/** The notice destination, given the handle of the person's rover and of the author (origin). */
export function noticeTarget(n: Pick<Notification, 'tipo' | 'objeto' | 'comunidade' | 'pagina' | 'origem'>, myHandle: string): Destination {
  const t = n.tipo
  if (t === 'recado') return { href: `/r/${myHandle}?aba=mural`, indisponivel: false }
  if (t === 'selo-recebido') return { href: `/r/${myHandle}`, indisponivel: false }
  if (t === 'pedido-de-amizade') return { href: '/amigos', indisponivel: false }
  if (t === 'amizade-aceita') return n.origem ? { href: `/r/${n.origem.handle}`, indisponivel: false } : { href: null, indisponivel: true }
  if (t === 'depoimento-para-aceitar') return { href: `/r/${myHandle}?aba=depoimentos`, indisponivel: false }
  if (t === 'depoimento-aceito') return n.origem ? { href: `/r/${n.origem.handle}?aba=depoimentos`, indisponivel: false } : { href: null, indisponivel: true }
  if (FROM_TOPIC.includes(t)) return n.objeto ? { href: `/t/${n.objeto}`, indisponivel: false } : { href: null, indisponivel: true }
  if (FROM_COMMUNITY.includes(t)) return n.comunidade ? { href: `/comunidades/${n.comunidade}`, indisponivel: false } : { href: null, indisponivel: true }
  if (t === 'novo-seguidor') return n.pagina ? { href: `/paginas/${n.pagina}`, indisponivel: false } : { href: null, indisponivel: true }
  // 0.4.0: the conversation notice leads to the messages; the request and the messages are only read there, with the app key
  if (t === 'conversa-pedido' || t === 'conversa-aceita') return { href: '/mensagens', indisponivel: false }
  if (t === 'removido-por-responsavel') return n.comunidade ? { href: `/comunidades/${n.comunidade}`, indisponivel: false } : n.pagina ? { href: `/paginas/${n.pagina}`, indisponivel: false } : { href: null, indisponivel: false }
  return { href: null, indisponivel: false }
}

/** Which notices have an action button right there. */
export type NoticeAction = 'amizade' | 'convite' | null
export function noticeAction(n: Pick<Notification, 'tipo' | 'origem' | 'comunidade'>): NoticeAction {
  if (n.tipo === 'pedido-de-amizade' && n.origem) return 'amizade'
  if (n.tipo === 'convite-comunidade' && n.comunidade) return 'convite'
  return null
}

/** New notices are the ones with a number greater than the last seen. */
export const isNewItem = (n: Pick<Notification, 'seq'>, seen: number): boolean => n.seq > seen

/** The notice sentence: who, what, where. No content: the notice only points. */
export function noticePhrase(n: Notification, d: Dictionary): string {
  const a = d.socAvisos
  const base = a.tipos[n.tipo]
  return fmt(base, {
    nome: n.origem?.nome ?? a.alguem,
    lugar: n.nomeDoLugar ?? (n.pagina && !n.comunidade ? a.pagina : a.lugar),
    topico: n.nomeDoTopico ?? a.topicoSem,
  })
}
