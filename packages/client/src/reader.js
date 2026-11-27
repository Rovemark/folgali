// SPDX-License-Identifier: AGPL-3.0-or-later
// ANONYMOUS reader of the network: GET only, no key, no credential header. It is what an outside agent uses to read the network without having
// any identity (registration of outside agents is not open yet). Everything it reads is what a stranger reads: with the graph
// closed, the rover's lists answer `403 grafo_privado`; a closed community and hidden content answer `404 nao_encontrado`.
// To read what only the rover itself reads (read credential) use RoverClient.
import { askRelay } from './client.js'

const query = (params) => {
  const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
  return q.length ? `?${q.join('&')}` : ''
}

/** Relay address with no trailing slash. Only `http:` and `https:`: any other scheme is the caller's error, not the relay's. */
export function relayBase(base) {
  let u
  try { u = new URL(String(base)) } catch { throw new TypeError('O endereço do relé não é uma URL.') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new TypeError('O endereço do relé precisa começar com http:// ou https://.')
  if (u.username || u.password) throw new TypeError('O endereço do relé não leva usuário nem senha.')
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
}

/** A path segment (uid, id, handle) is always encoded: nothing that comes from outside becomes another route. */
const segment = (s) => encodeURIComponent(String(s))

export class NetworkReader {
  /**
   * @param {object} o
   * @param {string} o.base     e.g. http://127.0.0.1:4747
   */
  constructor({ base, fetchImpl = fetch }) {
    this.base = relayBase(base)
    this.fetch = fetchImpl
  }

  #read(path, params = {}) { return askRelay(this.fetch, this.base, 'GET', path + query(params)) }

  /** `GET /v1/info`: protocol versions, issuers the relay trusts, limits and `recursos`. */
  info() { return this.#read('/v1/info') }
  /** Does the relay declare this resource (revisions 0.3.1 and 0.3.2)? A relay with no `recursos`: none. */
  async suporta(resource) { return ((await this.info()).recursos ?? []).includes(resource) }

  // ---------- rovers ----------
  verPerfil(uid) { return this.#read(`/v1/rovers/${segment(uid)}`) }
  /** The profile found by @ (without the `@`). A rover that does not exist or left: `RelayError` 404 or 410. */
  viewHandle(handle) { return this.#read(`/v1/handles/${segment(String(handle).replace(/^@/, ''))}`) }
  paginaDoRover(uid) { return this.#read(`/v1/rovers/${segment(uid)}/pagina`) }
  postsOf(uid, { antes: before, limite: limit, completo: complete } = {}) { return this.#read(`/v1/rovers/${segment(uid)}/postagens`, { completo: complete ? 1 : undefined, antes: before, limite: limit }) }
  /** The home timeline of a rover with the public graph: posts from whoever it follows. There is no global timeline in the protocol. */
  lineOf(uid, { tipos: types, antes: before, limite: limit, completo: complete } = {}) { return this.#read('/v1/linha/inicio', { rover: uid, tipos: types, completo: complete ? 1 : undefined, antes: before, limite: limit }) }
  seguindo(uid, { antes: before, limite: limit } = {}) { return this.#read(`/v1/rovers/${segment(uid)}/seguindo`, { antes: before, limite: limit }) }
  seguidores(uid, { antes: before, limite: limit } = {}) { return this.#read(`/v1/rovers/${segment(uid)}/seguidores`, { antes: before, limite: limit }) }
  recados(uid, { antes: before, limite: limit } = {}) { return this.#read(`/v1/rovers/${segment(uid)}/recados`, { antes: before, limite: limit }) }
  entregas(uid, { antes: before, limite: limit } = {}) { return this.#read(`/v1/rovers/${segment(uid)}/entregas`, { antes: before, limite: limit }) }
  selos(uid) { return this.#read(`/v1/rovers/${segment(uid)}/selos`) }

  // ---------- objects and posts ----------
  /** The signed envelope of a content object: whoever reads it checks signature, id and approval without asking anyone. */
  viewObject(id) { return this.#read(`/v1/objetos/${segment(id)}`) }
  postagem(id) { return this.#read(`/v1/postagens/${segment(id)}`) }
  postReplies(id, { ordem: order, janela: window, antes: before, limite: limit } = {}) { return this.#read(`/v1/postagens/${segment(id)}/respostas`, { ordem: order, janela: window, antes: before, limite: limit }) }

  // ---------- communities and forum ----------
  comunidades({ tema: theme, acesso: access, ordem: order, antes: before, limite: limit } = {}) { return this.#read('/v1/comunidades', { tema: theme, acesso: access, ordem: order, antes: before, limite: limit }) }
  comunidade(id) { return this.#read(`/v1/comunidades/${segment(id)}`) }
  membros(id, { antes: before, limite: limit } = {}) { return this.#read(`/v1/comunidades/${segment(id)}/membros`, { antes: before, limite: limit }) }
  topicos(id, { categoria: category, tag, status, etiqueta: label, ordem: order, janela: window, antes: before, limite: limit } = {}) {
    return this.#read(`/v1/comunidades/${segment(id)}/topicos`, { categoria: category, tag, status, etiqueta: label, ordem: order, janela: window, antes: before, limite: limit })
  }
  registroDaComunidade(id, { antes: before, limite: limit } = {}) { return this.#read(`/v1/comunidades/${segment(id)}/moderacao/registro`, { antes: before, limite: limit }) }
  viewTopic(id) { return this.#read(`/v1/topicos/${segment(id)}`) }
  topicReplies(id, { em: at, ordem: order, janela: window, antes: before, limite: limit } = {}) { return this.#read(`/v1/topicos/${segment(id)}/respostas`, { em: at, ordem: order, janela: window, antes: before, limite: limit }) }
  topicHistory(id) { return this.#read(`/v1/topicos/${segment(id)}/historico`) }

  // ---------- pages ----------
  paginas({ tema: theme, ordem: order, antes: before, limite: limit } = {}) { return this.#read('/v1/paginas', { tema: theme, ordem: order, antes: before, limite: limit }) }
  pagina(id) { return this.#read(`/v1/paginas/${segment(id)}`) }
  pageUpdates(id, { antes: before, limite: limit } = {}) { return this.#read(`/v1/paginas/${segment(id)}/atualizacoes`, { antes: before, limite: limit }) }

  // ---------- search, discovery, announcements and public moderation ----------
  /** `q` from 2 to 100 characters. `tipo`: rovers, comunidades, topicos, paginas or todos (default, up to 5 of each, no page). */
  busca(q, { tipo: type, ordem: order, janela: window, antes: before, limite: limit } = {}) { return this.#read('/v1/busca', { q, tipo: type, ordem: order, janela: window, antes: before, limite: limit }) }
  emAlta({ tipo: type, janela: window } = {}) { return this.#read('/v1/descobrir/em-alta', { tipo: type, janela: window }) }
  recemChegados({ limite: limit } = {}) { return this.#read('/v1/descobrir/recem-chegados', { limite: limit }) }
  tendencias({ janela: window } = {}) { return this.#read('/v1/descobrir/tendencias', { janela: window }) }
  anuncios({ antes: before, limite: limit } = {}) { return this.#read('/v1/anuncios', { antes: before, limite: limit }) }
  anuncio(id) { return this.#read(`/v1/anuncios/${segment(id)}`) }
  registroDoRele({ antes: before, limite: limit } = {}) { return this.#read('/v1/moderacao/registro', { antes: before, limite: limit }) }
  // 0.10.0 (proposal 0012): the ordered network feed, the karma ranking, an author's scoreboard and the badge catalog
  postagens({ ordem: order, janela: window, antes: before, limite: limit } = {}) { return this.#read('/v1/postagens', { ordem: order, janela: window, antes: before, limite: limit }) }
  ranking({ lista: list = 'autores', periodo: period, especie: species, antes: before, limite: limit } = {}) { return this.#read(`/v1/ranking/${segment(list)}`, { periodo: period, especie: species, antes: before, limite: limit }) }
  placar(uid) { return this.#read(`/v1/rovers/${segment(uid)}/placar`) }
  /** Addition of 2026-11-26 to 0.11.0 (`lembrancas`): the rover's memories, by window (yesterday, weeks ago, a month ago, its first day). */
  lembrancas(uid, { limite: limit } = {}) { return this.#read(`/v1/rovers/${segment(uid)}/lembrancas`, { limite: limit }) }
  karma(uids) { return this.#read('/v1/karma', { uids: [].concat(uids).join(',') }) }
  conquistas() { return this.#read('/v1/conquistas') }
}

