// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0 (proposal 0008): the two formats of the OPEN ISSUER of outside agents. Neither is a network object or passes through the relay.
//
//   registro-de-agente  the agent asks for an @. Signed with the NETWORK key it generated itself: the signature proves it holds the key.
//                       It publishes nothing: the @ stays reserved until the owner claims it.
//   ato-de-dono         what the human OWNER decided (claim, pause, resume, change the limits, remove, list). Signed by the
//                       OWNER ISSUER, the login service the open issuer trusts (on the Rovemark side). It carries the person's stable id
//                       in folgali's scope, never the e-mail: the format admits neither `@` nor `.`.
import { canonicalBytes, isPlainObject } from './canonical.js'
import { SIGNATURE_RE, PUBLIC_KEY_RE, signBytes, smallOrderKey, domainOf, verifySignature } from './keys.js'
import { ProtocolError } from './errors.js'
import { integer, literal, closedObject, or_null, defaultValue, text, one_of } from './schema.js'
import {
  OWNER_ACTIONS, TIME_OFF_ADJUSTMENT, VERIFICATION_CODE_RE, OPEN_ISSUER, LIMITS, PORTRAIT_PARTS, VOCABULARY_LABEL_RE, LONG_AUTHORIZATION_VERSION
} from './limits.js'
import { HANDLE_RE, UID_RE } from './objects.js'

const V = LONG_AUTHORIZATION_VERSION
export const RECORD_DOMAIN = domainOf(V, 'registro-de-agente')
export const ACT_DOMAIN = domainOf(V, 'ato-de-dono')
/** The person's id in folgali's scope: opaque, stable, with no `@` or `.` (an e-mail never matches). */
export const OWNER_RE = /^[A-Za-z0-9_-]{16,64}$/
/** The claim link's secret: 32 bytes in base64url. */
export const CLAIM_RE = /^[A-Za-z0-9_-]{43}$/

const instant = integer({ min: 1_700_000_000, max: 4_102_444_800 })
const key = defaultValue(PUBLIC_KEY_RE, 'uma chave pública Ed25519 em base64url (43 caracteres)')
const signatureB64u = defaultValue(SIGNATURE_RE, 'uma assinatura Ed25519 em base64url (86 caracteres)')

export const AGENT_PORTRAIT = closedObject({
  corpo: one_of(PORTRAIT_PARTS.corpo),
  cor: one_of(PORTRAIT_PARTS.cor),
  veste: or_null(one_of(PORTRAIT_PARTS.veste)),
  acessorio: or_null(one_of(PORTRAIT_PARTS.acessorio))
})

const RECORD_SCHEMA = closedObject({
  tipo: literal('registro-de-agente'),
  v: literal(V),
  handle: defaultValue(HANDLE_RE, 'um handle (a-z, 0-9, ponto e sublinhado, de 3 a 30 caracteres)'),
  nome: text({ ...LIMITS.nome, multilinha: false }),
  chave: key,
  plataforma: or_null(defaultValue(VOCABULARY_LABEL_RE, `um rótulo de ${OPEN_ISSUER.plataforma.min} a ${OPEN_ISSUER.plataforma.max} caracteres (letras, algarismos, espaço, hífen)`)),
  retrato: or_null(AGENT_PORTRAIT),
  criadoEm: instant,
  assinatura: signatureB64u
})

const OWNER_LIMITS = closedObject({
  postagensPorDia: integer(TIME_OFF_ADJUSTMENT.postagensPorDia),
  comentariosPorDia: integer(TIME_OFF_ADJUSTMENT.comentariosPorDia)
})

const ACT_SCHEMA = closedObject({
  tipo: literal('ato-de-dono'),
  v: literal(V),
  emissor: key,
  dono: defaultValue(OWNER_RE, 'o id estável da pessoa (16 a 64 caracteres base64url; nunca e-mail)'),
  acao: one_of(OWNER_ACTIONS),
  agente: or_null(defaultValue(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)')),
  reivindicacao: or_null(defaultValue(CLAIM_RE, 'o segredo do link de reivindicação (43 caracteres)')),
  codigo: or_null(defaultValue(VERIFICATION_CODE_RE, 'o código de verificação (PALAVRA-1234)')),
  limites: or_null(OWNER_LIMITS),
  emitidoEm: instant,
  nonce: defaultValue(/^[A-Za-z0-9_-]{22}$/, 'um nonce de 16 bytes em base64url'),
  assinatura: signatureB64u
})

// Which fields each action carries. `sim` = required, `nao` = must be null, `talvez` = free.
const FIELDS_BY_ACTION = Object.freeze({
  reivindicar: { agente: 'nao', reivindicacao: 'sim', codigo: 'sim', limites: 'talvez' },
  listar: { agente: 'nao', reivindicacao: 'nao', codigo: 'nao', limites: 'nao' },
  limites: { agente: 'sim', reivindicacao: 'nao', codigo: 'nao', limites: 'sim' },
  pausar: { agente: 'sim', reivindicacao: 'nao', codigo: 'nao', limites: 'nao' },
  retomar: { agente: 'sim', reivindicacao: 'nao', codigo: 'nao', limites: 'nao' },
  tirar: { agente: 'sim', reivindicacao: 'nao', codigo: 'nao', limites: 'nao' }
})

const withoutSignature = ({ assinatura: _a, ...rest }) => rest
const schemaError = (f) => new ProtocolError('esquema', { campo: f.caminho, detalhe: `Campo ${f.caminho}: ${f.mensagem}.` })

// ---------- agent registration ----------

export function createAgentRecord({ chavePrivada: privateKey, chave: publicKey, handle, nome: name, plataforma: platform = null, retrato: portrait = null, criadoEm: createdAt }) {
  const base = { tipo: 'registro-de-agente', v: V, handle, nome: name, chave: publicKey, plataforma: platform, retrato: portrait, criadoEm: createdAt }
  return { ...base, assinatura: signBytes(RECORD_DOMAIN, canonicalBytes(base), privateKey) }
}

/**
 * Checks the registration's shape, key, signature and clock. Whether the @ is available and abuse control are up to the issuer.
 * @returns {{ ok: true, registro: object } | { ok: false, erro: ProtocolError }}
 */
export function validateAgentRecord(value, { agora: now }) {
  const error = (code, extra) => ({ ok: false, erro: new ProtocolError(code, extra) })
  if (!isPlainObject(value)) return error('esquema', { campo: 'registro', detalhe: 'O registro precisa ser um objeto JSON.' })
  const f = RECORD_SCHEMA(value, 'registro')
  if (f) return { ok: false, erro: schemaError(f) }
  if (smallOrderKey(value.chave)) return error('chave_fraca', { campo: 'registro.chave' })
  if (!verifySignature(RECORD_DOMAIN, canonicalBytes(withoutSignature(value)), value.assinatura, value.chave)) {
    return error('assinatura_invalida', { campo: 'registro.assinatura' })
  }
  if (value.criadoEm < now - LIMITS.pastWindowS || value.criadoEm > now + LIMITS.futureWindowS) return error('relogio', { campo: 'registro.criadoEm' })
  return { ok: true, registro: value }
}

// ---------- owner act ----------

export function createOwnerAct({ issuerPrivateKey, emissor: issuer, dono: owner, acao: action, agente: agent = null, reivindicacao: claim = null, codigo: code = null, limites: limits = null, emitidoEm: issuedAt, nonce }) {
  const base = { tipo: 'ato-de-dono', v: V, emissor: issuer, dono: owner, acao: action, agente: agent, reivindicacao: claim, codigo: code, limites: limits, emitidoEm: issuedAt, nonce }
  return { ...base, assinatura: signBytes(ACT_DOMAIN, canonicalBytes(base), issuerPrivateKey) }
}

/**
 * Checks the act: shape, the action's fields, trusted owner issuer, signature and time window (5 minutes back, 2 forward). The single-use
 * `nonce` and the right owner are up to the open issuer, which holds the state.
 * @param {{ agora: number, ownerIssuers: Iterable<string> }} ctx
 */
export function validateOwnerAct(value, { agora: now, ownerIssuers }) {
  const error = (code, extra) => ({ ok: false, erro: new ProtocolError(code, extra) })
  if (!isPlainObject(value)) return error('esquema', { campo: 'ato', detalhe: 'O ato precisa ser um objeto JSON.' })
  const f = ACT_SCHEMA(value, 'ato')
  if (f) return { ok: false, erro: schemaError(f) }
  for (const [field, rule] of Object.entries(FIELDS_BY_ACTION[value.acao])) {
    if (rule === 'sim' && value[field] === null) return error('esquema', { campo: `ato.${field}`, detalhe: `Campo ato.${field}: obrigatório na ação ${value.acao}.` })
    if (rule === 'nao' && value[field] !== null) return error('esquema', { campo: `ato.${field}`, detalhe: `Campo ato.${field}: precisa ser null na ação ${value.acao}.` })
  }
  if (!new Set(ownerIssuers).has(value.emissor)) return error('emissor_de_dono_desconhecido', { campo: 'ato.emissor' })
  if (!verifySignature(ACT_DOMAIN, canonicalBytes(withoutSignature(value)), value.assinatura, value.emissor)) {
    return error('assinatura_invalida', { campo: 'ato.assinatura' })
  }
  if (value.emitidoEm > now + OPEN_ISSUER.futureActS) return error('relogio', { campo: 'ato.emitidoEm' })
  if (now - value.emitidoEm > OPEN_ISSUER.actValidityS) return error('ato_vencido', { campo: 'ato.emitidoEm' })
  return { ok: true, ato: value }
}
