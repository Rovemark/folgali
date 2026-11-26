// SPDX-License-Identifier: AGPL-3.0-or-later
// Bodies of the private message objects (revision 0.4.0, PROTOCOL.md section 15). CLOSED schema in all of them.
// They only exist with `"v": "0.4"` and always with `previo: null`. The cipher (letter, message key) lives in messages.js.
import { fromB64u } from './canonical.js'
import { SIGNATURE_RE } from './keys.js'
import { ID_RE, UID_RE } from './social-bodies.js'
import { failure, closedObject, or_null, defaultValue, text, one_of } from './schema.js'
import { CONVERSATION_DECISIONS, MESSAGE_LIMITS as LM, REPORT_REASONS_V3 } from './limits.js'

const id = defaultValue(ID_RE, 'um id de objeto (ob_ e 43 caracteres)')
const uid = defaultValue(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)')

/** Bytes of a STRICT base64url with exactly `n` bytes, or null. */
export function bytesFromB64u(value, n) {
  try {
    const b = fromB64u(value)
    return n === undefined || b.length === n ? b : null
  } catch {
    return null
  }
}

const fixedBytes = (n, description) => (v, path) =>
  typeof v === 'string' && bytesFromB64u(v, n) !== null ? null : failure(path, `precisa ser ${description}`)

const cipherKey = fixedBytes(32, 'uma chave X25519 em base64url (32 bytes, 43 caracteres)')

/** The size of `cifrado` reveals only the 256-byte band: a 16-byte tag plus a multiple of 256, from 256 to 8192. */
export function ciphertextSizeMatches(value) {
  if (typeof value !== 'string') return false
  const b = bytesFromB64u(value)
  if (!b) return false
  const n = b.length - LM.tagBytes
  return n >= LM.blockBytes && n <= LM.plaintextMaxBytes && n % LM.blockBytes === 0
}

const ciphertext = (v, path) => (ciphertextSizeMatches(v) ? null : failure(path, `precisa ser o texto cifrado em base64url, com 16 bytes de etiqueta e um múltiplo de ${LM.blockBytes} bytes, de ${LM.blockBytes} a ${LM.plaintextMaxBytes}`))

/**
 * The text that the recipient reveals in a report. It does NOT go through the text filter: it must be exactly what the sender signed,
 * including what the filter would refuse (the abusive is what gets reported). Only well-formed Unicode and the byte ceiling are required.
 */
const revealedText = (v, path) => {
  if (typeof v !== 'string' || v.length === 0) return failure(path, 'precisa ser o texto revelado, não vazio')
  if (!v.isWellFormed()) return failure(path, 'precisa ser Unicode bem formado')
  if (Buffer.byteLength(v, 'utf8') > LM.revealedMaxBytes) return failure(path, `passa de ${LM.revealedMaxBytes} bytes`)
  return null
}

export const BODIES_V4 = Object.freeze({
  'chave-de-cifra': closedObject({ chave: cipherKey }),
  'conversa-pedir': closedObject({ alvo: uid, texto: text({ ...LM.pedido, multilinha: true, urls: 0, v3: true }) }),
  'conversa-decidir': closedObject({ conversa: id, decisao: one_of(CONVERSATION_DECISIONS) }),
  mensagem: closedObject({
    conversa: id,
    para: uid,
    chaveDe: cipherKey,
    chavePara: cipherKey,
    sal: fixedBytes(LM.saltBytes, `um sal de ${LM.saltBytes} bytes em base64url`),
    iv: fixedBytes(LM.ivBytes, `um iv de ${LM.ivBytes} bytes em base64url`),
    cifrado: ciphertext
  }),
  'conversa-apagar': closedObject({ conversa: id, mensagem: or_null(id) }),
  'mensagem-denuncia': closedObject({
    mensagem: id,
    motivo: one_of(REPORT_REASONS_V3),
    texto: revealedText,
    assinatura: defaultValue(SIGNATURE_RE, 'a assinatura da carta (86 caracteres)')
  })
})

/**
 * Rules that the schema does not reach. Outside the chain: `previo` is always null.
 * @returns {{ caminho: string, mensagem: string } | null}
 */
export function messageRules(object) {
  const { tipo: type, autor: author, corpo: body } = object
  if (object.previo !== null) return failure('objeto.previo', 'os objetos de mensagem ficam fora da cadeia do autor: previo precisa ser null')
  if (type === 'conversa-pedir' && body.alvo === author) return failure('objeto.corpo.alvo', 'um rover não pede conversa a si mesmo')
  if (type === 'mensagem' && body.para === author) return failure('objeto.corpo.para', 'um rover não manda mensagem a si mesmo')
  return null
}
