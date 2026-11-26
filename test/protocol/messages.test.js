// SPDX-License-Identifier: AGPL-3.0-or-later
// Private messages (revision 0.4.0): shape of the six types and the encryption (letter, X25519, HKDF, AES-256-GCM). PROTOCOL.md section 15.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  LETTER_DOMAIN, MESSAGE_REQUIRES_APPROVAL, LIMITS, MESSAGE_LIMITS as LM, AUTHORIZABLE_TYPES_V3, MESSAGE_TYPES, OBJECT_TYPES,
  REQUIRABLE_TYPES_V3, signLetter, objectSignatureMatches, canonicalize, letterMatches, weakCipherKey, cipherPublicKeyOf,
  cipherMatches, encryptMessage, createObject, decryptMessage, objectDomain, requiresApproval, generateCipherKeyPair, generateKeyPair, toB64u,
  ciphertextSizeMatches, validateObject
} from '../../packages/protocol/src/index.js'
import { NOW, newUid } from '../helpers/world.js'

const id = () => `ob_${toB64u(randomBytes(32))}`
const person = () => ({ uid: newUid(), rede: generateKeyPair(), cifra: generateCipherKeyPair() })
const object = (author, type, body, { v = '0.4', previo: previous = null, criadoEm: createdAt = NOW } = {}) =>
  createObject({ v, tipo: type, autor: author.uid, criadoEm: createdAt, previo: previous, corpo: body, chavePrivada: author.rede.chavePrivada })
const refusal = (o, code, field) => {
  const r = validateObject(o)
  assert.equal(r.ok, false, `expected refusal ${code}`)
  assert.equal(r.erro.codigo, code)
  if (field) assert.equal(r.erro.campo, field)
}

/** A message from `from` to `to`, really encrypted. */
function message(from, to, text = 'Oi! Combinamos amanhã?', { conversa: conversation = id(), criadoEm: createdAt = NOW, otherKey = to.cifra.publicKey } = {}) {
  const c = encryptMessage({ texto: text, conversa: conversation, de: from.uid, para: to.uid, criadoEm: createdAt, networkPrivateKey: from.rede.chavePrivada, chavePrivadaDeCifra: from.cifra.chavePrivada, otherCipherPublicKey: otherKey })
  return { ...c, objeto: object(from, 'mensagem', c.corpo, { criadoEm: createdAt }) }
}

test('six new types, only in 0.4, outside OBJECT_TYPES, the policy and the standing authorization', () => {
  assert.deepEqual([...MESSAGE_TYPES], ['chave-de-cifra', 'conversa-pedir', 'conversa-decidir', 'mensagem', 'conversa-apagar', 'mensagem-denuncia'])
  for (const t of MESSAGE_TYPES) {
    assert.equal(OBJECT_TYPES.includes(t), false, t)
    assert.equal(REQUIRABLE_TYPES_V3.includes(t), false, t)
    assert.equal(AUTHORIZABLE_TYPES_V3.includes(t), false, t)
    assert.equal(typeof MESSAGE_REQUIRES_APPROVAL[t], 'boolean', t)
  }
  // request, decision and message: always; and not even an empty policy changes that
  for (const t of ['conversa-pedir', 'conversa-decidir', 'mensagem']) assert.equal(requiresApproval(t, []), true, t)
  for (const t of ['chave-de-cifra', 'conversa-apagar', 'mensagem-denuncia']) assert.equal(requiresApproval(t, []), false, t)
})

test('shape: each valid type passes, and 0.4 exists only for them (and they only in 0.4)', () => {
  const a = person()
  const b = person()
  const m = message(a, b)
  const valid = {
    'chave-de-cifra': { chave: a.cifra.publicKey },
    'conversa-pedir': { alvo: b.uid, texto: 'Posso te mandar uma mensagem sobre o projeto?' },
    'conversa-decidir': { conversa: id(), decisao: 'aceitar' },
    mensagem: m.corpo,
    'conversa-apagar': { conversa: id(), mensagem: null },
    'mensagem-denuncia': { mensagem: id(), motivo: 'assedio', texto: 'qualquer coisa', assinatura: m.assinatura }
  }
  for (const [type, body] of Object.entries(valid)) {
    const o = object(a, type, body)
    assert.equal(validateObject(o).ok, true, type)
    assert.equal(objectSignatureMatches(o, a.rede.publicKey), true, type)
    refusal(object(a, type, body, { v: '0.3' }), 'esquema', 'objeto.tipo')
  }
  refusal(object(a, 'postagem', { texto: 'oi', topicos: [] }), 'esquema', 'objeto.tipo')
})

test('outside the chain: previo must be null; nobody requests a conversation or sends a message to themselves', () => {
  const a = person()
  refusal(object(a, 'chave-de-cifra', { chave: a.cifra.publicKey }, { previo: id() }), 'esquema', 'objeto.previo')
  refusal(object(a, 'conversa-pedir', { alvo: a.uid, texto: 'oi' }), 'esquema', 'objeto.corpo.alvo')
  const b = person()
  const m = message(a, b)
  refusal(object(a, 'mensagem', { ...m.corpo, para: a.uid }), 'esquema', 'objeto.corpo.para')
})

test('the domain prefix carries the 0.4 version and the type: signing as 0.3 or as another type does not match', () => {
  const a = person()
  assert.equal(objectDomain('0.4', 'mensagem'), 'rover-network/0.4/objeto/mensagem\n')
  assert.equal(objectDomain('0.2', 'postagem'), 'rover-network/0.2/objeto\n')
  const o = object(a, 'conversa-decidir', { conversa: id(), decisao: 'recusar' })
  assert.equal(objectSignatureMatches({ ...o, tipo: 'conversa-apagar' }, a.rede.publicKey), false)
  assert.equal(objectSignatureMatches({ ...o, v: '0.3' }, a.rede.publicKey), false)
})

test('conversation request: up to 280 characters, no link, with the personal data filter', () => {
  const a = person()
  const b = person()
  const request = (text) => object(a, 'conversa-pedir', { alvo: b.uid, texto: text })
  const phrase = (n) => 'oi, tudo bem por aí? '.repeat(20).slice(0, n - 1) + 'x'
  assert.equal(validateObject(request(phrase(LM.pedido.max))).ok, true)
  refusal(request(phrase(LM.pedido.max + 1)), 'esquema', 'objeto.corpo.texto')
  refusal(request('veja https://exemplo.com.br/agenda'), 'esquema', 'objeto.corpo.texto')
  refusal(request('me escreve em ana@exemplo.com'), 'esquema', 'objeto.corpo.texto')
  refusal(request(''), 'esquema', 'objeto.corpo.texto')
})

test('size of the cifrado: 16 bytes of tag plus a multiple of 256, from 256 to 8192', () => {
  const b64 = (n) => toB64u(randomBytes(n))
  assert.equal(ciphertextSizeMatches(b64(16 + 256)), true)
  assert.equal(ciphertextSizeMatches(b64(16 + 8192)), true)
  assert.equal(ciphertextSizeMatches(b64(16 + 255)), false)
  assert.equal(ciphertextSizeMatches(b64(16 + 512 + 1)), false)
  assert.equal(ciphertextSizeMatches(b64(16 + 8192 + 256)), false)
  assert.equal(ciphertextSizeMatches(`${b64(16 + 256)}=`), false)
  for (const crooked of [123, null, undefined, {}, ['x']]) assert.equal(ciphertextSizeMatches(crooked), false, String(crooked))
  const a = person()
  const m = message(a, person())
  refusal(object(a, 'mensagem', { ...m.corpo, cifrado: b64(16 + 300) }), 'esquema', 'objeto.corpo.cifrado')
  refusal(object(a, 'mensagem', { ...m.corpo, iv: b64(16) }), 'esquema', 'objeto.corpo.iv')
  refusal(object(a, 'mensagem', { ...m.corpo, sal: b64(16) }), 'esquema', 'objeto.corpo.sal')
  refusal(object(a, 'mensagem', { ...m.corpo, chavePara: b64(31) }), 'esquema', 'objeto.corpo.chavePara')
})

test('the largest possible message (2000 characters of 4 bytes) fits in the object and in the cifrado cap', () => {
  const a = person()
  const b = person()
  const text = '🙂'.repeat(LM.texto.max)
  const m = message(a, b, text)
  assert.equal(validateObject(m.objeto).ok, true)
  assert.ok(Buffer.byteLength(canonicalize(m.objeto)) <= LIMITS.objetoBytes, `${Buffer.byteLength(canonicalize(m.objeto))} bytes`)
  assert.throws(() => message(a, b, '🙂'.repeat(LM.texto.max + 1)), (e) => e.codigo === 'esquema' && e.campo === 'texto')
  // the text revealed in a report does not go through the filter, only through the byte cap
  const rep = (t) => object(b, 'mensagem-denuncia', { mensagem: m.objeto.id, motivo: 'golpe', texto: t, assinatura: m.assinatura })
  assert.equal(validateObject(rep('manda o pix para ana@exemplo.com <b>agora</b>')).ok, true)
  assert.equal(validateObject(rep('a'.repeat(LM.revealedMaxBytes))).ok, true)
  refusal(rep('a'.repeat(LM.revealedMaxBytes + 1)), 'esquema', 'objeto.corpo.texto')
})

test('happy path: the receiver and the sender decrypt, the letter matches the sender network key', () => {
  const a = person()
  const b = person()
  const m = message(a, b, 'Linha 1\nLinha 2 com acentuação: ação, café.')
  const ofB = decryptMessage(m.objeto, { chavePrivadaDeCifra: b.cifra.chavePrivada, senderNetworkPublicKey: a.rede.publicKey })
  const ofA = decryptMessage(m.objeto, { chavePrivadaDeCifra: a.cifra.chavePrivada, senderNetworkPublicKey: a.rede.publicKey })
  assert.deepEqual([ofB.ok, ofA.ok], [true, true])
  assert.equal(ofB.texto, 'Linha 1\nLinha 2 com acentuação: ação, café.')
  assert.equal(ofB.assinatura, m.assinatura)
  assert.equal(ofB.withinRules, true)
  const letter = { conversa: m.corpo.conversa, criadoEm: NOW, de: a.uid, iv: m.corpo.iv, para: b.uid, texto: ofB.texto }
  assert.equal(letterMatches(letter, ofB.assinatura, a.rede.publicKey), true)
  assert.equal(LETTER_DOMAIN, 'rover-network/0.4/carta\n')
})

test('a third party cannot decrypt; the plaintext has a 256-byte band (the exact size does not show)', () => {
  const a = person()
  const b = person()
  const m = message(a, b)
  const intruder = generateCipherKeyPair()
  assert.deepEqual(decryptMessage(m.objeto, { chavePrivadaDeCifra: intruder.chavePrivada, senderNetworkPublicKey: a.rede.publicKey }), { ok: false, motivo: 'outra_chave' })
  const short = message(a, b, 'a')
  const media = message(a, b, 'bom dia '.repeat(15).trim())
  assert.equal(short.corpo.cifrado.length, media.corpo.cifrado.length)
  assert.notEqual(message(a, b, 'bom dia '.repeat(30).trim()).corpo.cifrado.length, short.corpo.cifrado.length)
})

test('tampered message: one byte of the cifrado, the context (conversation) or the tag altered, and nothing is decrypted', () => {
  const a = person()
  const b = person()
  const m = message(a, b)
  const read = (o) => decryptMessage(o, { chavePrivadaDeCifra: b.cifra.chavePrivada, senderNetworkPublicKey: a.rede.publicKey })
  const bytes = Buffer.from(m.corpo.cifrado, 'base64url')
  bytes[10] ^= 1
  assert.deepEqual(read({ ...m.objeto, corpo: { ...m.corpo, cifrado: toB64u(bytes) } }), { ok: false, motivo: 'cifra' })
  // the same cifrado moved to another conversation (even if the author re-signs the object) does not decrypt: the context is authenticated data
  const moved = object(a, 'mensagem', { ...m.corpo, conversa: id() })
  assert.deepEqual(read(moved), { ok: false, motivo: 'cifra' })
  assert.deepEqual(read({ ...m.objeto, criadoEm: NOW + 1 }), { ok: false, motivo: 'cifra' })
})

test('swapped cipher: encrypted for another key and announced as if it were for the recipient key', () => {
  const a = person()
  const b = person()
  const other = generateCipherKeyPair()
  // `a` encrypts with another key, but the body says chavePara = key of `b`
  const wrong = message(a, b, 'oi', { otherKey: other.publicKey })
  const forged = object(a, 'mensagem', { ...wrong.corpo, chavePara: b.cifra.publicKey })
  assert.deepEqual(decryptMessage(forged, { chavePrivadaDeCifra: b.cifra.chavePrivada, senderNetworkPublicKey: a.rede.publicKey }), { ok: false, motivo: 'cifra' })
})

test('letter from another: a correct ciphertext, but signed with a network key that is not the sender one', () => {
  const a = person()
  const b = person()
  const impostor = generateKeyPair()
  const conversation = id()
  const m = encryptMessage({ texto: 'sou eu', conversa: conversation, de: a.uid, para: b.uid, criadoEm: NOW, networkPrivateKey: impostor.chavePrivada, chavePrivadaDeCifra: a.cifra.chavePrivada, otherCipherPublicKey: b.cifra.publicKey })
  const o = object(a, 'mensagem', m.corpo)
  assert.deepEqual(decryptMessage(o, { chavePrivadaDeCifra: b.cifra.chavePrivada, senderNetworkPublicKey: a.rede.publicKey }), { ok: false, motivo: 'carta' })
})

test('the letter does not move between messages: another iv, another conversation, another end or another text does not match', () => {
  const a = person()
  const letter = { conversa: id(), criadoEm: NOW, de: a.uid, iv: toB64u(randomBytes(12)), para: newUid(), texto: 'oi' }
  const sig = signLetter(letter, a.rede.chavePrivada)
  assert.equal(letterMatches(letter, sig, a.rede.publicKey), true)
  for (const tweaks of [{ iv: toB64u(randomBytes(12)) }, { conversa: id() }, { para: newUid() }, { texto: 'oi!' }, { criadoEm: NOW + 1 }]) {
    assert.equal(letterMatches({ ...letter, ...tweaks }, sig, a.rede.publicKey), false, Object.keys(tweaks)[0])
  }
  assert.equal(letterMatches(letter, 'x'.repeat(86), a.rede.publicKey), false)
})

test('the text rules apply BEFORE encrypting: e-mail, HTML and http link never leave the client', () => {
  const a = person()
  const b = person()
  for (const t of ['me chama em ana@exemplo.com', '<script>x</script>', 'http://exemplo.com.br', '']) {
    assert.throws(() => message(a, b, t), (e) => e.codigo === 'esquema' && e.campo === 'texto', t)
  }
  assert.ok(message(a, b, 'veja https://exemplo.com.br/agenda').corpo)
})

test('cipherMatches: the person app redoes the encryption with the message key and checks the text being approved', () => {
  const a = person()
  const b = person()
  const m = message(a, b, 'Pode ser às 15h.')
  assert.equal(cipherMatches(m.objeto, { texto: 'Pode ser às 15h.', assinatura: m.assinatura, messageKey: m.messageKey }), true)
  assert.equal(cipherMatches(m.objeto, { texto: 'Pode ser às 16h.', assinatura: m.assinatura, messageKey: m.messageKey }), false)
  assert.equal(cipherMatches(m.objeto, { texto: 'Pode ser às 15h.', assinatura: m.assinatura, messageKey: randomBytes(32) }), false)
})

test('weak cipher key: zero and small-order points are refused; an ordinary key passes', () => {
  assert.equal(weakCipherKey(toB64u(Buffer.alloc(32))), true)
  const one = Buffer.alloc(32)
  one[0] = 1
  assert.equal(weakCipherKey(toB64u(one)), true)
  assert.equal(weakCipherKey('curta'), true)
  assert.equal(weakCipherKey(generateCipherKeyPair().publicKey), false)
  const pair = generateCipherKeyPair()
  assert.equal(cipherPublicKeyOf(pair.chavePrivada), pair.publicKey)
})
