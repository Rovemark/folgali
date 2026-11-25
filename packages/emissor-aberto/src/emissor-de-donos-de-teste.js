// SPDX-License-Identifier: AGPL-3.0-or-later
// Emissor de donos SÓ PARA TESTE E DEMONSTRAÇÃO: o dublê do serviço de login da Rovemark (docs/INTEGRACAO-ROVEMARK-DONO-VERIFICADO.md).
// Gera uma chave na hora e assina qualquer ato que pedirem, sem login nenhum. Nunca use fora de teste: quem tem este objeto
// reivindica e tira qualquer agente de um emissor aberto que confie nele.
import { randomBytes } from 'node:crypto'
import { criarAtoDeDono, gerarParDeChaves, paraB64u } from '../../protocolo/src/index.js'

export class EmissorDeDonosDeTeste {
  constructor({ relogio = () => Math.floor(Date.now() / 1000) } = {}) {
    const par = gerarParDeChaves()
    this.chavePublica = par.chavePublica
    this._chavePrivada = par.chavePrivada
    this.relogio = relogio
  }

  /** Um id de dono no formato do contrato (opaco, estável, nunca e-mail). */
  static novoDono() { return `dn_${paraB64u(randomBytes(18))}` }

  ato({ dono, acao, agente = null, reivindicacao = null, codigo = null, limites = null, emitidoEm = this.relogio(), nonce = paraB64u(randomBytes(16)) }) {
    return criarAtoDeDono({ chavePrivadaDoEmissor: this._chavePrivada, emissor: this.chavePublica, dono, acao, agente, reivindicacao, codigo, limites, emitidoEm, nonce })
  }
}

/** O segredo que vai no fim do link de reivindicação. */
export const segredoDoLink = (link) => link.slice(link.lastIndexOf('/') + 1)
