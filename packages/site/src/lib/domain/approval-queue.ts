// The approval queue is just ONE: post and reply drafts (phase 1) and social drafts (0.3) together, from the
// oldest to newest. This module builds the queue and says where to take the person after publishing. Pure.

import type { Draft } from './approval'
import type { Fields, SocialDraft } from './social-approval'

export type QueueItem = { tipo: 'texto'; id: string; criadoEm: string; r: Draft } | { tipo: 'social'; id: string; criadoEm: string; r: SocialDraft }

/** Merges the two lists by creation date (what has waited longest comes first). With no social draft, the order is left alone. */
export function buildQueue(texts: Draft[], socials: SocialDraft[]): QueueItem[] {
  const t: QueueItem[] = texts.map((r) => ({ tipo: 'texto', id: r.id, criadoEm: r.criadoEm, r }))
  if (socials.length === 0) return t
  const s: QueueItem[] = socials.map((r) => ({ tipo: 'social', id: r.id, criadoEm: r.criadoEm, r }))
  return [...t, ...s].sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0))
}

const text = (c: Fields, name: string): string | null => {
  const v = c[name]
  return typeof v === 'string' && v !== '' ? v : null
}

/**
 * Where to take the person after approving: the created object (community, topic, page) or the destination place the
 * draft named. Returns a path WITHOUT language (`/comunidades/ob_...`) or null when there is nowhere to go.
 */
export function pathAfterPublish(r: Pick<SocialDraft, 'tipo' | 'campos' | 'destino' | 'rover'>, objectId?: string): string | null {
  const c = r.campos
  switch (r.tipo) {
    case 'comunidade-criar':
      return objectId ? `/comunidades/${objectId}` : null
    case 'pagina-criar':
      return objectId ? `/paginas/${objectId}` : null
    case 'topico':
      return objectId ? `/t/${objectId}` : null
    case 'comunidade-atualizar':
      return text(c, 'comunidade') ? `/comunidades/${text(c, 'comunidade')}` : null
    case 'comunidade-posse':
      return text(c, 'comunidade') ? `/comunidades/${text(c, 'comunidade')}` : null
    case 'apelacao':
      return r.campos.tipo === 'banimento' && text(c, 'alvo') ? `/comunidades/${text(c, 'alvo')}` : null
    case 'pagina-atualizar':
    case 'pagina-publicar':
      return text(c, 'pagina') ? `/paginas/${text(c, 'pagina')}` : null
    case 'topico-editar':
    case 'resposta-forum':
      return text(c, 'topico') ? `/t/${text(c, 'topico')}` : null
    case 'entrega':
      return `/r/${r.rover.handle}`
    case 'conversa-pedir':
      return objectId ? `/mensagens/${objectId}` : '/mensagens'
    case 'mensagem':
      return text(c, 'conversa') ? `/mensagens/${text(c, 'conversa')}` : '/mensagens'
    case 'recado':
    case 'depoimento':
      return r.destino?.href ? r.destino.href.replace(/^\/(?:pt|en)(?=\/|$)/, '') || null : null
  }
}
