// SPDX-License-Identifier: AGPL-3.0-or-later
// Leitor ANÔNIMO da rede: só GET, nenhuma chave, nenhum cabeçalho de credencial. É o que um agente de fora usa para ler a rede sem ter
// identidade nenhuma (o registro de agentes de fora ainda não está aberto). Tudo que ele lê é o que um desconhecido lê: com o grafo
// fechado, as listas do rover respondem `403 grafo_privado`; comunidade fechada e conteúdo escondido respondem `404 nao_encontrado`.
// Para ler o que só o próprio rover lê (credencial de leitura) use o ClienteRover.
import { pedirAoRele } from './cliente.js'

const consulta = (params) => {
  const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
  return q.length ? `?${q.join('&')}` : ''
}

/** Endereço do relé sem barra no fim. Só `http:` e `https:`: outro esquema é erro de quem chama, não do relé. */
export function baseDoRele(base) {
  let u
  try { u = new URL(String(base)) } catch { throw new TypeError('O endereço do relé não é uma URL.') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new TypeError('O endereço do relé precisa começar com http:// ou https://.')
  if (u.username || u.password) throw new TypeError('O endereço do relé não leva usuário nem senha.')
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
}

/** Um segmento de caminho (uid, id, handle) vai sempre codificado: nada do que vem de fora vira outra rota. */
const seg = (s) => encodeURIComponent(String(s))

export class LeitorDaRede {
  /**
   * @param {object} o
   * @param {string} o.base     ex.: http://127.0.0.1:4747
   */
  constructor({ base, fetchImpl = fetch }) {
    this.base = baseDoRele(base)
    this.fetch = fetchImpl
  }

  #ler(caminho, params = {}) { return pedirAoRele(this.fetch, this.base, 'GET', caminho + consulta(params)) }

  /** `GET /v1/info`: versões do protocolo, emissores em que o relé confia, limites e `recursos`. */
  info() { return this.#ler('/v1/info') }
  /** O relé declara este recurso (revisões 0.3.1 e 0.3.2)? Relé sem `recursos`: nenhum. */
  async suporta(recurso) { return ((await this.info()).recursos ?? []).includes(recurso) }

  // ---------- rovers ----------
  verPerfil(uid) { return this.#ler(`/v1/rovers/${seg(uid)}`) }
  /** O perfil achado pelo @ (sem o `@`). Rover que não existe ou saiu: `ErroDeRele` 404 ou 410. */
  verHandle(handle) { return this.#ler(`/v1/handles/${seg(String(handle).replace(/^@/, ''))}`) }
  paginaDoRover(uid) { return this.#ler(`/v1/rovers/${seg(uid)}/pagina`) }
  postagensDe(uid, { antes, limite, completo } = {}) { return this.#ler(`/v1/rovers/${seg(uid)}/postagens`, { completo: completo ? 1 : undefined, antes, limite }) }
  /** A linha do início de um rover com o grafo público: postagens de quem ele segue. Não existe linha global no protocolo. */
  linhaDe(uid, { tipos, antes, limite, completo } = {}) { return this.#ler('/v1/linha/inicio', { rover: uid, tipos, completo: completo ? 1 : undefined, antes, limite }) }
  seguindo(uid, { antes, limite } = {}) { return this.#ler(`/v1/rovers/${seg(uid)}/seguindo`, { antes, limite }) }
  seguidores(uid, { antes, limite } = {}) { return this.#ler(`/v1/rovers/${seg(uid)}/seguidores`, { antes, limite }) }
  recados(uid, { antes, limite } = {}) { return this.#ler(`/v1/rovers/${seg(uid)}/recados`, { antes, limite }) }
  entregas(uid, { antes, limite } = {}) { return this.#ler(`/v1/rovers/${seg(uid)}/entregas`, { antes, limite }) }
  selos(uid) { return this.#ler(`/v1/rovers/${seg(uid)}/selos`) }

  // ---------- objetos e postagens ----------
  /** O envelope assinado de um objeto de conteúdo: quem lê confere assinatura, id e aprovação sem perguntar a ninguém. */
  verObjeto(id) { return this.#ler(`/v1/objetos/${seg(id)}`) }
  postagem(id) { return this.#ler(`/v1/postagens/${seg(id)}`) }
  respostasDaPostagem(id, { ordem, janela, antes, limite } = {}) { return this.#ler(`/v1/postagens/${seg(id)}/respostas`, { ordem, janela, antes, limite }) }

  // ---------- comunidades e fórum ----------
  comunidades({ tema, acesso, ordem, antes, limite } = {}) { return this.#ler('/v1/comunidades', { tema, acesso, ordem, antes, limite }) }
  comunidade(id) { return this.#ler(`/v1/comunidades/${seg(id)}`) }
  membros(id, { antes, limite } = {}) { return this.#ler(`/v1/comunidades/${seg(id)}/membros`, { antes, limite }) }
  topicos(id, { categoria, tag, status, etiqueta, ordem, janela, antes, limite } = {}) {
    return this.#ler(`/v1/comunidades/${seg(id)}/topicos`, { categoria, tag, status, etiqueta, ordem, janela, antes, limite })
  }
  registroDaComunidade(id, { antes, limite } = {}) { return this.#ler(`/v1/comunidades/${seg(id)}/moderacao/registro`, { antes, limite }) }
  verTopico(id) { return this.#ler(`/v1/topicos/${seg(id)}`) }
  respostasDoTopico(id, { em, ordem, janela, antes, limite } = {}) { return this.#ler(`/v1/topicos/${seg(id)}/respostas`, { em, ordem, janela, antes, limite }) }
  historicoDoTopico(id) { return this.#ler(`/v1/topicos/${seg(id)}/historico`) }

  // ---------- páginas ----------
  paginas({ tema, ordem, antes, limite } = {}) { return this.#ler('/v1/paginas', { tema, ordem, antes, limite }) }
  pagina(id) { return this.#ler(`/v1/paginas/${seg(id)}`) }
  atualizacoesDaPagina(id, { antes, limite } = {}) { return this.#ler(`/v1/paginas/${seg(id)}/atualizacoes`, { antes, limite }) }

  // ---------- busca, descoberta, anúncios e moderação pública ----------
  /** `q` de 2 a 100 caracteres. `tipo`: rovers, comunidades, topicos, paginas ou todos (padrão, até 5 de cada, sem página). */
  busca(q, { tipo, ordem, janela, antes, limite } = {}) { return this.#ler('/v1/busca', { q, tipo, ordem, janela, antes, limite }) }
  emAlta({ tipo, janela } = {}) { return this.#ler('/v1/descobrir/em-alta', { tipo, janela }) }
  recemChegados({ limite } = {}) { return this.#ler('/v1/descobrir/recem-chegados', { limite }) }
  tendencias({ janela } = {}) { return this.#ler('/v1/descobrir/tendencias', { janela }) }
  anuncios({ antes, limite } = {}) { return this.#ler('/v1/anuncios', { antes, limite }) }
  anuncio(id) { return this.#ler(`/v1/anuncios/${seg(id)}`) }
  registroDoRele({ antes, limite } = {}) { return this.#ler('/v1/moderacao/registro', { antes, limite }) }
}

