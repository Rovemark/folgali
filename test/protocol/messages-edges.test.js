// SPDX-License-Identifier: AGPL-3.0-or-later
// Edge cases of private message encryption (0.4.0) that mutation testing showed to be untested: the cipher key seed, the error code for an
// invalid key, the exact shape of the plaintext (readPlaintext), each body field that is missing or malformed, and the functions that
// promise "malformed input gives false, never an exception". To test the plaintext from the inside, the test encrypts an ARBITRARY plaintext with the
// message key that `encryptMessage` itself returns: this way only the plaintext changes, and decryption reaches it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import {
  ProtocolError, MESSAGE_LIMITS as LM, signLetter, canonicalBytes, canonicalize, letterMatches, cipherPrivateKeyFromSeed,
  cipherPublicKeyOf, cipherMatches, encryptMessage, createObject, decryptMessage, generateCipherKeyPair, generateKeyPair, toB64u, cipherSecret
} from '../../packages/protocol/src/index.js'
import { NOW, newUid } from '../helpers/world.js'

const id = () => `ob_${toB64u(randomBytes(32))}`
const person = () => ({ uid: newUid(), rede: generateKeyPair(), cifra: generateCipherKeyPair() })
const object = (author, type, body, { criadoEm: createdAt = NOW } = {}) =>
  createObject({ v: '0.4', tipo: type, autor: author.uid, criadoEm: createdAt, previo: null, corpo: body, chavePrivada: author.rede.chavePrivada })

/** A real message from `a` to `b`, and the function that swaps the plaintext inside it for anything, encrypted with the same key. */
function scenario(text = 'Combinamos amanhã?') {
  const a = person()
  const b = person()
  const conversation = id()
  const m = encryptMessage({ texto: text, conversa: conversation, de: a.uid, para: b.uid, criadoEm: NOW, networkPrivateKey: a.rede.chavePrivada, chavePrivadaDeCifra: a.cifra.chavePrivada, otherCipherPublicKey: b.cifra.publicKey })
  const context = canonicalBytes({ chaveDe: m.corpo.chaveDe, chavePara: m.corpo.chavePara, conversa: conversation, criadoEm: NOW, de: a.uid, para: b.uid })
  const withLight = (plaintext) => {
    const c = createCipheriv('aes-256-gcm', m.messageKey, Buffer.from(m.corpo.iv, 'base64url'), { authTagLength: LM.tagBytes })
    c.setAAD(context)
    const ciphertext = toB64u(Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()]))
    return object(a, 'mensagem', { ...m.corpo, cifrado: ciphertext })
  }
  /** The right letter signature for any text (the plaintext must carry the signature of the text it states). */
  const signBytes = (t) => signLetter({ conversa: conversation, criadoEm: NOW, de: a.uid, iv: m.corpo.iv, para: b.uid, texto: t }, a.rede.chavePrivada)
  const read = (o) => decryptMessage(o, { chavePrivadaDeCifra: b.cifra.chavePrivada, senderNetworkPublicKey: a.rede.publicKey })
  const complete = (buf) => Buffer.concat([buf, Buffer.alloc(Math.max(256, Math.ceil(buf.length / 256) * 256) - buf.length, 0x20)])
  return { a, b, m, conversa: conversation, withLight, signBytes, ler: read, complete }
}

test('the cipher key seed: 32 bytes in a Buffer, deterministic; anything else is a stated TypeError', () => {
  const s = randomBytes(32)
  const k1 = cipherPrivateKeyFromSeed(s)
  assert.equal(cipherPublicKeyOf(k1), cipherPublicKeyOf(cipherPrivateKeyFromSeed(Buffer.from(s))), 'the same seed gives the same key')
  assert.notEqual(cipherPublicKeyOf(k1), cipherPublicKeyOf(cipherPrivateKeyFromSeed(randomBytes(32))))
  for (const bad of [randomBytes(31), randomBytes(33), Buffer.alloc(0), 'x'.repeat(32), new Uint8Array(32), null, undefined]) {
    assert.throws(() => cipherPrivateKeyFromSeed(bad), (e) => e instanceof TypeError && /a semente tem 32 bytes/.test(e.message), String(bad?.length))
  }
})

test('cipherSecret: a public key that does not import, or of small order, is a ProtocolError `chave_fraca` on the `chave` field', () => {
  const p = generateCipherKeyPair()
  const one = Buffer.alloc(32)
  one[0] = 1
  for (const bad of ['curta', '', toB64u(Buffer.alloc(31)), toB64u(Buffer.alloc(32)), toB64u(one), 42, null]) {
    assert.throws(() => cipherSecret(p.chavePrivada, bad), (e) => e instanceof ProtocolError && e.codigo === 'chave_fraca' && e.campo === 'chave', String(bad))
  }
  const q = generateCipherKeyPair()
  assert.ok(cipherSecret(p.chavePrivada, q.publicKey).equals(cipherSecret(q.chavePrivada, p.publicKey)), 'the secret is the same on both sides')
})

test('letterMatches: input that cannot even be serialized or a signature that is not text gives false, never an exception', () => {
  const a = person()
  const letter = { conversa: id(), criadoEm: NOW, de: a.uid, iv: toB64u(randomBytes(12)), para: newUid(), texto: 'oi' }
  const sig = signLetter(letter, a.rede.chavePrivada)
  assert.equal(letterMatches(letter, sig, a.rede.publicKey), true, 'controle')
  for (const [name, c, s, k] of [
    ['criadoEm BigInt', { ...letter, criadoEm: 1n }, sig, a.rede.publicKey],
    ['texto que é função', { ...letter, texto: () => 'oi' }, sig, a.rede.publicKey],
    ['assinatura número', letter, 5, a.rede.publicKey],
    ['chave nula', letter, sig, null],
    ['campos nulos', null, sig, a.rede.publicKey]
  ]) assert.equal(letterMatches(c, s, k), false, name)
})

test('decrypt: only an object of type mensagem with a plain object body', () => {
  const { m, a, ler: read } = scenario()
  const right = object(a, 'mensagem', m.corpo)
  assert.equal(read(right).ok, true, 'controle')
  assert.deepEqual(read({ ...right, tipo: 'postagem' }), { ok: false, motivo: 'nao_e_mensagem' }, 'perfect message body, wrong type')
  assert.deepEqual(read({ ...right, corpo: null }), { ok: false, motivo: 'nao_e_mensagem' })
  assert.deepEqual(read({ ...right, corpo: [m.corpo] }), { ok: false, motivo: 'nao_e_mensagem' })
  assert.deepEqual(read(null), { ok: false, motivo: 'nao_e_mensagem' })
  assert.deepEqual(read(undefined), { ok: false, motivo: 'nao_e_mensagem' })
})

test('decrypt: malformed or wrong-sized sal, iv and cifrado are `forma`, each one alone', () => {
  const { m, a, ler: read } = scenario()
  const using = (swap) => read(object(a, 'mensagem', { ...m.corpo, ...swap }))
  assert.deepEqual(using({ sal: 'não é base64url' }), { ok: false, motivo: 'forma' }, 'only the sal malformed')
  assert.deepEqual(using({ sal: toB64u(randomBytes(LM.saltBytes - 1)) }), { ok: false, motivo: 'forma' }, 'short sal')
  assert.deepEqual(using({ iv: 'não é base64url' }), { ok: false, motivo: 'forma' }, 'only the iv malformed')
  assert.deepEqual(using({ iv: toB64u(randomBytes(LM.ivBytes + 1)) }), { ok: false, motivo: 'forma' }, 'long iv')
  assert.deepEqual(using({ cifrado: 'não é base64url' }), { ok: false, motivo: 'forma' }, 'only the cifrado malformed')
  assert.deepEqual(using({ cifrado: toB64u(randomBytes(LM.tagBytes)) }), { ok: false, motivo: 'forma' }, 'only the tag, with nothing encrypted')
  assert.deepEqual(using({ cifrado: toB64u(randomBytes(LM.tagBytes + 1)) }), { ok: false, motivo: 'cifra' }, 'one byte beyond the tag is already ciphertext (which does not match)')
})

test('the plaintext: the exact canonical form of { assinatura, texto } padded with spaces, and nothing else', () => {
  const c = scenario()
  const text = 'Combinamos amanhã?'
  const plaintext = (v) => c.complete(Buffer.from(typeof v === 'string' ? v : canonicalize(v), 'utf8'))
  // control: a plaintext built by the test the same way the protocol builds it is read
  assert.deepEqual(c.ler(c.withLight(plaintext({ assinatura: c.signBytes(text), texto: text }))), { ok: true, texto: text, assinatura: c.signBytes(text), withinRules: true })
  const lightShape = { ok: false, motivo: 'forma_do_claro' }
  // one key too many, one key too few, a list, loose text
  assert.deepEqual(c.ler(c.withLight(plaintext({ assinatura: c.signBytes(text), texto: text, x: 1 }))), lightShape, 'extra field')
  assert.deepEqual(c.ler(c.withLight(plaintext({ texto: text }))), lightShape, 'no signature')
  assert.deepEqual(c.ler(c.withLight(plaintext([c.signBytes(text), text]))), lightShape, 'list')
  assert.deepEqual(c.ler(c.withLight(plaintext('"só um texto"'))), lightShape, 'loose JSON text')
  // wrong types inside: signature a number, text a number
  assert.deepEqual(c.ler(c.withLight(plaintext({ assinatura: 5, texto: text }))), lightShape, 'signature that is not text')
  assert.deepEqual(c.ler(c.withLight(plaintext({ assinatura: c.signBytes(text), texto: 5 }))), lightShape, 'text that is not text')
  // valid JSON but outside the canonical form (keys out of order, space after the colon)
  const sig = c.signBytes(text)
  assert.deepEqual(c.ler(c.withLight(plaintext(`{"texto":${JSON.stringify(text)},"assinatura":"${sig}"}`))), lightShape, 'keys out of order')
  assert.deepEqual(c.ler(c.withLight(plaintext(`{"assinatura": "${sig}","texto":${JSON.stringify(text)}}`))), lightShape, 'extra space')
  // not JSON, only spaces, empty
  assert.deepEqual(c.ler(c.withLight(plaintext('isto não é JSON'))), lightShape)
  assert.deepEqual(c.ler(c.withLight(Buffer.alloc(256, 0x20))), lightShape, 'only spaces')
})

test('the plaintext must be valid UTF-8: a stray byte does not become the replacement character', () => {
  const c = scenario()
  // the letter is signed for "a�b" and the plaintext carries the byte 0xFF in place of U+FFFD: a lenient decoder would read the same letter
  const text = 'a�b'
  const valid = Buffer.from(canonicalize({ assinatura: c.signBytes(text), texto: text }), 'utf8')
  assert.equal(c.ler(c.withLight(c.complete(valid))).ok, true, 'control: with the U+FFFD in real UTF-8, the letter matches')
  const position = valid.indexOf(Buffer.from('�', 'utf8'))
  const crooked = Buffer.concat([valid.subarray(0, position), Buffer.from([0xff]), valid.subarray(position + 3)])
  assert.deepEqual(c.ler(c.withLight(c.complete(crooked))), { ok: false, motivo: 'forma_do_claro' })
})

test('cipherMatches: an object without a body, malformed iv or missing cifrado gives false, never an exception', () => {
  const { m, a } = scenario('Pode ser às 15h.')
  const right = object(a, 'mensagem', m.corpo)
  const approved = { texto: 'Pode ser às 15h.', assinatura: m.assinatura, messageKey: m.messageKey }
  assert.equal(cipherMatches(right, approved), true, 'controle')
  assert.equal(cipherMatches({}, approved), false, 'no body')
  assert.equal(cipherMatches(null, approved), false)
  assert.equal(cipherMatches({ ...right, corpo: { ...m.corpo, iv: 'torto' } }, approved), false, 'malformed iv')
  assert.equal(cipherMatches({ ...right, corpo: { ...m.corpo, cifrado: undefined } }, approved), false, 'no cifrado')
  assert.equal(cipherMatches(right, { ...approved, messageKey: Buffer.alloc(5) }), false, 'key of the wrong size')
})
