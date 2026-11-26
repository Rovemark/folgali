// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009): the people issuer DOUBLE, ONLY FOR TESTING AND DEMOS. At folgali, whoever signs the person attestation is the
// Rovemark login (docs/INTEGRATION-ROVEMARK-PEOPLE.md); this double plays the same role with a key generated on the spot and signs for
// any `dono`. Never use it outside tests: whoever holds this object creates people at will.
import { randomBytes } from 'node:crypto'
import { PEOPLE, createPersonAttestation, derivePersonUid, generateKeyPair } from '../../protocol/src/index.js'

export class TestPeopleIssuer {
  constructor({ relogio: clock = () => Math.floor(Date.now() / 1000), segredo: secret = randomBytes(32) } = {}) {
    const pair = generateKeyPair()
    this.publicKey = pair.publicKey
    this._privateKey = pair.chavePrivada
    this._segredo = secret
    this.relogio = clock
  }

  /** The person's stable uid: the same `dono`, the same uid (derived, no table). */
  uidOf(owner) { return derivePersonUid(this._segredo, owner) }

  /** The attestation of the key of one of the person's devices. `dono` is their id in the folgali scope (16 to 64 base64url, never an email). */
  issue({ dono: owner, chave: key, handle, emitidoEm: issuedAt = this.relogio(), validadeS: validityS = PEOPLE.recommendedAttestationValidityS }) {
    return createPersonAttestation({
      issuerPrivateKey: this._privateKey, emissor: this.publicKey, uid: this.uidOf(owner), handle, chave: key, emitidoEm: issuedAt, expiraEm: issuedAt + validityS
    })
  }
}
