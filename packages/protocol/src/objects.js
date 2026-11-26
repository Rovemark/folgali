// SPDX-License-Identifier: AGPL-3.0-or-later
// Signed network objects: shape, content id, signature.
//
//   { v, tipo, id, autor, criadoEm, previo, corpo, assinatura }
//
// id = "ob_" + base64url(SHA-256(canonical of the object without id and without signature)).
// signature = Ed25519 over the version's domain prefix + canonical of the object without signature (with id), with the rover's NETWORK key.
import { createHash } from 'node:crypto'
import { canonicalBytes, isPlainObject, toB64u } from './canonical.js'
import { SIGNATURE_RE, signBytes, objectDomain, verifySignature } from './keys.js'
import { BODIES_V3, ID_RE, TOPIC_RE, UID_RE, crossFieldRules } from './social-bodies.js'
import { BODIES_V4, messageRules } from './message-bodies.js'
import { ProtocolError } from './errors.js'
import { MEDIA_BODIES, mediaRules } from './media.js'
import { integer, list, closedObject, optional, or_null, defaultValue, text, one_of } from './schema.js'
import {
  GRAPHS, LIMITS, REPORT_REASONS, REACTIONS, MESSAGE_TYPES, OBJECT_TYPES, REQUIRABLE_TYPES, MESSAGES_VERSION, PROTOCOL_VERSION, ACCEPTED_VERSIONS,
  typeExistsInVersion
} from './limits.js'

// 0.4.0 (private messages): the version and the new types come in here, without touching ACCEPTED_VERSIONS or OBJECT_TYPES (which a relay with the
// resource off keeps announcing). In 0.4 only the message types exist, and they only exist in 0.4.
const OBJECT_VERSIONS = Object.freeze([...ACCEPTED_VERSIONS, MESSAGES_VERSION])
const TYPES_WITH_MESSAGE = Object.freeze([...OBJECT_TYPES, ...MESSAGE_TYPES])
const typeExists = (type, version) =>
  version === MESSAGES_VERSION ? MESSAGE_TYPES.includes(type) : !MESSAGE_TYPES.includes(type) && typeExistsInVersion(type, version)

export { ID_RE, TOPIC_RE, UID_RE }
export const HANDLE_RE = /^[a-z0-9._]{3,30}$/

const id = defaultValue(ID_RE, 'um id de objeto (ob_ e 43 caracteres)')
const uid = defaultValue(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)')
const instant = integer({ min: 1_700_000_000, max: 4_102_444_800 })

const oneLine = (limits) => text({ ...limits, multilinha: false })

const NAME_AND_DESCRIPTION = { nome: oneLine(LIMITS.nome), descricao: oneLine(LIMITS.descricao) }

// The profile changes with each version. 0.2 adds the graph and the rover's approval requirement; 0.3, the page (sobre, habilidades...).
const PROFILE_PER_VERSION = {
  '0.1': closedObject(NAME_AND_DESCRIPTION),
  '0.2': closedObject({
    ...NAME_AND_DESCRIPTION,
    grafo: one_of(GRAPHS),
    exigirAprovacao: list(one_of(REQUIRABLE_TYPES), { max: REQUIRABLE_TYPES.length, unique: true })
  }),
  '0.3': BODIES_V3.perfil
}

// Bodies up to 0.2. In 0.3 those of social-bodies.js apply (links, mentions and an extended filter on the texts; social types).
const BODIES_UP_TO_V2 = {
  postagem: closedObject({
    titulo: optional(oneLine(LIMITS.titulo)),
    texto: text({ ...LIMITS.postagem, multilinha: true, urls: LIMITS.urlsPerText }),
    topicos: list(defaultValue(TOPIC_RE, 'um tópico (a-z, 0-9 e hífen, 2 a 24 caracteres)'), {
      max: LIMITS.topicsPerPost, unique: true
    })
  }),
  resposta: closedObject({
    alvo: id,
    texto: text({ ...LIMITS.resposta, multilinha: true, urls: LIMITS.urlsPerText })
  }),
  seguir: closedObject({ alvo: uid }),
  'deixar-de-seguir': closedObject({ alvo: uid }),
  reacao: closedObject({ alvo: id, reacao: one_of(REACTIONS) }),
  denuncia: closedObject({ alvo: id, motivo: one_of(REPORT_REASONS) }),
  'remocao-pelo-autor': closedObject({ alvo: id })
}

/** The validator of a type's body in a version. */
export const bodyOf = (type, version) => {
  if (version === MESSAGES_VERSION) return BODIES_V4[type]
  if (type === 'perfil') return PROFILE_PER_VERSION[version]
  return (version === '0.3' ? BODIES_V3[type] ?? MEDIA_BODIES[type] : undefined) ?? BODIES_UP_TO_V2[type]
}

const ENVELOPE = closedObject({
  v: one_of(OBJECT_VERSIONS),
  tipo: one_of(TYPES_WITH_MESSAGE),
  id,
  autor: uid,
  criadoEm: instant,
  previo: or_null(id),
  corpo: () => null, // the body's shape is checked by the type's schema, which requires a closed object
  assinatura: defaultValue(SIGNATURE_RE, 'uma assinatura Ed25519 em base64url (86 caracteres)')
})

export function computeId(object) {
  const { id: _id, assinatura: _signature, ...rest } = object
  return `ob_${toB64u(createHash('sha256').update(canonicalBytes(rest)).digest())}`
}

const bytesToSign = (object) => {
  const { assinatura: _signature, ...rest } = object
  return canonicalBytes(rest)
}

/** Builds, computes the id and signs. `chavePrivada` is the rover's NETWORK key. */
export function createObject({ tipo: type, autor: author, criadoEm: createdAt, previo: previous = null, corpo: body, chavePrivada: privateKey, v = PROTOCOL_VERSION }) {
  const base = { v, tipo: type, autor: author, criadoEm: createdAt, previo: previous, corpo: body }
  const withId = { ...base, id: computeId(base) }
  return { ...withId, assinatura: signBytes(objectDomain(v, type), bytesToSign(withId), privateKey) }
}

/**
 * Checks the SHAPE of the object: version, type, closed schema, rules between fields, size and id.
 * It does not check the signature (needs the key) or the clock (needs the receiver's clock).
 * @returns {{ ok: true, objeto: object } | { ok: false, erro: ErroDoProtocolo }}
 */
export function validateObject(value) {
  const error = (code, extra) => ({ ok: false, erro: new ProtocolError(code, extra) })
  if (!isPlainObject(value)) return error('esquema', { campo: 'objeto', detalhe: 'O objeto precisa ser um objeto JSON.' })
  if (typeof value.v === 'string' && !OBJECT_VERSIONS.includes(value.v)) {
    return error('versao_nao_suportada', { campo: 'objeto.v' })
  }
  const envelopeFailure = ENVELOPE(value, 'objeto')
  if (envelopeFailure) return error('esquema', { campo: envelopeFailure.caminho, detalhe: `Campo ${envelopeFailure.caminho}: ${envelopeFailure.mensagem}.` })
  if (!typeExists(value.tipo, value.v)) {
    const detail = MESSAGE_TYPES.includes(value.tipo) || value.v === MESSAGES_VERSION
      ? 'Campo objeto.tipo: os tipos de mensagem só existem na versão 0.4, e a 0.4 só tem os tipos de mensagem.'
      : 'Campo objeto.tipo: este tipo só existe a partir da versão 0.3.'
    return error('esquema', { campo: 'objeto.tipo', detalhe: detail })
  }
  const bodyFailure = bodyOf(value.tipo, value.v)(value.corpo, 'objeto.corpo')
  if (bodyFailure) return error('esquema', { campo: bodyFailure.caminho, detalhe: `Campo ${bodyFailure.caminho}: ${bodyFailure.mensagem}.` })
  const rule = value.v === MESSAGES_VERSION ? messageRules(value) : crossFieldRules(value) ?? mediaRules(value)
  if (rule) return error('esquema', { campo: rule.caminho, detalhe: `Campo ${rule.caminho}: ${rule.mensagem}.` })
  if (value.tipo === 'denuncia' && value.previo !== null) {
    return error('esquema', { campo: 'objeto.previo', detalhe: 'Denúncia não entra na cadeia do autor: previo precisa ser null.' })
  }
  if (['seguir', 'deixar-de-seguir'].includes(value.tipo) && value.corpo.alvo === value.autor) {
    return error('esquema', { campo: 'objeto.corpo.alvo', detalhe: 'Um rover não segue a si mesmo.' })
  }
  if (computeId(value) !== value.id) return error('id_incorreto', { campo: 'objeto.id' })
  return { ok: true, objeto: value }
}

export function objectSignatureMatches(object, publicKey) {
  return verifySignature(objectDomain(object.v, object.tipo), bytesToSign(object), object.assinatura, publicKey)
}
