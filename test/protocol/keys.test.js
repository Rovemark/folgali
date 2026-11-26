// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  DOMAINS, signBytes, domainOf, smallOrderKey, privateKeyFromSeed, publicKeyOf, generateKeyPair, importPublic, toB64u, verifySignature
} from '../../packages/protocol/src/index.js'

const msg = Buffer.from('mensagem de teste')

test('key pair: public key has 43 characters and signature 86', () => {
  const pair = generateKeyPair()
  assert.match(pair.publicKey, /^[A-Za-z0-9_-]{43}$/)
  const sig = signBytes(DOMAINS.objeto, msg, pair.chavePrivada)
  assert.match(sig, /^[A-Za-z0-9_-]{86}$/)
  assert.equal(verifySignature(DOMAINS.objeto, msg, sig, pair.publicKey), true)
})

test('a signature is invalid with another message, another key or another domain', () => {
  const a = generateKeyPair()
  const b = generateKeyPair()
  const sig = signBytes(DOMAINS.objeto, msg, a.chavePrivada)
  assert.equal(verifySignature(DOMAINS.objeto, Buffer.from('outra'), sig, a.publicKey), false)
  assert.equal(verifySignature(DOMAINS.objeto, msg, sig, b.publicKey), false)
  assert.equal(verifySignature(DOMAINS.aprovacao, msg, sig, a.publicKey), false)
  assert.equal(verifySignature(DOMAINS.atestadoHandle, msg, sig, a.publicKey), false)
})

test('the seven domains differ from each other, all of the current version and with the protocol prefix', () => {
  const all = Object.values(DOMAINS)
  assert.equal(new Set(all).size, 7)
  assert.deepEqual(Object.keys(DOMAINS).sort(), ['aprovacao', 'atestadoHandle', 'autorizacao', 'leitura', 'objeto', 'politica', 'revogacao'])
  for (const d of all) assert.match(d, /^rover-network\/0\.2\/[a-z-]+\n$/)
})

test('dominioDe builds the prefix from the version and the use', () => {
  assert.equal(domainOf('0.1', 'objeto'), 'rover-network/0.1/objeto\n')
  assert.equal(domainOf('0.2', 'leitura'), 'rover-network/0.2/leitura\n')
  assert.equal(DOMAINS.objeto, domainOf('0.2', 'objeto'))
})

test('malformed inputs give false, never an exception', () => {
  const a = generateKeyPair()
  const sig = signBytes(DOMAINS.objeto, msg, a.chavePrivada)
  for (const bad of [undefined, null, 5, '', 'curta', sig.slice(1), `${sig}A`, `${sig.slice(0, 85)}=`, sig.replace(/^./, '!')]) {
    assert.equal(verifySignature(DOMAINS.objeto, msg, bad, a.publicKey), false)
  }
  for (const bad of [undefined, null, 5, '', 'curta', `${a.publicKey}A`, a.publicKey.slice(1)]) {
    assert.equal(verifySignature(DOMAINS.objeto, msg, sig, bad), false)
  }
})

test('a signature with a tampered S bit does not pass', () => {
  const a = generateKeyPair()
  const sig = Buffer.from(signBytes(DOMAINS.objeto, msg, a.chavePrivada), 'base64url')
  sig[40] ^= 1
  assert.equal(verifySignature(DOMAINS.objeto, msg, toB64u(sig), a.publicKey), false)
})

test('importarPublica: only 32 bytes in base64url', () => {
  const a = generateKeyPair()
  assert.ok(importPublic(a.publicKey))
  assert.equal(importPublic(a.publicKey), importPublic(a.publicKey)) // the cache returns the same object
  assert.equal(importPublic('A'.repeat(42)), null)
  assert.equal(importPublic(42), null)
})

test('a private key from a seed is deterministic and consistent with the public one', () => {
  const seed = randomBytes(32)
  const p1 = privateKeyFromSeed(seed)
  const p2 = privateKeyFromSeed(Buffer.from(seed))
  assert.equal(publicKeyOf(p1), publicKeyOf(p2))
  const sig = signBytes(DOMAINS.objeto, msg, p1)
  assert.equal(verifySignature(DOMAINS.objeto, msg, sig, publicKeyOf(p2)), true)
  assert.throws(() => privateKeyFromSeed(Buffer.alloc(31)), /32 bytes/)
  assert.throws(() => privateKeyFromSeed('x'.repeat(32)), /32 bytes/)
})

test('small-order keys are caught, ordinary keys are not', () => {
  const identity = Buffer.alloc(32); identity[0] = 1
  const order2 = Buffer.alloc(32, 0xff); order2[0] = 0xec; order2[31] = 0x7f
  assert.equal(smallOrderKey(toB64u(identity)), true)
  assert.equal(smallOrderKey(toB64u(order2)), true)
  assert.equal(smallOrderKey(toB64u(Buffer.alloc(32))), true)
  assert.equal(smallOrderKey('lixo'), true)
  for (let i = 0; i < 25; i++) assert.equal(smallOrderKey(generateKeyPair().publicKey), false)
})

test('the forged identity signature does not pass verificarAssinatura with an ordinary key', () => {
  const forged = toB64u(Buffer.concat([Buffer.from([1]), Buffer.alloc(63)]))
  assert.equal(verifySignature(DOMAINS.objeto, msg, forged, generateKeyPair().publicKey), false)
})

test('public key cache: keeps up to the cap and evicts the oldest', () => {
  const fresh = () => toB64u(randomBytes(32))
  for (let i = 0; i < 2000; i++) importPublic(fresh()) // empties what earlier tests left
  const first = fresh()
  const object = importPublic(first)
  assert.ok(object)
  for (let i = 0; i < 1999; i++) importPublic(fresh()) // now there are 2000 in the cache: the first is still there
  assert.equal(importPublic(first), object)
  importPublic(fresh()) // one more entry already evicts the oldest
  assert.notEqual(importPublic(first), object)
})

test('verificarAssinatura: a wrong signature size and a key that does not import give false', () => {
  const a = generateKeyPair()
  const sig = Buffer.from(signBytes(DOMAINS.objeto, msg, a.chavePrivada), 'base64url')
  assert.equal(verifySignature(DOMAINS.objeto, msg, toB64u(sig.subarray(0, 63)), a.publicKey), false)
  assert.equal(verifySignature(DOMAINS.objeto, msg, toB64u(Buffer.concat([sig, Buffer.from([0])])), a.publicKey), false)
  assert.equal(verifySignature(DOMAINS.objeto, msg, toB64u(sig), 'A'.repeat(43)), false)
})
