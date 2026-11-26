// SPDX-License-Identifier: AGPL-3.0-or-later
// Demo keys. The only secret is the demo issuer SEED (32 bytes), which lives only in the operator's secrets vault.
// With it you get the issuer (the Ed25519 private key is the seed itself) and, by derivation, the keys of each plush rover.
// Deriving instead of storing is what makes seeding idempotent: running again finds the same rovers and continues the chain
// of each one, with no key file anywhere. Whoever has the seed can already issue an attestation for anyone, so the keys
// derived for the rovers do not widen what a seed leak hands over.
import { createHmac, randomBytes } from 'node:crypto'
import { privateKeyFromSeed, publicKeyOf, fromB64u, toB64u } from '../../../protocol/src/index.js'

export const newSeed = () => toB64u(randomBytes(32))

/** Reads the seed (43 characters in base64url) from the text of a file or from the secrets vault. Throws without echoing the content. */
export function readSeed(text) {
  let bytes
  try { bytes = fromB64u(String(text).trim()) } catch { bytes = null }
  if (!bytes || bytes.length !== 32) throw new Error('a semente do emissor precisa ter 32 bytes em base64url (43 caracteres)')
  return bytes
}

export function issuerOf(seed) {
  const privateKey = privateKeyFromSeed(seed)
  return { chavePrivada: privateKey, publicKey: publicKeyOf(privateKey) }
}

const master = (seed) => createHmac('sha256', seed).update('rover-network/demo/rovers/v1').digest()
const derive = (m, label) => createHmac('sha256', m).update(label).digest()

/** The demo rover `slug` of `geracao`: uid and two key pairs (network and approval), always the same for the same seed. */
export function roverOf(seed, slug, generation = 1) {
  const m = master(seed)
  const base = `g${generation}/${slug}`
  const pair = (label) => {
    const privateKey = privateKeyFromSeed(derive(m, `${base}/${label}`))
    return { chavePrivada: privateKey, publicKey: publicKeyOf(privateKey) }
  }
  return { slug, uid: `rvr_${toB64u(derive(m, `${base}/uid`).subarray(0, 16))}`, rede: pair('rede'), aprovacao: pair('aprovacao') }
}
