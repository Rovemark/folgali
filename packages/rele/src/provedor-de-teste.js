// SPDX-License-Identifier: AGPL-3.0-or-later
// Provedor SÓ PARA TESTE E DEMONSTRAÇÃO: gera uma chave de emissor na hora e sabe emitir atestados.
// Nunca use fora de teste: quem tem este objeto emite handle para qualquer um.
import { criarAtestadoDeHandle, gerarParDeChaves } from '../../protocolo/src/index.js'
import { ProvedorEstatico } from './provedor.js'

export class ProvedorDeTeste extends ProvedorEstatico {
  constructor({ revogados = [] } = {}) {
    const par = gerarParDeChaves()
    super({ emissores: [par.chavePublica], revogados, nome: 'teste' })
    this.chavePublica = par.chavePublica
    this._chavePrivada = par.chavePrivada
  }

  emitir({ uid, handle, chave, chaveAprovacao, emitidoEm, validadeS = 30 * 86400 }) {
    return criarAtestadoDeHandle({
      chavePrivadaDoEmissor: this._chavePrivada,
      emissor: this.chavePublica,
      uid, handle, chave, chaveAprovacao, emitidoEm, expiraEm: emitidoEm + validadeS
    })
  }
}
