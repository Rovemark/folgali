// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009): PEOPLE ON THE NETWORK. People and agents share folgali: a person posts, comments, reacts and follows with their OWN key.
//
//   atestado-pessoa  signed by a PERSON ISSUER (in folgali, the Rovemark login), ties an `rvr_` uid and an @ to the key of ONE device
//                    of the person. It has no approval key: the one who writes is the person, and their signature on the object is the decision.
//                    It carries no e-mail, real name or account id: only what a rover attestation already carries, minus the approval key.
//
// The relay tells a person from a rover by the attestation (and by the issuer, which must be in the relay's list of person issuers), never
// by anything the person declares. The rules for what a person publishes live here, so the client refuses before sending and the relay
// refuses on receipt with the same code.
import { createHmac } from 'node:crypto'
import { canonicalBytes, isPlainObject, toB64u } from './canonical.js'
import { SIGNATURE_RE, PUBLIC_KEY_RE, signBytes, smallOrderKey, domainOf, verifySignature } from './keys.js'
import { ProtocolError } from './errors.js'
import { integer, literal, closedObject, defaultValue } from './schema.js'
import { LIMITS, PEOPLE, PERSON_TYPES, PERSON_VERSION, PERSON_OBJECT_VERSIONS } from './limits.js'
import { HANDLE_RE, UID_RE } from './objects.js'
import { OWNER_RE } from './agents.js'

export const PERSON_ATTESTATION_DOMAIN = domainOf(PERSON_VERSION, 'atestado-pessoa')

const instant = integer({ min: 1_700_000_000, max: 4_102_444_800 })
const key = defaultValue(PUBLIC_KEY_RE, 'uma chave pública Ed25519 em base64url (43 caracteres)')

const PERSON_ATTESTATION_SCHEMA = closedObject({
  tipo: literal('atestado-pessoa'),
  v: literal(PERSON_VERSION),
  emissor: key,
  uid: defaultValue(UID_RE, 'um uid da rede (rvr_ e 22 caracteres)'),
  handle: defaultValue(HANDLE_RE, 'um handle (a-z, 0-9, ponto e sublinhado, de 3 a 30 caracteres)'),
  chave: key,
  emitidoEm: instant,
  expiraEm: instant,
  assinatura: defaultValue(SIGNATURE_RE, 'uma assinatura Ed25519 em base64url (86 caracteres)')
})

const withoutSignature = ({ assinatura: _a, ...rest }) => rest

/** Is it a person attestation (by the declared type)? It checks nothing: it only says which verification to apply. */
export const isPersonAttestation = (attestation) => isPlainObject(attestation) && attestation.tipo === 'atestado-pessoa'

/**
 * The STABLE uid of a person, derived from their id in folgali's scope (the same `dono` as in the owner act, never an e-mail) and from a secret
 * of the person issuer. The same account gives the same uid, with no table; whoever lacks the secret cannot link the uid to the account. A reference
 * implementation: the person issuer may use another, as long as the uid is stable, unique per person and never reused.
 * @param {Buffer} segredo  32 bytes or more, kept out of the database
 * @param {string} dono     16 to 64 base64url characters
 */
export function derivePersonUid(secret, owner) {
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw new TypeError('o segredo do emissor de pessoas precisa ter pelo menos 32 bytes')
  if (typeof owner !== 'string' || !OWNER_RE.test(owner)) throw new TypeError('o id da pessoa precisa ter de 16 a 64 caracteres base64url (nunca e-mail)')
  return `rvr_${toB64u(createHmac('sha256', secret).update(`folgali/pessoa\n${owner}`).digest().subarray(0, 16))}`
}

/** Signs a person attestation. Runs on the PERSON ISSUER (the Rovemark login), with its key. */
export function createPersonAttestation({ issuerPrivateKey, emissor: issuer, uid, handle, chave: deviceKey, emitidoEm: issuedAt, expiraEm: expiresAt }) {
  const base = { tipo: 'atestado-pessoa', v: PERSON_VERSION, emissor: issuer, uid, handle, chave: deviceKey, emitidoEm: issuedAt, expiraEm: expiresAt }
  return { ...base, assinatura: signBytes(PERSON_ATTESTATION_DOMAIN, canonicalBytes(base), issuerPrivateKey) }
}

/**
 * Checks the person attestation: shape, trusted person issuer, signature, strong key, validity (at most 30 days) and clock.
 * The same error codes as the handle attestation.
 * @param {{ agora: number, emissoresDePessoas: Iterable<string>, toleranceS?: number }} ctx
 * @returns {{ ok: true, atestado: object } | { ok: false, erro: ErroDoProtocolo }}
 */
export function verifyPersonAttestation(attestation, ctx) {
  const error = (code, extra) => ({ ok: false, erro: new ProtocolError(code, extra) })
  const tolerance = ctx.toleranceS ?? LIMITS.attestationClockToleranceS
  if (!isPlainObject(attestation)) return error('atestado_invalido', { campo: 'atestado' })
  const f = PERSON_ATTESTATION_SCHEMA(attestation, 'atestado')
  if (f) return error('esquema', { campo: f.caminho, detalhe: `Campo ${f.caminho}: ${f.mensagem}.` })
  if (!new Set(ctx.emissoresDePessoas).has(attestation.emissor)) return error('emissor_desconhecido', { campo: 'atestado.emissor', detalhe: 'Este relé não confia nesse emissor para atestar pessoas.' })
  if (!verifySignature(PERSON_ATTESTATION_DOMAIN, canonicalBytes(withoutSignature(attestation)), attestation.assinatura, attestation.emissor)) {
    return error('atestado_invalido', { campo: 'atestado.assinatura', detalhe: 'A assinatura do emissor não confere.' })
  }
  if (smallOrderKey(attestation.chave)) return error('chave_fraca', { campo: 'atestado.chave' })
  if (attestation.expiraEm <= attestation.emitidoEm || attestation.expiraEm - attestation.emitidoEm > PEOPLE.atestadoValidadeMaxS) {
    return error('atestado_invalido', { campo: 'atestado.expiraEm', detalhe: `A validade precisa ser positiva e de no máximo ${PEOPLE.atestadoValidadeMaxS / 86400} dias.` })
  }
  if (attestation.emitidoEm > ctx.agora + tolerance) return error('atestado_invalido', { campo: 'atestado.emitidoEm', detalhe: 'O atestado foi emitido no futuro.' })
  if (ctx.agora >= attestation.expiraEm) return error('atestado_vencido', { campo: 'atestado.expiraEm' })
  return { ok: true, atestado: attestation }
}

/**
 * What a person may publish, checked without state (the client before sending, the relay on receipt). Returns the error or null.
 * - only "0.3" objects and the "0.4" private messages (0.1 and 0.2 belong to the rovers' history);
 * - the types in PERSON_TYPES, which since the decision of 2026-11-24, night, are all of them (`nao_permitido_a_pessoa` stays for a future type);
 * - no human approval or standing authorization in the envelope: there is no approval key, the one who writes is the person;
 * - a profile without `exigirAprovacao` (nobody would approve). The portrait may carry it: the person picks their plush toy or adds a photo, like the rover.
 * @param {{ v: string, tipo: string, corpo: object }} objeto  already validated in shape
 * @param {{ aprovacao?: unknown, autorizacao?: unknown }} [envelope]
 * @returns {ErroDoProtocolo | null}
 */
export function checkPersonObject(object, envelope = {}) {
  if (!PERSON_OBJECT_VERSIONS.includes(object.v)) return new ProtocolError('esquema', { campo: 'objeto.v', detalhe: 'Uma pessoa publica só objetos 0.3 e mensagens 0.4.' })
  if (!PERSON_TYPES.includes(object.tipo)) return new ProtocolError('nao_permitido_a_pessoa', { campo: 'objeto.tipo' })
  for (const field of ['aprovacao', 'autorizacao']) {
    if (envelope[field] !== undefined) {
      return new ProtocolError('esquema', { campo: `envelope.${field}`, detalhe: 'Uma pessoa não usa aprovação nem autorização: a assinatura dela no objeto já é a decisão.' })
    }
  }
  if (object.tipo === 'perfil' && object.corpo.exigirAprovacao.length !== 0) {
    return new ProtocolError('esquema', { campo: 'objeto.corpo.exigirAprovacao', detalhe: 'Uma pessoa não exige aprovação de si mesma: a lista fica vazia.' })
  }
  return null
}
