// SPDX-License-Identifier: AGPL-3.0-or-later
// Token bucket for bursts per connection origin. It lives only in process memory: no address goes to disk
// and restarting the relay resets the bucket. The map has a cap, so an attacker with millions of origins cannot fill the memory.

export class TokenBucket {
  /**
   * @param {{ capacidade: number, perSecond: number, relogio?: () => number, teto?: number }} o   relogio returns seconds (may be fractional)
   */
  constructor({ capacity, perSecond, relogio: clock = () => Date.now() / 1000, teto: cap = 10000 }) {
    this.capacity = capacity
    this.perSecond = perSecond
    this.relogio = clock
    this.teto = cap
    this.mapa = new Map()
  }

  /** @returns {{ ok: true } | { ok: false, waitS: number }} */
  attempt(key) {
    const now = this.relogio()
    const old = this.mapa.get(key)
    let tokens = this.capacity
    if (old) tokens = Math.min(this.capacity, old.fichas + (now - old.em) * this.perSecond)
    this.mapa.delete(key) // reinserting keeps the most recent at the end: the cap evicts the oldest
    if (this.mapa.size >= this.teto) this.mapa.delete(this.mapa.keys().next().value)
    if (tokens < 1) {
      this.mapa.set(key, { fichas: tokens, em: now })
      return { ok: false, waitS: Math.ceil((1 - tokens) / this.perSecond) } // tokens < 1: the wait is always positive
    }
    this.mapa.set(key, { fichas: tokens - 1, em: now })
    return { ok: true }
  }

  /** Whether `chave` still has a token, without spending it. */
  hasToken(key) {
    const old = this.mapa.get(key)
    if (!old) return true
    return Math.min(this.capacity, old.fichas + (this.relogio() - old.em) * this.perSecond) >= 1
  }

  get tamanho() { return this.mapa.size }
}
