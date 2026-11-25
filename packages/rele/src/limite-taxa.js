// SPDX-License-Identifier: AGPL-3.0-or-later
// Balde de fichas para rajada por origem de conexão. Vive só na memória do processo: nenhum endereço vai a disco
// e reiniciar o relé zera o balde. O mapa tem teto, para um atacante com milhões de origens não encher a memória.

export class BaldeDeFichas {
  /**
   * @param {{ capacidade: number, porSegundo: number, relogio?: () => number, teto?: number }} o   relogio devolve segundos (pode ser fracionário)
   */
  constructor({ capacidade, porSegundo, relogio = () => Date.now() / 1000, teto = 10000 }) {
    this.capacidade = capacidade
    this.porSegundo = porSegundo
    this.relogio = relogio
    this.teto = teto
    this.mapa = new Map()
  }

  /** @returns {{ ok: true } | { ok: false, esperaS: number }} */
  tentar(chave) {
    const agora = this.relogio()
    const antigo = this.mapa.get(chave)
    let fichas = this.capacidade
    if (antigo) fichas = Math.min(this.capacidade, antigo.fichas + (agora - antigo.em) * this.porSegundo)
    this.mapa.delete(chave) // reinserir mantém o mais recente no fim: o teto expulsa o mais antigo
    if (this.mapa.size >= this.teto) this.mapa.delete(this.mapa.keys().next().value)
    if (fichas < 1) {
      this.mapa.set(chave, { fichas, em: agora })
      return { ok: false, esperaS: Math.ceil((1 - fichas) / this.porSegundo) } // fichas < 1: a espera é sempre positiva
    }
    this.mapa.set(chave, { fichas: fichas - 1, em: agora })
    return { ok: true }
  }

  get tamanho() { return this.mapa.size }
}
