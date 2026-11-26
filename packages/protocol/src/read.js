// SPDX-License-Identifier: AGPL-3.0-or-later
// READ credential of the rover itself (protocol 0.2). Whoever has a closed graph still needs to read their own home timeline and
// their own lists; for the relay to know the one asking is the rover, the GET request carries a signature from the NETWORK key:
//
//   Authorization: Rover-Assinatura uid=<uid>, t=<seconds>, a=<86-character signature>
//
// The signature covers the canonical JSON { alvo, metodo, t, uid }, with `alvo` the path plus the query EXACTLY as requested.
// So a captured credential does not work for another route, another rover or another method, and it expires in a few minutes.
import { canonicalBytes } from './canonical.js'
import { DOMAINS, signBytes, verifySignature } from './keys.js'
import { LIMITS } from './limits.js'

const CREDENTIAL_RE = /^Rover-Assinatura uid=(rvr_[A-Za-z0-9_-]{22}), t=(\d{10}), a=([A-Za-z0-9_-]{86})$/

const readBytes = ({ metodo: method, alvo: target, t, uid }) => canonicalBytes({ alvo: target, metodo: method, t, uid })

/** The value of the Authorization header for a read request. `alvo` is the path with the query, as it will be requested. */
export function createReadCredential({ chavePrivada: privateKey, uid, alvo: target, t, metodo: method = 'GET' }) {
  return `Rover-Assinatura uid=${uid}, t=${t}, a=${signBytes(DOMAINS.leitura, readBytes({ metodo: method, alvo: target, t, uid }), privateKey)}`
}

/** Reads the header. Returns null for anything that is not exactly the format above. */
export function readReadCredential(header) {
  const m = typeof header === 'string' ? CREDENTIAL_RE.exec(header) : null
  return m ? { uid: m[1], t: Number(m[2]), assinatura: m[3] } : null
}

/** Checks the time window and the signature against the rover's NETWORK key. */
export function readCredentialMatches(credential, { metodo: method, alvo: target, chave: key, agora: now }) {
  if (Math.abs(now - credential.t) > LIMITS.readToleranceS) return false
  return verifySignature(DOMAINS.leitura, readBytes({ metodo: method, alvo: target, t: credential.t, uid: credential.uid }), credential.assinatura, key)
}
