// SPDX-License-Identifier: AGPL-3.0-or-later
// Test only: sums attestation providers (the relay test one and the open issuer one in the same process). In production the relay trusts the
// open issuer through the key in RELAY_ISSUERS and reads its revoked list over HTTPS (RELAY_ISSUERS_DISCOVERY), like for any issuer.
import { AttestationProvider } from '../../packages/relay/src/provider.js'

export class CompositeProvider extends AttestationProvider {
  constructor(parts) {
    super()
    if (!Array.isArray(parts) || parts.length === 0) throw new Error('CompositeProvider precisa de ao menos um provedor')
    this.parts = parts
  }

  get nome() { return this.parts.map((p) => p.nome).join('+') }
  get versao() { return this.parts.map((p) => p.versao).join(':') }
  trustedIssuers() { return [...new Set(this.parts.flatMap((p) => p.trustedIssuers()))] }
  revogados() { return this.parts.flatMap((p) => p.revogados()) }
}
