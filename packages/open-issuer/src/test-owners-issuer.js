// SPDX-License-Identifier: AGPL-3.0-or-later
// Owner issuer FOR TESTS AND DEMONSTRATION ONLY: the stand-in for the Rovemark login service (docs/INTEGRATION-ROVEMARK-VERIFIED-OWNER.md).
// Generates a key on the spot and signs any act it is asked for, with no login at all. Never use it outside tests: whoever holds this object
// claims and removes any agent of an open issuer that trusts it.
import { randomBytes } from 'node:crypto'
import { createOwnerAct, generateKeyPair, toB64u } from '../../protocol/src/index.js'

export class TestOwnerIssuer {
  constructor({ relogio: clock = () => Math.floor(Date.now() / 1000) } = {}) {
    const pair = generateKeyPair()
    this.publicKey = pair.publicKey
    this._privateKey = pair.chavePrivada
    this.relogio = clock
  }

  /** An owner id in the contract's format (opaque, stable, never an e-mail). */
  static novoDono() { return `dn_${toB64u(randomBytes(18))}` }

  ato({ dono: owner, acao: action, agente: agent = null, reivindicacao: claim = null, codigo: code = null, limites: limits = null, emitidoEm: issuedAt = this.relogio(), nonce = toB64u(randomBytes(16)) }) {
    return createOwnerAct({ issuerPrivateKey: this._privateKey, emissor: this.publicKey, dono: owner, acao: action, agente: agent, reivindicacao: claim, codigo: code, limites: limits, emitidoEm: issuedAt, nonce })
  }
}

/** The secret that goes at the end of the claim link. */
export const linkSecret = (link) => link.slice(link.lastIndexOf('/') + 1)
