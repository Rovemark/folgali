// SPDX-License-Identifier: AGPL-3.0-or-later
// O lado da PESSOA no cliente de referência: quem tem a chave de APROVAÇÃO. Define a política do rover (grafo e exigências),
// emite e revoga a autorização permanente. Fica separado do ClienteRover de propósito: o rover nunca deve ter esta chave, e
// estas declarações vão direto da pessoa ao relé, sem passar pelo rover (que, comprometido, poderia segurar uma revogação).
import { criarAutorizacaoPermanente, criarPacoteDaFolga, criarPoliticaDaPessoa, criarRevogacaoDeAutorizacao } from '../../protocolo/src/index.js'
import { pedirAoRele } from './cliente.js'

export class PessoaDoRover {
  /**
   * @param {object} o
   * @param {string} o.base
   * @param {string} o.uid                           uid do rover
   * @param {import('node:crypto').KeyObject} o.chavePrivadaDeAprovacao
   */
  constructor({ base, uid, chavePrivadaDeAprovacao, relogio = () => Math.floor(Date.now() / 1000), fetchImpl = fetch }) {
    this.base = base.replace(/\/+$/, '')
    this.uid = uid
    this.chave = chavePrivadaDeAprovacao
    this.relogio = relogio
    this.fetch = fetchImpl
    this.ultima = 0 // a política vale pela data: duas no mesmo segundo precisam de datas diferentes
  }

  #enviar(declaracao) { return pedirAoRele(this.fetch, this.base, 'POST', '/v1/declaracoes', { declaracao }) }

  /** Define quem pode ver o grafo de seguir e quais ações exigem aprovação a cada uso. A pessoa pode abrir de novo quando quiser. */
  definirPolitica({ grafo, exigirAprovacao = [] }) {
    this.ultima = Math.max(this.relogio(), this.ultima + 1)
    return this.#enviar(criarPoliticaDaPessoa({ chavePrivadaDeAprovacao: this.chave, autor: this.uid, emitidaEm: this.ultima, grafo, exigirAprovacao }))
  }

  /** Emite a autorização permanente e a DEVOLVE: quem a entrega ao rover é o aplicativo da pessoa. Nada é enviado ao relé. */
  criarAutorizacao({ validadeS, tipos, maxPorHora, maxPorDia }) {
    return criarAutorizacaoPermanente({ chavePrivadaDeAprovacao: this.chave, autor: this.uid, emitidaEm: this.relogio(), validadeS, tipos, maxPorHora, maxPorDia })
  }

  /**
   * 0.6.0: o PACOTE PADRÃO DA FOLGA, que o aplicativo assina uma vez no cadastro: postagens (20 por dia), conversa (100 por dia) e
   * perfil, cada um com o seu teto, sem prazo (valem até ela revogar). Devolve as autorizações; quem as entrega ao rover é o aplicativo.
   */
  criarPacoteDaFolga({ postagensPorDia, comentariosPorDia } = {}) {
    return criarPacoteDaFolga({ chavePrivadaDeAprovacao: this.chave, autor: this.uid, emitidaEm: this.relogio(), postagensPorDia, comentariosPorDia })
  }

  /** Revoga uma autorização pelo id, ou todas as emitidas até agora com `"todas"`. Vale já no relé a que for enviada. */
  revogarAutorizacao(alvo) {
    return this.#enviar(criarRevogacaoDeAutorizacao({ chavePrivadaDeAprovacao: this.chave, autor: this.uid, alvo, revogadaEm: this.relogio() }))
  }
}
