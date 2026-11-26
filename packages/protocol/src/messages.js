// SPDX-License-Identifier: AGPL-3.0-or-later
// The encryption of private messages (revision 0.4.0, PROTOCOL.md section 15.5). All with node:crypto, no dependency.
//
//   letter     = canonical({ conversa, criadoEm, de, iv, para, texto })
//   signature  = Ed25519(the sender's NETWORK key, "rover-network/0.4/carta\n" || letter)
//   plain      = canonical({ assinatura, texto }) padded with spaces up to a multiple of 256 bytes
//   Z          = X25519(own private encryption key, the other's public encryption key)            (an all-zero Z is refused)
//   context    = canonical({ chaveDe, chavePara, conversa, criadoEm, de, para })
//   K          = HKDF-SHA256(Z, salt, "rover-network/0.4/mensagem\n" || context, 32)
//   ciphertext = AES-256-GCM(K, iv, plain, AAD = context) || tag
//
// The secret Z is the same on both sides: the sender also decrypts what it sent. The signed letter inside the cipher is what lets the
// recipient report with proof of authorship without the relay holding any key.
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { canonicalBytes, canonicalize, isPlainObject, toB64u } from './canonical.js'
import { signBytes, domainOf, verifySignature } from './keys.js'
import { bytesFromB64u } from './message-bodies.js'
import { ProtocolError } from './errors.js'
import { MESSAGE_LIMITS as LM, MESSAGES_VERSION } from './limits.js'
import { validateText } from './text.js'

export const LETTER_DOMAIN = domainOf(MESSAGES_VERSION, 'carta')
export const MESSAGE_KEY_DOMAIN = domainOf(MESSAGES_VERSION, 'mensagem')

const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex')
const PKCS8_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex')

/** The text rules of a message body (the 0.3 ones), applied by the CLIENT before encrypting and after decrypting. */
export const MESSAGE_TEXT_RULES = Object.freeze({ ...LM.texto, multilinha: true, urls: LM.linksPerMessage, v3: true })

// ---------- X25519 keys ----------

const rawPublicKey = (keyObject) => {
  const der = keyObject.export({ format: 'der', type: 'spki' })
  return toB64u(der.subarray(der.length - 32))
}

/** A new ENCRYPTION pair (X25519), separate from the network and approval keys. The private one is a KeyObject that never leaves the process. */
export function generateCipherKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519')
  return { publicKey: rawPublicKey(publicKey), chavePrivada: privateKey }
}

export function cipherPrivateKeyFromSeed(seed32) {
  if (!Buffer.isBuffer(seed32) || seed32.length !== 32) throw new TypeError('a semente tem 32 bytes')
  return createPrivateKey({ key: Buffer.concat([PKCS8_X25519, seed32]), format: 'der', type: 'pkcs8' })
}

export const cipherPublicKeyOf = (privateKey) => rawPublicKey(createPublicKey(privateKey))

function importCipherPublicKey(text) {
  const raw = bytesFromB64u(text, 32)
  if (!raw) return null
  try {
    return createPublicKey({ key: Buffer.concat([SPKI_X25519, raw]), format: 'der', type: 'spki' })
  } catch {
    return null
  }
}

/** Z = X25519(private, public). An invalid or small-order key (all-zero Z) is `chave_fraca`. */
export function cipherSecret(privateKey, publicKeyB64u) {
  const publicKey = importCipherPublicKey(publicKeyB64u)
  let z = null
  try {
    z = publicKey ? diffieHellman({ privateKey: privateKey, publicKey: publicKey }) : null
  } catch {
    z = null
  }
  if (!z || z.every((b) => b === 0)) throw new ProtocolError('chave_fraca', { campo: 'chave' })
  return z
}

/** Is the public encryption key usable? A weak one is one that does not import or that, with any other, gives an all-zero secret (small order). */
export function weakCipherKey(publicKeyB64u) {
  try {
    cipherSecret(generateCipherKeyPair().chavePrivada, publicKeyB64u)
    return false
  } catch {
    return true
  }
}

// ---------- the letter ----------

const letterFields = ({ conversa: conversation, criadoEm: createdAt, de: from, iv, para: to, texto: text }) => ({ conversa: conversation, criadoEm: createdAt, de: from, iv, para: to, texto: text })

/** Signs the letter with the sender's NETWORK key. */
export const signLetter = (fields, networkPrivateKey) => signBytes(LETTER_DOMAIN, canonicalBytes(letterFields(fields)), networkPrivateKey)

/** Does the letter match the sender's NETWORK key? A malformed input gives false, never an exception. */
export function letterMatches(fields, signature, networkPublicKey) {
  try {
    return verifySignature(LETTER_DOMAIN, canonicalBytes(letterFields(fields)), signature, networkPublicKey)
  } catch {
    return false
  }
}

// ---------- the message key and the cipher ----------

const contextOf = ({ chaveDe: keyOf, chavePara: keyFor, conversa: conversation, criadoEm: createdAt, de: from, para: to }) => canonicalBytes({ chaveDe: keyOf, chavePara: keyFor, conversa: conversation, criadoEm: createdAt, de: from, para: to })

function messageKey(z, salt, context) {
  return Buffer.from(hkdfSync('sha256', z, salt, Buffer.concat([Buffer.from(MESSAGE_KEY_DOMAIN, 'utf8'), context]), 32))
}

function complete(bytes) {
  const size = Math.max(LM.blockBytes, Math.ceil(bytes.length / LM.blockBytes) * LM.blockBytes)
  return Buffer.concat([bytes, Buffer.alloc(size - bytes.length, 0x20)])
}

function aesGcm(k, iv, plaintext, context) {
  const c = createCipheriv('aes-256-gcm', k, iv, { authTagLength: LM.tagBytes })
  c.setAAD(context)
  return Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()])
}

/**
 * Builds the body of a `mensagem`. Applies the text rules BEFORE encrypting (the relay does not see them) and throws `esquema` if the text does not pass.
 * It also returns the message key and the letter's signature: the person's app uses both to check, with `cipherMatches`, that the
 * `cifrado` it approves contains the text it read.
 * @returns {{ corpo: object, messageKey: Buffer, assinatura: string }}
 */
export function encryptMessage({ texto: text, conversa: conversation, de: from, para: to, criadoEm: createdAt, networkPrivateKey, chavePrivadaDeCifra: cipherPrivateKey, otherCipherPublicKey, sal: salt = randomBytes(LM.saltBytes), iv = randomBytes(LM.ivBytes) }) {
  const m = validateText(text, MESSAGE_TEXT_RULES)
  if (m) throw new ProtocolError('esquema', { campo: 'texto', detalhe: `Campo texto: ${m}.` })
  const keyOf = cipherPublicKeyOf(cipherPrivateKey)
  const keyFor = otherCipherPublicKey
  const ivB64u = toB64u(iv)
  const signature = signLetter({ conversa: conversation, criadoEm: createdAt, de: from, iv: ivB64u, para: to, texto: text }, networkPrivateKey)
  const context = contextOf({ chaveDe: keyOf, chavePara: keyFor, conversa: conversation, criadoEm: createdAt, de: from, para: to })
  const k = messageKey(cipherSecret(cipherPrivateKey, keyFor), salt, context)
  const plaintext = complete(canonicalBytes({ assinatura: signature, texto: text }))
  const ciphertext = toB64u(aesGcm(k, iv, plaintext, context))
  return { corpo: { conversa: conversation, para: to, chaveDe: keyOf, chavePara: keyFor, sal: toB64u(salt), iv: ivB64u, cifrado: ciphertext }, messageKey: k, assinatura: signature }
}

const decoder = new TextDecoder('utf-8', { fatal: true })

/** From the padded plain text to `{ assinatura, texto }`, requiring the exact canonical form. null if it is not. */
function readPlaintext(plaintext) {
  let end = plaintext.length
  while (end > 0 && plaintext[end - 1] === 0x20) end--
  let s
  let v
  try {
    s = decoder.decode(plaintext.subarray(0, end))
    v = JSON.parse(s)
  } catch {
    return null
  }
  if (!isPlainObject(v) || Object.keys(v).sort().join(',') !== 'assinatura,texto') return null
  if (typeof v.assinatura !== 'string' || typeof v.texto !== 'string') return null
  try {
    if (canonicalize(v) !== s) return null
  } catch {
    return null
  }
  return { assinatura: v.assinatura, texto: v.texto }
}

/**
 * Decrypts a `mensagem` with the private encryption key of either side (the one who received or the one who sent) and checks the letter against the sender's
 * NETWORK key. Any failure is "unreadable": whoever calls it shows nothing of the message.
 * @returns {{ ok: true, texto: string, assinatura: string, withinRules: boolean } | { ok: false, motivo: string }}
 */
export function decryptMessage(object, { chavePrivadaDeCifra: cipherPrivateKey, senderNetworkPublicKey }) {
  const failed = (reason) => ({ ok: false, motivo: reason })
  if (object?.tipo !== 'mensagem' || !isPlainObject(object.corpo)) return failed('nao_e_mensagem')
  const { conversa: conversation, para: to, chaveDe: keyOf, chavePara: keyFor, sal: salt, iv, cifrado: ciphertext } = object.corpo
  const from = object.autor
  const mine = cipherPublicKeyOf(cipherPrivateKey)
  const fromOther = mine === keyFor ? keyOf : mine === keyOf ? keyFor : null
  if (fromOther === null) return failed('outra_chave')
  const saltB = bytesFromB64u(salt, LM.saltBytes)
  const ivB = bytesFromB64u(iv, LM.ivBytes)
  const ciphertextB = bytesFromB64u(ciphertext)
  if (!saltB || !ivB || !ciphertextB || ciphertextB.length <= LM.tagBytes) return failed('forma')
  const context = contextOf({ chaveDe: keyOf, chavePara: keyFor, conversa: conversation, criadoEm: object.criadoEm, de: from, para: to })
  let plaintext
  try {
    const k = messageKey(cipherSecret(cipherPrivateKey, fromOther), saltB, context)
    const d = createDecipheriv('aes-256-gcm', k, ivB, { authTagLength: LM.tagBytes })
    d.setAAD(context)
    d.setAuthTag(ciphertextB.subarray(ciphertextB.length - LM.tagBytes))
    plaintext = Buffer.concat([d.update(ciphertextB.subarray(0, ciphertextB.length - LM.tagBytes)), d.final()])
  } catch {
    return failed('cifra')
  }
  const read = readPlaintext(plaintext)
  if (!read) return failed('forma_do_claro')
  if (!letterMatches({ conversa: conversation, criadoEm: object.criadoEm, de: from, iv, para: to, texto: read.texto }, read.assinatura, senderNetworkPublicKey)) {
    return failed('carta')
  }
  return { ok: true, texto: read.texto, assinatura: read.assinatura, withinRules: validateText(read.texto, MESSAGE_TEXT_RULES) === null }
}

/**
 * For the person's app, before approving: is this object's `cifrado` the encryption of this text and this signature with this message
 * key? If the rover lies about the key, the recipient cannot decrypt (sees "unreadable"), never a text different from the one approved.
 */
export function cipherMatches(object, { texto: text, assinatura: signature, messageKey: k }) {
  try {
    const { conversa: conversation, para: to, chaveDe: keyOf, chavePara: keyFor, iv, cifrado: ciphertext } = object.corpo
    const context = contextOf({ chaveDe: keyOf, chavePara: keyFor, conversa: conversation, criadoEm: object.criadoEm, de: object.autor, para: to })
    const expected = aesGcm(k, bytesFromB64u(iv, LM.ivBytes), complete(canonicalBytes({ assinatura: signature, texto: text })), context)
    const received = bytesFromB64u(ciphertext)
    return received !== null && received.length === expected.length && timingSafeEqual(received, expected)
  } catch {
    return false
  }
}
