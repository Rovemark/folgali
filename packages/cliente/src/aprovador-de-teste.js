// SPDX-License-Identifier: AGPL-3.0-or-later
// Aprovador SÓ PARA TESTE: assina sem perguntar a ninguém. No Rover Hangar quem aprova é uma pessoa, olhando o texto.
import { criarAprovacaoHumana, imagemConfereComObjeto } from '../../protocolo/src/index.js'

export class AprovadorDeTeste {
  constructor({ chavePrivadaDeAprovacao, relogio = () => Math.floor(Date.now() / 1000), validadeS = 300, aprovar = true }) {
    this.chave = chavePrivadaDeAprovacao
    this.relogio = relogio
    this.validadeS = validadeS
    this.aprovando = aprovar
    this.vistos = [] // o que a "pessoa" viu: permite ao teste conferir que o texto exato foi mostrado
    this.imagensVistas = [] // 0.5.0: os bytes de cada imagem que a "pessoa" viu, junto do id do objeto
  }

  async aprovar(objeto, extra = {}) {
    this.vistos.push(objeto)
    if (objeto.tipo === 'imagem') {
      // como o app de verdade: só aprova imagem se tem os bytes exatos que o objeto cita
      if (imagemConfereComObjeto(extra.imagem, objeto) !== null) return null
      this.imagensVistas.push({ id: objeto.id, bytes: extra.imagem, alt: objeto.corpo.alt })
    }
    if (!this.aprovando) return null
    return criarAprovacaoHumana({
      chavePrivadaDeAprovacao: this.chave, objeto: objeto.id, autor: objeto.autor, aprovadoEm: Math.max(this.relogio(), objeto.criadoEm), validadeS: this.validadeS
    })
  }
}
