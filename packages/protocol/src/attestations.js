// SPDX-License-Identifier: AGPL-3.0-or-later
// The two attestations of the protocol.
//
// 1. HANDLE ATTESTATION (signed by a handle ISSUER): ties the @ and the rvr_ uid to the rover's two keys:
//    the NETWORK key (signs the objects) and the APPROVAL key (signs the human approval). Valid until `expiraEm`.
// 2. HUMAN APPROVAL ATTESTATION (signed with the approval key, which stays with the person): says "the person saw and
//    approved the object with id X". Short (at most 10 minutes), tied to the object's id and single-use.
import { createHash, randomBytes } from 'node:crypto'
import { canonicalBytes, isPlainObject, toB64u } from './canonical.js'
import { SIGNATURE_RE, PUBLIC_KEY_RE, signBytes, smallOrderKey, domainOf, verifySignature } from './keys.js'
import { ProtocolError } from './errors.js'
import { integer, literal, closedObject, defaultValue, one_of } from './schema.js'
import { LIMITS, PROTOCOL_VERSION, ACCEPTED_VERSIONS } from './limits.js'
import { HANDLE_RE, ID_RE, UID_RE } from './objects.js'

const instant = integer({ min: 1_700_000_000, max: 4_102_444_800 })
const key = defaultValue(PUBLIC_KEY_RE, 'uma chave pública Ed25519 em base64url (43 caracteres)')
const signatureB64u = defaultValue(SIGNATURE_RE, 'uma assinatura Ed25519 em base64url (86 caracteres)')

const ATTESTATION_SCHEMA = closedObject({
  tipo: literal('atestado-handle'),
  v: one_of(ACCEPTED_VERSIONS),
  emissor: key,
  uid: defaultValue(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)'),
  handle: defaultValue(HANDLE_RE, 'um handle (a-z, 0-9, ponto e sublinhado, de 3 a 30 caracteres)'),
  chave: key,
  chaveAprovacao: key,
  emitidoEm: instant,
  expiraEm: instant,
  assinatura: signatureB64u
})

const APPROVAL_SCHEMA = closedObject({
  tipo: literal('aprovacao-humana'),
  v: one_of(ACCEPTED_VERSIONS),
  objeto: defaultValue(ID_RE, 'um id de objeto (ob_ e 43 caracteres)'),
  autor: defaultValue(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)'),
  aprovadoEm: instant,
  expiraEm: instant,
  nonce: defaultValue(/^[A-Za-z0-9_-]{22}$/, 'um nonce de 16 bytes em base64url'),
  assinatura: signatureB64u
})

const withoutSignature = ({ assinatura: _a, ...rest }) => rest

function schemaError(failure) {
  return new ProtocolError('esquema', { campo: failure.caminho, detalhe: `Campo ${failure.caminho}: ${failure.mensagem}.` })
}

// ---------- handle attestation ----------

export function createHandleAttestation({ issuerPrivateKey, emissor: issuer, uid, handle, chave: networkKey, chaveAprovacao: approvalKey, emitidoEm: issuedAt, expiraEm: expiresAt, v = PROTOCOL_VERSION }) {
  const base = {
    tipo: 'atestado-handle', v, emissor: issuer, uid, handle, chave: networkKey, chaveAprovacao: approvalKey, emitidoEm: issuedAt, expiraEm: expiresAt
  }
  return { ...base, assinatura: signBytes(domainOf(v, 'atestado-handle'), canonicalBytes(base), issuerPrivateKey) }
}

/**
 * @param {unknown} atestado
 * @param {{ agora: number, trustedIssuers: Iterable<string>, validadeMaxS?: number, toleranceS?: number }} ctx
 * @returns {{ ok: true, atestado: object } | { ok: false, erro: ProtocolError }}
 */
export function verifyHandleAttestation(attestation, ctx) {
  const error = (code, extra) => ({ ok: false, erro: new ProtocolError(code, extra) })
  const validityMax = ctx.validadeMaxS ?? LIMITS.atestadoValidadeMaxS
  const tolerance = ctx.toleranceS ?? LIMITS.attestationClockToleranceS
  if (!isPlainObject(attestation)) return error('atestado_invalido', { campo: 'atestado' })
  const f = ATTESTATION_SCHEMA(attestation, 'atestado')
  if (f) return { ok: false, erro: schemaError(f) }
  if (!new Set(ctx.trustedIssuers).has(attestation.emissor)) return error('emissor_desconhecido', { campo: 'atestado.emissor' })
  if (!verifySignature(domainOf(attestation.v, 'atestado-handle'), canonicalBytes(withoutSignature(attestation)), attestation.assinatura, attestation.emissor)) {
    return error('atestado_invalido', { campo: 'atestado.assinatura', detalhe: 'A assinatura do emissor não confere.' })
  }
  if (attestation.chave === attestation.chaveAprovacao) {
    return error('atestado_invalido', { campo: 'atestado.chaveAprovacao', detalhe: 'A chave de aprovação precisa ser diferente da chave de rede do rover.' })
  }
  if (smallOrderKey(attestation.chave)) return error('chave_fraca', { campo: 'atestado.chave' })
  if (smallOrderKey(attestation.chaveAprovacao)) return error('chave_fraca', { campo: 'atestado.chaveAprovacao' })
  if (attestation.expiraEm <= attestation.emitidoEm || attestation.expiraEm - attestation.emitidoEm > validityMax) {
    return error('atestado_invalido', { campo: 'atestado.expiraEm', detalhe: `A validade precisa ser positiva e de no máximo ${Math.floor(validityMax / 86400)} dias.` })
  }
  if (attestation.emitidoEm > ctx.agora + tolerance) {
    return error('atestado_invalido', { campo: 'atestado.emitidoEm', detalhe: 'O atestado foi emitido no futuro.' })
  }
  if (ctx.agora >= attestation.expiraEm) return error('atestado_vencido', { campo: 'atestado.expiraEm' })
  return { ok: true, atestado: attestation }
}

// ---------- human approval ----------

export function createHumanApproval({ chavePrivadaDeAprovacao: approvalPrivateKey, objeto: object, autor: author, aprovadoEm: approvedAt, validadeS: validityS = 300, nonce = toB64u(randomBytes(16)), v = PROTOCOL_VERSION }) {
  const base = {
    tipo: 'aprovacao-humana', v, objeto: object, autor: author, aprovadoEm: approvedAt, expiraEm: approvedAt + validityS, nonce
  }
  return { ...base, assinatura: signBytes(domainOf(v, 'aprovacao-humana'), canonicalBytes(base), approvalPrivateKey) }
}

/** Single-use identifier: two sends of the same approval give the same value. */
export const approvalId = (approval) =>
  toB64u(createHash('sha256').update(canonicalBytes(approval)).digest())

/**
 * Checks the approval against the object it says it approves.
 * Window: object's criadoEm <= aprovadoEm <= expiraEm, validity of at most 10 minutes and, live, now inside it.
 * @param {unknown} aprovacao
 * @param {{ objeto: { id: string, autor: string, criadoEm: number }, approvalKey: string, agora: number, aoVivo?: boolean, toleranceS?: number }} ctx
 */
export function verifyHumanApproval(approval, ctx) {
  const error = (code, extra) => ({ ok: false, erro: new ProtocolError(code, extra) })
  const tolerance = ctx.toleranceS ?? LIMITS.futureWindowS
  if (!isPlainObject(approval)) return error('aprovacao_invalida', { campo: 'aprovacao' })
  const f = APPROVAL_SCHEMA(approval, 'aprovacao')
  if (f) return { ok: false, erro: schemaError(f) }
  if (approval.objeto !== ctx.objeto.id) return error('aprovacao_invalida', { campo: 'aprovacao.objeto', detalhe: 'Ela aprova outro objeto.' })
  if (approval.autor !== ctx.objeto.autor) return error('aprovacao_invalida', { campo: 'aprovacao.autor', detalhe: 'Ela é de outro rover.' })
  if (!verifySignature(domainOf(approval.v, 'aprovacao-humana'), canonicalBytes(withoutSignature(approval)), approval.assinatura, ctx.approvalKey)) {
    return error('aprovacao_invalida', { campo: 'aprovacao.assinatura', detalhe: 'A assinatura não confere com a chave de aprovação do rover.' })
  }
  if (approval.aprovadoEm < ctx.objeto.criadoEm) {
    return error('aprovacao_invalida', { campo: 'aprovacao.aprovadoEm', detalhe: 'A aprovação é anterior à criação do objeto.' })
  }
  if (approval.expiraEm <= approval.aprovadoEm || approval.expiraEm - approval.aprovadoEm > LIMITS.aprovacaoValidadeMaxS) {
    return error('aprovacao_invalida', { campo: 'aprovacao.expiraEm', detalhe: `A validade precisa ser positiva e de no máximo ${LIMITS.aprovacaoValidadeMaxS / 60} minutos.` })
  }
  if (ctx.aoVivo !== false) {
    if (approval.aprovadoEm > ctx.agora + tolerance) {
      return error('aprovacao_invalida', { campo: 'aprovacao.aprovadoEm', detalhe: 'A aprovação está no futuro.' })
    }
    if (ctx.agora > approval.expiraEm) return error('aprovacao_vencida', { campo: 'aprovacao.expiraEm' })
  }
  return { ok: true, aprovacao: approval }
}
