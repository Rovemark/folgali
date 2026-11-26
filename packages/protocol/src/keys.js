// SPDX-License-Identifier: AGPL-3.0-or-later
// Ed25519 keys of the protocol. The public key travels as base64url of the 32 raw bytes (43 characters),
// the signature as base64url of the 64 bytes (86 characters). Every signature carries a DOMAIN prefix,
// so a signature made for one purpose (object) never counts for another (attestation, approval).
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { fromB64u, toB64u } from './canonical.js'

/** Domain prefix of a signature use in a protocol version. Object and attestation 0.1 stay signed with the 0.1 prefix. */
export const domainOf = (version, usage) => `rover-network/${version}/${usage}\n`

/**
 * Domain prefix of an OBJECT. In 0.3 (and in 0.4, for messages) each type has its own (`rover-network/0.3/objeto/<tipo>\n`), so a signature made
 * for a wall note never counts as a topic. In 0.1 and 0.2 there is a single prefix for all types.
 */
export const objectDomain = (version, type) => domainOf(version, version === '0.1' || version === '0.2' ? 'objeto' : `objeto/${type}`)

// The domains of the 0.2 artifacts, which 0.3 keeps (the read credential did not change). For the other versions use `domainOf`.
const V02 = '0.2'
export const DOMAINS = Object.freeze({
  objeto: domainOf(V02, 'objeto'),
  atestadoHandle: domainOf(V02, 'atestado-handle'),
  aprovacao: domainOf(V02, 'aprovacao-humana'),
  autorizacao: domainOf(V02, 'autorizacao-permanente'),
  politica: domainOf(V02, 'politica-da-pessoa'),
  revogacao: domainOf(V02, 'revogar-autorizacao'),
  leitura: domainOf(V02, 'leitura')
})

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

export const PUBLIC_KEY_RE = /^[A-Za-z0-9_-]{43}$/
export const SIGNATURE_RE = /^[A-Za-z0-9_-]{86}$/

/** Generates a new pair. The public one goes to the network; the private one is a KeyObject that never leaves the process. */
export function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return { publicKey: publicFromKeyObject(publicKey), chavePrivada: privateKey }
}

export function publicFromKeyObject(keyObject) {
  const der = keyObject.export({ format: 'der', type: 'spki' })
  return toB64u(der.subarray(der.length - 32))
}

export function privateKeyFromSeed(seed32) {
  if (!Buffer.isBuffer(seed32) || seed32.length !== 32) throw new TypeError('a semente tem 32 bytes')
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed32]), format: 'der', type: 'pkcs8' })
}

export function publicKeyOf(privateKey) {
  return publicFromKeyObject(createPublicKey(privateKey))
}

const publicKeyCache = new Map()
const CACHE_CAP = 2000

/** Imports the raw public key. Returns null if it is not canonical base64url of exactly 32 bytes. */
export function importPublic(text) {
  const stored = publicKeyCache.get(text)
  if (stored) return stored
  let obj
  try {
    const raw = fromB64u(text)
    if (raw.length !== 32) return null
    obj = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' })
  } catch {
    return null
  }
  if (publicKeyCache.size >= CACHE_CAP) publicKeyCache.delete(publicKeyCache.keys().next().value)
  publicKeyCache.set(text, obj)
  return obj
}

export function signBytes(domain, bytes, privateKey) {
  return toB64u(sign(null, Buffer.concat([Buffer.from(domain, 'utf8'), bytes]), privateKey))
}

/** Any malformed input (wrong type, bad base64, wrong size, invalid key) gives false, never an exception. */
export function verifySignature(domain, bytes, signatureB64u, publicKeyB64u) {
  try {
    return verify(
      null,
      Buffer.concat([Buffer.from(domain, 'utf8'), bytes]),
      importPublic(publicKeyB64u),
      fromB64u(signatureB64u)
    )
  } catch {
    return false
  }
}

// A small-order key (identity, order 2, 4 or 8) lets anyone forge a signature "by it".
// Empirical test: the signature with R = the identity point and S = 0 only passes when k*A = 0, which happens
// with a chance of at least 1/8 per message on a small-order key and never on an ordinary key.
// With 128 messages, the false negative stays below 1 in 10^7.
const IDENTITY_SIGNATURE = Buffer.concat([Buffer.from([1]), Buffer.alloc(63)])
const PROBE_MESSAGES = Array.from({ length: 128 }, (_, i) => Buffer.from(`sonda-chave-fraca-${i}`))

export function smallOrderKey(publicKeyB64u) {
  const pub = importPublic(publicKeyB64u)
  for (const m of PROBE_MESSAGES) {
    try {
      if (verify(null, m, pub, IDENTITY_SIGNATURE)) return true
    } catch {
      return true
    }
  }
  return false
}
