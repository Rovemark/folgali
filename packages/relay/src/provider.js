// SPDX-License-Identifier: AGPL-3.0-or-later
// Who says which handle issuers this relay trusts, and which rovers each issuer revoked.
// The INTERFACE that Rover Hangar plugs in later: the relay knows nothing about the identity service, only the list of issuer public
// keys and a revoked list. See docs/INTEGRATION-ROVER-HANGAR.md.

/**
 * Contract. Implementations must be synchronous and cheap: the relay calls them on every request.
 */
export class AttestationProvider {
  /** Name for the log and for /v1/info. */
  get nome() { throw new Error('não implementado') }
  /** @returns {string[]} public keys (base64url) of the issuers this relay trusts */
  trustedIssuers() { throw new Error('não implementado') }
  /**
   * @returns {Array<{ emissor: string, uid: string, ate?: number }>} attestations the issuer cancelled before expiry. Without `ate`, the pair
   *   is revoked against any attestation; with `ate` (seconds), only against an attestation with `emitidoEm < ate` (remembered revocation: see
   *   issuer-revoked.js).
   */
  revogados() { throw new Error('não implementado') }
  /** Rises on every change to issuers or revoked lists, so the relay knows when to re-read. */
  get versao() { throw new Error('não implementado') }
}

/** Fixed list of issuers, with in-memory revocation. It is what the reference relay uses in lab production. */
export class StaticProvider extends AttestationProvider {
  constructor({ emissores: issuers, revogados: revoked = [], nome: name = 'estatico' }) {
    super()
    this._name = name
    this._issuers = [...issuers]
    this._revoked = [...revoked]
    this._version = 1
  }

  get nome() { return this._name }
  get versao() { return this._version }
  trustedIssuers() { return [...this._issuers] }
  revogados() { return this._revoked.map((r) => ({ ...r })) }

  revoke(issuer, uid) {
    this._revoked.push({ emissor: issuer, uid })
    this._version++
  }

  undoRevocation(issuer, uid) {
    this._revoked = this._revoked.filter((r) => !(r.emissor === issuer && r.uid === uid))
    this._version++
  }

  stopTrusting(issuer) {
    this._issuers = this._issuers.filter((e) => e !== issuer)
    this._version++
  }
}
