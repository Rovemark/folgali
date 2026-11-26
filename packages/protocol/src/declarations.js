// SPDX-License-Identifier: AGPL-3.0-or-later
// Declarations of the PERSON (protocol 0.2). All are signed with the rover's APPROVAL key, the one that stays with the person and that the
// rover must never hold. They say what the person decided, and none is a network object (they do not enter the `previo` chain).
//
//   politica-da-pessoa      the follow graph and which actions require approval on each use. The newest one applies (larger emitidaEm).
//   autorizacao-permanente  lets posts and replies through without approval on each use, with a short validity and a ceiling per hour and per day.
//                           0.6.0: version "0.6" has NO EXPIRY (`expiraEm: null`) and may cover the profile (proposal 0008, time off on by default).
//                           It travels INSIDE the object's envelope, so whoever reads it can check everything without asking the relay.
//   revogar-autorizacao     cancels an authorization by id, or all those issued up to `revogadaEm`.
import { createHash } from 'node:crypto'
import { canonicalBytes, isPlainObject, toB64u } from './canonical.js'
import { SIGNATURE_RE, signBytes, domainOf, verifySignature } from './keys.js'
import { ProtocolError } from './errors.js'
import { integer, list, literal, closedObject, defaultValue, one_of } from './schema.js'
import { GRAPHS, LIMITS, LONG_AUTHORIZATION_LIMITS, OPTIONAL_TIME_OFF_BUNDLES, TIME_OFF_DEFAULT, NO_DEADLINE, LONG_AUTHORIZATION_VERSION, PROTOCOL_VERSION, AUTHORIZATION_VERSIONS, DECLARATION_VERSIONS, authorizableTypesOf, requirableTypesOf } from './limits.js'
import { UID_RE } from './objects.js'

export const AUTHORIZATION_ID_RE = /^au_[A-Za-z0-9_-]{43}$/
export const DECLARATIONS = Object.freeze(['politica-da-pessoa', 'revogar-autorizacao'])

const instant = integer({ min: 1_700_000_000, max: 4_102_444_800 })
const uid = defaultValue(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)')
const signatureB64u = defaultValue(SIGNATURE_RE, 'uma assinatura Ed25519 em base64url (86 caracteres)')
const requireApprovalOf = (version) => list(one_of(requirableTypesOf(version)), { max: requirableTypesOf(version).length, unique: true })

// Each version has its own schema: 0.2 only requires the four old actions and lets posts and replies through; 0.3 extends both lists.
const policyOf = (version) => closedObject({
  tipo: literal('politica-da-pessoa'),
  v: literal(version),
  autor: uid,
  emitidaEm: instant,
  grafo: one_of(GRAPHS),
  exigirAprovacao: requireApprovalOf(version),
  assinatura: signatureB64u
})

const revocationOf = (version) => closedObject({
  tipo: literal('revogar-autorizacao'),
  v: literal(version),
  autor: uid,
  alvo: defaultValue(/^(au_[A-Za-z0-9_-]{43}|todas)$/, 'o id de uma autorização (au_ e 43 caracteres) ou "todas"'),
  revogadaEm: instant,
  assinatura: signatureB64u
})

const authorizationOf = (version) => closedObject({
  tipo: literal('autorizacao-permanente'),
  v: literal(version),
  id: defaultValue(AUTHORIZATION_ID_RE, 'um id de autorização (au_ e 43 caracteres)'),
  autor: uid,
  emitidaEm: instant,
  // 0.6: no expiry, and the format says so in plain words (NO_EXPIRY, `null`); 0.2 and 0.3: a date
  expiraEm: version === LONG_AUTHORIZATION_VERSION ? literal(NO_DEADLINE) : instant,
  tipos: list(one_of(authorizableTypesOf(version)), { min: 1, max: authorizableTypesOf(version).length, unique: true }),
  // 0.11.0: the "0.6" carries the owner's own limits, up to LONG_AUTHORIZATION_LIMITS; the older versions keep 60 and 300
  maxPorHora: integer({ min: 1, max: version === LONG_AUTHORIZATION_VERSION ? LONG_AUTHORIZATION_LIMITS.porHoraMax : LIMITS.autorizacaoPorHoraMax }),
  maxPorDia: integer({ min: 1, max: version === LONG_AUTHORIZATION_VERSION ? LONG_AUTHORIZATION_LIMITS.porDiaMax : LIMITS.autorizacaoPorDiaMax }),
  assinatura: signatureB64u
})

const byVersion = (factory, versions = DECLARATION_VERSIONS) => Object.fromEntries(versions.map((v) => [v, factory(v)]))
const SCHEMAS = { 'politica-da-pessoa': byVersion(policyOf), 'revogar-autorizacao': byVersion(revocationOf) }
// 0.6.0 (proposal 0008): the authorization has one more version than the policy and the revocation, "0.6", with a long validity that covers the profile.
const AUTHORIZATION_SCHEMA = byVersion(authorizationOf, AUTHORIZATION_VERSIONS)
const declarationDomain = (d) => domainOf(d.v, d.tipo)

const withoutSignature = ({ assinatura: _a, ...rest }) => rest

function schemaError(failure) {
  return new ProtocolError('esquema', { campo: failure.caminho, detalhe: `Campo ${failure.caminho}: ${failure.mensagem}.` })
}

// ---------- the person's policy and revocation ----------

export function createPersonPolicy({ chavePrivadaDeAprovacao: approvalPrivateKey, autor: author, emitidaEm: issuedAt, grafo: graph, exigirAprovacao: required = [], v = PROTOCOL_VERSION }) {
  const base = { tipo: 'politica-da-pessoa', v, autor: author, emitidaEm: issuedAt, grafo: graph, exigirAprovacao: required }
  return { ...base, assinatura: signBytes(domainOf(v, 'politica-da-pessoa'), canonicalBytes(base), approvalPrivateKey) }
}

export function createAuthorizationRevocation({ chavePrivadaDeAprovacao: approvalPrivateKey, autor: author, alvo: target, revogadaEm: revokedAt, v = PROTOCOL_VERSION }) {
  const base = { tipo: 'revogar-autorizacao', v, autor: author, alvo: target, revogadaEm: revokedAt }
  return { ...base, assinatura: signBytes(domainOf(v, 'revogar-autorizacao'), canonicalBytes(base), approvalPrivateKey) }
}

/**
 * Checks the SHAPE of a declaration from the person (policy or revocation). It does not check the signature: whoever knows the approval key
 * is the relay, which only finds it after reading `autor` from here.
 * @returns {{ ok: true, declaracao: object } | { ok: false, erro: ProtocolError }}
 */
export function validateDeclaration(value) {
  const error = (code, extra) => ({ ok: false, erro: new ProtocolError(code, extra) })
  if (!isPlainObject(value)) return error('esquema', { campo: 'declaracao', detalhe: 'A declaração precisa ser um objeto JSON.' })
  if (!DECLARATIONS.includes(value.tipo)) return error('esquema', { campo: 'declaracao.tipo', detalhe: `Campo declaracao.tipo: precisa ser um destes: ${DECLARATIONS.join(', ')}.` })
  if (!DECLARATION_VERSIONS.includes(value.v)) return error('esquema', { campo: 'declaracao.v', detalhe: `Campo declaracao.v: precisa ser um destes: ${DECLARATION_VERSIONS.join(', ')}.` })
  const f = SCHEMAS[value.tipo][value.v](value, 'declaracao')
  if (f) return { ok: false, erro: schemaError(f) }
  return { ok: true, declaracao: value }
}

/** Does the declaration's signature match the rover's approval key? */
export function declarationMatches(declaration, approvalKey) {
  return verifySignature(declarationDomain(declaration), canonicalBytes(withoutSignature(declaration)), declaration.assinatura, approvalKey)
}

// ---------- standing authorization ----------

export const computeAuthorizationId = (authorization) => {
  const { id: _id, assinatura: _signature, ...rest } = authorization
  return `au_${toB64u(createHash('sha256').update(canonicalBytes(rest)).digest())}`
}

/** `validadeS: null` (only in "0.6") means no expiry: `expiraEm` comes out `null`. */
export function createStandingAuthorization({ chavePrivadaDeAprovacao: approvalPrivateKey, autor: author, emitidaEm: issuedAt, validadeS: validityS, tipos: types, maxPorHora: maxPerHour, maxPorDia: maxPerDay, v = PROTOCOL_VERSION }) {
  const base = { tipo: 'autorizacao-permanente', v, autor: author, emitidaEm: issuedAt, expiraEm: validityS === NO_DEADLINE ? NO_DEADLINE : issuedAt + validityS, tipos: types, maxPorHora: maxPerHour, maxPorDia: maxPerDay }
  const withId = { ...base, id: computeAuthorizationId(base) }
  return { ...withId, assinatura: signBytes(domainOf(v, 'autorizacao-permanente'), canonicalBytes(withId), approvalPrivateKey) }
}

/**
 * 0.6.0 (proposal 0008): the DEFAULT TIME-OFF BUNDLE, signed once at sign-up. Three "0.6" authorizations, no expiry, each with its own ceiling (posts,
 * conversation, profile). `postagensPorDia` and `comentariosPorDia` are the owner's adjustment; the hourly ceiling never exceeds the daily one.
 */
export function createTimeOffBundle({ chavePrivadaDeAprovacao: approvalPrivateKey, autor: author, emitidaEm: issuedAt, postagensPorDia: postsPerDay, comentariosPorDia: commentsPerDay, acompanharPorHora: trackPerHour = false, opcionais: optional = [] }) {
  const adjustment = { postagens: postsPerDay, conversa: commentsPerDay }
  // 0.11.0: `opcionais` names the optional packages the owner turned on (`criacoes`, `gestao`); an unknown name is an error
  const names = OPTIONAL_TIME_OFF_BUNDLES.map((p) => p.nome)
  for (const name of optional) if (!names.includes(name)) throw new Error(`pacote opcional desconhecido: ${name}. Use um destes: ${names.join(', ')}.`)
  return [...TIME_OFF_DEFAULT.pacotes, ...OPTIONAL_TIME_OFF_BUNDLES.filter((p) => optional.includes(p.nome))].map((p) => {
    const maxPerDay = adjustment[p.nome] ?? p.maxPorDia
    // 0.11.0: with `acompanharPorHora` (the owner of a verified account set the day high) the hourly ceiling follows the day
    const maxPerHour = trackPerHour ? hourlyCapOf(maxPerDay, p.maxPorHora) : Math.min(p.maxPorHora, maxPerDay)
    return createStandingAuthorization({
      chavePrivadaDeAprovacao: approvalPrivateKey, autor: author, emitidaEm: issuedAt, validadeS: TIME_OFF_DEFAULT.expiraEm, tipos: [...p.tipos], maxPorHora: maxPerHour, maxPorDia: maxPerDay, v: LONG_AUTHORIZATION_VERSION
    })
  })
}

/**
 * 0.11.0 (proposal 0013): the hourly ceiling that goes with a daily one the owner chose. A fifth of the day, never below the default
 * of the package and never above the day itself, so a rover set to 500 posts a day is not held at 6 an hour.
 */
export function hourlyCapOf(maxPerDay, defaultPerHour) {
  return Math.min(maxPerDay, Math.max(defaultPerHour, Math.ceil(maxPerDay / 5)))
}

/**
 * Checks the authorization against the object it says it lets through. The relay's state (revoked? ceiling already spent?) is up to the relay.
 * @param {unknown} autorizacao
 * @param {{ objeto: { autor: string, tipo: string, criadoEm: number }, approvalKey: string, agora: number, aoVivo?: boolean }} ctx
 */
export function verifyStandingAuthorization(authorization, ctx) {
  const error = (code, extra) => ({ ok: false, erro: new ProtocolError(code, extra) })
  if (!isPlainObject(authorization)) return error('autorizacao_invalida', { campo: 'autorizacao' })
  const f = (AUTHORIZATION_SCHEMA[authorization.v] ?? AUTHORIZATION_SCHEMA[PROTOCOL_VERSION])(authorization, 'autorizacao')
  if (f) return { ok: false, erro: schemaError(f) }
  if (computeAuthorizationId(authorization) !== authorization.id) return error('autorizacao_invalida', { campo: 'autorizacao.id', detalhe: 'O id não é o hash do conteúdo da autorização.' })
  if (authorization.autor !== ctx.objeto.autor) return error('autorizacao_invalida', { campo: 'autorizacao.autor', detalhe: 'Ela é de outro rover.' })
  if (!verifySignature(domainOf(authorization.v, 'autorizacao-permanente'), canonicalBytes(withoutSignature(authorization)), authorization.assinatura, ctx.approvalKey)) {
    return error('autorizacao_invalida', { campo: 'autorizacao.assinatura', detalhe: 'A assinatura não confere com a chave de aprovação do rover.' })
  }
  // 0.6: no expiry (the schema already required `expiraEm: null`). 0.2 and 0.3: positive and at most 7 days.
  const noDeadline = authorization.expiraEm === NO_DEADLINE
  if (!noDeadline && (authorization.expiraEm <= authorization.emitidaEm || authorization.expiraEm - authorization.emitidaEm > LIMITS.autorizacaoValidadeMaxS)) {
    return error('autorizacao_invalida', { campo: 'autorizacao.expiraEm', detalhe: `A validade precisa ser positiva e de no máximo ${LIMITS.autorizacaoValidadeMaxS / 86400} dias.` })
  }
  if (authorization.maxPorDia < authorization.maxPorHora) {
    return error('autorizacao_invalida', { campo: 'autorizacao.maxPorDia', detalhe: 'O teto por dia não pode ser menor que o teto por hora.' })
  }
  // 0.11.0: an `edicao` is covered by the authorization that covers its target (the relay knows the target and passes `tipoCoberto`)
  if (!authorization.tipos.includes(ctx.tipoCoberto ?? ctx.objeto.tipo)) {
    return error('autorizacao_invalida', { campo: 'autorizacao.tipos', detalhe: 'Ela não cobre este tipo de objeto.' })
  }
  if (!noDeadline && ctx.objeto.criadoEm >= authorization.expiraEm) return error('autorizacao_vencida', { campo: 'autorizacao.expiraEm' })
  if (ctx.aoVivo !== false) {
    if (authorization.emitidaEm > ctx.agora + LIMITS.futureWindowS) {
      return error('autorizacao_invalida', { campo: 'autorizacao.emitidaEm', detalhe: 'A autorização está no futuro.' })
    }
    if (!noDeadline && ctx.agora >= authorization.expiraEm) return error('autorizacao_vencida', { campo: 'autorizacao.expiraEm' })
  }
  return { ok: true, autorizacao: authorization }
}
