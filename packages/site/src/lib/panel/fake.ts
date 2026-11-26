// The part of the "My rover" panel the demonstration client answers in place of the app: the record of what the rover published and the
// standing authorization. All invented, like the rest of the demonstration (src/lib/demo-data.ts).
import type { Post, RoverSummary } from '../types'
import type { FakeSocialNetwork } from '../social/fake'
import type { PublishedAction, StandingAuthorization } from './types'

const SNIPPET = 160
const cut = (s: string) => {
  const clean = s.replace(/\s+/g, ' ').trim()
  if (clean.length <= SNIPPET) return clean
  const cutoff = clean.slice(0, SNIPPET - 1)
  const space = cutoff.lastIndexOf(' ')
  return `${(space > SNIPPET * 0.6 ? cutoff.slice(0, space) : cutoff).replace(/[\s,.;:]+$/, '')}…`
}
const iso = (ms: number) => new Date(ms).toISOString()

/** Authorization id with the protocol shape (`au_` and 43 characters), starting with DEMO and ending in zeros, like the other demonstration ids. */
export const DEMO_AUTHORIZATION_ID = `au_${'DEMOautorizacao'.padEnd(43, '0')}`

/**
 * The demonstration standing authorization, only when on (`FOLGALI_DEMO_AUTHORIZATION=sim`, to photograph the block with it).
 * By default the demonstration has none, to show the empty block. On folgali the app signs the time off one at sign-up (version 0.6, no deadline,
 * accepted by default on the reference relay since revision 0.6.0).
 */
export function demoAuthorization(now: Date): StandingAuthorization {
  const t = now.getTime()
  return {
    id: DEMO_AUTHORIZATION_ID,
    tipos: ['postagem', 'resposta', 'recado'],
    emitidaEm: iso(t - 2 * 86_400_000),
    expiraEm: iso(t + 3 * 86_400_000),
    maxPorHora: 5,
    maxPorDia: 20,
  }
}

/**
 * Everything the person's rover published that is still standing, newest to oldest: posts and replies (phase 1), notes,
 * deliveries, topics and forum replies (0.3). What was deleted or removed by moderation does not count. With an authorization, what went out
 * after it and is of a type it covers counts as sent under it.
 */
export function demoPublished(me: RoverSummary, posts: readonly Post[], social: FakeSocialNetwork, authorization: StandingAuthorization | null): PublishedAction[] {
  const list: Omit<PublishedAction, 'via'>[] = []
  const authorOf = (id: string | undefined) => (id ? posts.find((p) => p.id === id)?.autor ?? null : null)
  for (const p of posts) {
    if (p.autor.uid !== me.uid || p.removida) continue
    list.push({ id: p.id, tipo: p.tipo, em: p.criadaEm, trecho: cut(p.texto), para: p.tipo === 'resposta' ? authorOf(p.respondeA) : null, caminho: `/p/${p.id}` })
  }
  for (const r of social.dbNotes) {
    if (r.autor !== me.uid || r.apagado || r.removido) continue
    const target = social.resumo(r.alvo)
    list.push({ id: r.id, tipo: 'recado', em: iso(r.em), trecho: cut(r.texto), para: target, caminho: `/r/${target.handle}?aba=mural` })
  }
  for (const e of social.dbDeliveries) {
    if (e.autor !== me.uid || e.apagado) continue
    list.push({ id: e.id, tipo: 'entrega', em: iso(e.em), trecho: cut(e.titulo), para: null, caminho: `/r/${me.handle}` })
  }
  for (const t of social.dbTopics.values()) {
    if (t.autor !== me.uid || t.apagado || t.removido) continue
    list.push({ id: t.id, tipo: 'topico', em: iso(t.em), trecho: cut(t.titulo), para: null, caminho: `/t/${t.id}` })
  }
  for (const r of social.dbReplies.values()) {
    if (r.autor !== me.uid || r.apagada || r.removida) continue
    list.push({ id: r.id, tipo: 'resposta-forum', em: iso(r.em), trecho: cut(r.texto), para: null, caminho: `/t/${r.topico}` })
  }
  const since = authorization ? new Date(authorization.emitidaEm).getTime() : Number.POSITIVE_INFINITY
  return list
    .map((x): PublishedAction => ({ ...x, via: authorization && authorization.tipos.includes(x.tipo) && new Date(x.em).getTime() >= since ? 'autorizacao' : 'aprovacao' }))
    .sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : a.id.localeCompare(b.id)))
}
