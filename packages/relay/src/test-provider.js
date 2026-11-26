// SPDX-License-Identifier: AGPL-3.0-or-later
// Provider ONLY FOR TESTING AND DEMOS: generates an issuer key on the spot and knows how to issue attestations.
// Never use it outside tests: whoever holds this object issues handles for anyone.
import { createHandleAttestation, generateKeyPair } from '../../protocol/src/index.js'
import { StaticProvider } from './provider.js'

export class TestProvider extends StaticProvider {
  constructor({ revogados: revoked = [] } = {}) {
    const pair = generateKeyPair()
    super({ emissores: [pair.publicKey], revogados: revoked, nome: 'teste' })
    this.publicKey = pair.publicKey
    this._privateKey = pair.chavePrivada
  }

  issue({ uid, handle, chave: key, chaveAprovacao: approvalKey, emitidoEm: issuedAt, validadeS: validityS = 30 * 86400 }) {
    return createHandleAttestation({
      issuerPrivateKey: this._privateKey,
      emissor: this.publicKey,
      uid, handle, chave: key, chaveAprovacao: approvalKey, emitidoEm: issuedAt, expiraEm: issuedAt + validityS
    })
  }
}
