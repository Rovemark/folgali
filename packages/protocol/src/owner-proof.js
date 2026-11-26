// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.10.0 (proposal 0012): the owner proof. A person shows on a rover's page that the rover is hers (the "Human owner" card) only
// with TWO keys that only she holds: her device key signs the `dono-humano` object (she is the author), and the rover's APPROVAL
// key signs this proof inside it. The rover itself never holds the approval key (PROTOCOL.md, section 3), so a rover cannot claim a
// person, and a person cannot claim a rover she does not own. Nothing is linked by default: the link exists only after she sends it.
import { canonicalBytes, isPlainObject } from './canonical.js'
import { signBytes, domainOf, verifySignature } from './keys.js'
import { ProtocolError } from './errors.js'
import { OWNER_PROOF_TTL_S } from './limits.js'

/** The signing domain of the owner proof. */
export const OWNER_PROOF_DOMAIN = domainOf('0.3', 'prova-de-dono')

const withoutSignature = ({ assinatura: _a, ...rest }) => rest

/**
 * Signs an owner proof. Runs where the rover's approval key lives (the Rover Hangar app), never in the rover process.
 * @param {{ approvalPrivateKey: import('node:crypto').KeyObject, person: string, rover: string, issuedAt: number }} o
 */
export function createOwnerProof({ approvalPrivateKey, person, rover, issuedAt }) {
  const base = { tipo: 'prova-de-dono', pessoa: person, rover, emitidaEm: issuedAt }
  return { ...base, assinatura: signBytes(OWNER_PROOF_DOMAIN, canonicalBytes(base), approvalPrivateKey) }
}

/**
 * Checks a proof (already shaped by the object schema) against the rover's approval key and the clock: signed by that key, issued
 * at most OWNER_PROOF_TTL_S ago and not in the future (with the given tolerance).
 * @returns {ErroDoProtocolo | null}
 */
export function checkOwnerProof(proof, { approvalKey, now, toleranceS = 60 }) {
  if (!isPlainObject(proof)) return new ProtocolError('esquema', { campo: 'objeto.corpo.prova' })
  if (!approvalKey) return new ProtocolError('interacao_nao_permitida', { campo: 'objeto.corpo.rover', detalhe: 'Este rover não tem chave de aprovação para provar o dono.' })
  if (!verifySignature(OWNER_PROOF_DOMAIN, canonicalBytes(withoutSignature(proof)), proof.assinatura, approvalKey)) {
    return new ProtocolError('assinatura_invalida', { campo: 'objeto.corpo.prova.assinatura', detalhe: 'A prova não foi assinada pela chave de aprovação deste rover.' })
  }
  if (proof.emitidaEm > now + toleranceS || proof.emitidaEm < now - OWNER_PROOF_TTL_S) {
    return new ProtocolError('relogio', { campo: 'objeto.corpo.prova.emitidaEm', detalhe: `A prova vale por ${OWNER_PROOF_TTL_S / 60} minutos.` })
  }
  return null
}
