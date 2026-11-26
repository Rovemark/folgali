// SPDX-License-Identifier: AGPL-3.0-or-later
// Helpers for the social network tests (0.3): a world with shortcuts for each gesture, so the test says only what matters.
import { ID_RE } from '../../packages/protocol/src/index.js'
import { credentialOf, codeOf, DAY, errorOf, newWorld, publish, registeredRover } from './test-relay.js'

export { DAY, codeOf, errorOf }

/** Credential in the format the relay read routes receive (without HTTP): `{ cabecalho, metodo, alvo }`. */
export const as = (m, rover, target = '/v1/x') => ({ header: credentialOf(m, rover, target), metodo: 'GET', alvo: target })

export function fresh(options = {}) {
  const m = newWorld(options)
  const relay = m.rele
  const s = relay.social
  const rover = (o = {}) => registeredRover(m, o)
  /** Makes the rover publish an object. Human approval comes on its own for the types that require it. */
  const does = (r, type, body, o) => publish(m, r, type, body, o)
  const ok = (r, type, body, o) => {
    const x = does(r, type, body, o)
    if (x.estado !== 'aceito') throw new Error(`esperava aceito, veio ${x.estado}`)
    return x
  }
  const code = (r, type, body, o) => codeOf(() => does(r, type, body, o))

  /** Two rovers who have been friends for `dias` days. */
  const friends = (a, b, days = 8) => {
    ok(a, 'amizade', { alvo: b.uid, acao: 'pedir' })
    ok(b, 'amizade', { alvo: a.uid, acao: 'aceitar' })
    if (days) m.advance(days * DAY)
  }

  /** Creates a community and returns the id (which is the id of the creation object). */
  const community = (owner, { nome: name = `Comunidade ${Math.random().toString(36).slice(2, 8)}`, acesso: access = 'aberta', categorias: categories = [], tema: theme = 'rovers', descricao: description = 'Um lugar', regras: rules = 'Seja gentil.' } = {}) =>
    ok(owner, 'comunidade-criar', { nome: name, descricao: description, regras: rules, tema: theme, acesso: access, categorias: categories }).id

  /** Joins an open community and waits out the topic waiting period (1 hour). */
  const joins = (r, using, { wait = true } = {}) => {
    ok(r, 'comunidade-adesao', { comunidade: using, acao: 'entrar' })
    if (wait) m.advance(3601)
  }

  const topic = (author, using, { titulo: title = 'Como vocês fazem isso?', texto: text = 'Queria ouvir a experiência de vocês.', tags = [], categoria: category = null, enquete: poll = null } = {}) =>
    ok(author, 'topico', { comunidade: using, categoria: category, titulo: title, texto: text, tags, enquete: poll }).id

  const replies = (author, t, text = 'Eu faço assim.', { em: at = null, cita: quotes = null } = {}) =>
    ok(author, 'resposta-forum', { topico: t, em: at, cita: quotes, texto: text }).id

  const management = (mod, using, target, action, reason = null) => ok(mod, 'comunidade-gestao', { comunidade: using, alvo: target.uid, acao: action, motivo: reason })

  return { m, rele: relay, s, rover, does, ok, code, amigos: friends, comunidade: community, entra: joins, topico: topic, replies, gestao: management, advance: m.advance, como: (r, target) => as(m, r, target) }
}

export const isId = (x) => ID_RE.test(x)
