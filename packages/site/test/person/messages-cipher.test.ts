// @vitest-environment node
// The browser cipher of private messages (src/lib/person/cipher.ts, WebCrypto) against the protocol package (packages/protocol,
// node:crypto): a message the site encrypts decrypts with `decifrarMensagem`, one the protocol encrypts decrypts on the site, byte for
// byte the same `cifrado` with the same salt and iv, and a tampered letter, a swapped cipher, a moved context or a foreign key are refused.
import { createPrivateKey, createPublicKey, webcrypto } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { attestedNetworkKey, decryptMessage, encryptMessage, fromB64u, generateCipherPair, MESSAGE_LIMITS, objectConfirms, pad, readPlain, sharedSecret } from '@/lib/person/cipher'
import { signObject, toB64u, type SignedObject } from '@/lib/person/device'

const protocolPath = fileURLToPath(new URL('../../../protocol/src/index.js', import.meta.url))
const subtle = webcrypto.subtle as unknown as SubtleCrypto
const CONV = `ob_${'C'.repeat(43)}`
const ANA = 'rvr_' + 'A'.repeat(22)
const BIA = 'rvr_' + 'B'.repeat(22)
const T = 1_900_000_000

/** A WebCrypto key pair whose private half also exists as a node KeyObject (for the protocol side of the same person). */
async function both(name: 'Ed25519' | 'X25519') {
  const pair = (await subtle.generateKey({ name }, true, name === 'Ed25519' ? ['sign', 'verify'] : ['deriveBits'])) as CryptoKeyPair
  const pkcs8 = Buffer.from(await subtle.exportKey('pkcs8', pair.privateKey))
  const pub = toB64u(await subtle.exportKey('raw', pair.publicKey))
  return { web: pair.privateKey, node: createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' }), pub }
}

describe.skipIf(!existsSync(protocolPath))('the site cipher is the protocol cipher', async () => {
  const P = await import(/* @vite-ignore */ protocolPath)

  it('the limits are the protocol numbers', () => {
    const L = P.MESSAGE_LIMITS
    expect(MESSAGE_LIMITS).toMatchObject({ blockBytes: L.blockBytes, plainMaxBytes: L.plaintextMaxBytes, tagBytes: L.tagBytes, saltBytes: L.saltBytes, ivBytes: L.ivBytes, textMax: L.texto.max, requestMax: L.pedido.max, linksPerMessage: L.linksPerMessage })
    expect(P.LETTER_DOMAIN).toBe('rover-network/0.4/carta\n')
    expect(P.MESSAGE_KEY_DOMAIN).toBe('rover-network/0.4/mensagem\n')
  })

  it('site encrypts, protocol decrypts (receiver and sender), and the bytes equal the protocol ones with the same salt and iv', async () => {
    const [anaNet, anaCipher, biaCipher] = await Promise.all([both('Ed25519'), both('X25519'), both('X25519')])
    const text = 'Oi, Bia! Amanhã às 9h? 😀\nçãé 日本語 مرحبا'
    const salt = webcrypto.getRandomValues(new Uint8Array(32))
    const iv = webcrypto.getRandomValues(new Uint8Array(12))
    const { corpo: body, assinatura: signature } = await encryptMessage({ texto: text, conversa: CONV, de: ANA, para: BIA, criadoEm: T, networkKey: anaNet.web, cipherKey: anaCipher.web, cipherPublic: anaCipher.pub, theirCipherPublic: biaCipher.pub, salt, iv }, subtle)
    const object = P.createObject({ v: '0.4', tipo: 'mensagem', autor: ANA, criadoEm: T, previo: null, corpo: body, chavePrivada: anaNet.node })
    expect(P.validateObject(object).ok).toBe(true)
    expect(P.ciphertextSizeMatches(body.cifrado)).toBe(true)
    const atBia = P.decryptMessage(object, { chavePrivadaDeCifra: biaCipher.node, senderNetworkPublicKey: anaNet.pub })
    expect(atBia).toMatchObject({ ok: true, texto: text, assinatura: signature, withinRules: true })
    expect(P.decryptMessage(object, { chavePrivadaDeCifra: anaCipher.node, senderNetworkPublicKey: anaNet.pub })).toMatchObject({ ok: true, texto: text })
    const ref = P.encryptMessage({ texto: text, conversa: CONV, de: ANA, para: BIA, criadoEm: T, networkPrivateKey: anaNet.node, chavePrivadaDeCifra: anaCipher.node, otherCipherPublicKey: biaCipher.pub, sal: Buffer.from(salt), iv: Buffer.from(iv) })
    expect(body).toEqual(ref.corpo)
    expect(signature).toBe(ref.assinatura)
    // the denunciation the relay checks: the revealed letter confirms with the sender's network key
    expect(P.letterMatches({ conversa: CONV, criadoEm: T, de: ANA, iv: body.iv, para: BIA, texto: text }, signature, anaNet.pub)).toBe(true)
  })

  it('protocol encrypts, site decrypts on both sides', async () => {
    const [anaNet, anaCipher, biaNet, biaCipher] = await Promise.all([both('Ed25519'), both('X25519'), both('Ed25519'), both('X25519')])
    for (const text of ['a', 'Tudo certo por aqui, e com você? '.repeat(60).slice(0, 1999) + '!', 'linha 1\nlinha 2', 'olá 🙂 '.repeat(300).trim()]) {
      const { corpo: body, assinatura: signature } = P.encryptMessage({ texto: text, conversa: CONV, de: BIA, para: ANA, criadoEm: T, networkPrivateKey: biaNet.node, chavePrivadaDeCifra: biaCipher.node, otherCipherPublicKey: anaCipher.pub })
      const object = P.createObject({ v: '0.4', tipo: 'mensagem', autor: BIA, criadoEm: T, previo: null, corpo: body, chavePrivada: biaNet.node })
      expect(await decryptMessage(object, { cipherKey: anaCipher.web, cipherPublic: anaCipher.pub, senderNetworkKeys: [biaNet.pub] }, subtle)).toEqual({ ok: true, texto: text, assinatura: signature })
      expect(await decryptMessage(object, { cipherKey: biaCipher.web, cipherPublic: biaCipher.pub, senderNetworkKeys: ['x', anaNet.pub, biaNet.pub] }, subtle)).toEqual({ ok: true, texto: text, assinatura: signature })
    }
    void anaNet
  })

  it('refuses a tampered letter, a swapped cipher, a moved context, a foreign key and a wrong sender key', async () => {
    const [anaNet, anaCipher, biaNet, biaCipher, eve] = await Promise.all([both('Ed25519'), both('X25519'), both('Ed25519'), both('X25519'), both('X25519')])
    const make = (text: string, createdAt = T) => {
      const r = P.encryptMessage({ texto: text, conversa: CONV, de: BIA, para: ANA, criadoEm: createdAt, networkPrivateKey: biaNet.node, chavePrivadaDeCifra: biaCipher.node, otherCipherPublicKey: anaCipher.pub })
      return P.createObject({ v: '0.4', tipo: 'mensagem', autor: BIA, criadoEm: createdAt, previo: null, corpo: r.corpo, chavePrivada: biaNet.node })
    }
    const asAna = (o: SignedObject, keys = [biaNet.pub]) => decryptMessage(o, { cipherKey: anaCipher.web, cipherPublic: anaCipher.pub, senderNetworkKeys: keys }, subtle)
    const one = make('primeira')
    const two = make('segunda')
    // the cifrado of another message in this one: the tag does not open (salt and iv differ)
    expect(await asAna({ ...one, corpo: { ...one.corpo, cifrado: two.corpo.cifrado } })).toEqual({ ok: false, motivo: 'cifra' })
    // one flipped bit
    const bytes = fromB64u(one.corpo.cifrado)!
    bytes[5] ^= 1
    expect(await asAna({ ...one, corpo: { ...one.corpo, cifrado: toB64u(bytes) } })).toEqual({ ok: false, motivo: 'cifra' })
    // the same cifrado moved to another conversation or another moment
    expect(await asAna({ ...one, corpo: { ...one.corpo, conversa: `ob_${'D'.repeat(43)}` } })).toEqual({ ok: false, motivo: 'cifra' })
    expect(await asAna({ ...one, criadoEm: T + 1 })).toEqual({ ok: false, motivo: 'cifra' })
    // a key that is neither side's
    expect(await decryptMessage(one, { cipherKey: eve.web, cipherPublic: eve.pub, senderNetworkKeys: [biaNet.pub] }, subtle)).toEqual({ ok: false, motivo: 'outra_chave' })
    // the letter checked with a key that is not the sender's
    expect(await asAna(one, [anaNet.pub])).toEqual({ ok: false, motivo: 'carta' })
    // a letter signed by someone else, encrypted correctly: the cipher opens, the letter does not confirm
    const forged = P.encryptMessage({ texto: 'não fui eu', conversa: CONV, de: BIA, para: ANA, criadoEm: T, networkPrivateKey: anaNet.node, chavePrivadaDeCifra: biaCipher.node, otherCipherPublicKey: anaCipher.pub })
    expect(await asAna({ ...one, corpo: forged.corpo })).toEqual({ ok: false, motivo: 'carta' })
    // the site-encrypted message with a swapped letter text: the protocol refuses too
    const site = await encryptMessage({ texto: 'oi', conversa: CONV, de: ANA, para: BIA, criadoEm: T, networkKey: (await both('Ed25519')).web, cipherKey: anaCipher.web, cipherPublic: anaCipher.pub, theirCipherPublic: biaCipher.pub }, subtle)
    const obj = P.createObject({ v: '0.4', tipo: 'mensagem', autor: ANA, criadoEm: T, previo: null, corpo: site.corpo, chavePrivada: anaNet.node })
    expect(P.decryptMessage(obj, { chavePrivadaDeCifra: biaCipher.node, senderNetworkPublicKey: anaNet.pub })).toEqual({ ok: false, motivo: 'carta' })
  })

  it('only the exact canonical plain text is read; padding is to 256-byte bands', () => {
    const enc = (s: string) => new TextEncoder().encode(s)
    expect(pad(enc('a')).length).toBe(256)
    expect(pad(new Uint8Array(256)).length).toBe(256)
    expect(pad(new Uint8Array(257)).length).toBe(512)
    expect(readPlain(pad(enc('{"assinatura":"x","texto":"oi"}')))).toEqual({ assinatura: 'x', texto: 'oi' })
    expect(readPlain(pad(enc('{"texto":"oi","assinatura":"x"}')))).toBeNull()
    expect(readPlain(pad(enc('{"assinatura":"x", "texto":"oi"}')))).toBeNull()
    expect(readPlain(pad(enc('{"assinatura":"x","texto":"oi","mais":1}')))).toBeNull()
    expect(readPlain(pad(enc('[1]')))).toBeNull()
    expect(readPlain(new Uint8Array([0xff, 0xfe]))).toBeNull()
  })

  it('a small-order public key is chave_fraca, as the protocol says', async () => {
    const mine = await generateCipherPair(false, subtle)
    expect(mine.privateKey.extractable).toBe(false)
    expect(P.weakCipherKey(mine.publicKey)).toBe(false)
    const zero = toB64u(new Uint8Array(32))
    expect(P.weakCipherKey(zero)).toBe(true)
    await expect(sharedSecret(mine.privateKey, zero, subtle)).rejects.toThrow('chave_fraca')
    await expect(sharedSecret(mine.privateKey, 'nope', subtle)).rejects.toThrow('chave_fraca')
  })

  it('a 0.4 object signed on the device is what the relay accepts in form and signature, and the site checks it the same way', async () => {
    const net = await both('Ed25519')
    const cipher = await generateCipherPair(false, subtle)
    const object = await signObject(net.web, { v: '0.4', tipo: 'chave-de-cifra', autor: ANA, criadoEm: T, previo: null, corpo: { chave: cipher.publicKey } }, subtle)
    expect(P.validateObject(object).ok).toBe(true)
    expect(P.objectSignatureMatches(object, net.pub)).toBe(true)
    expect(P.checkPersonObject(object)).toBeNull()
    expect(await objectConfirms(object, net.pub, subtle)).toBe(true)
    expect(await objectConfirms({ ...object, corpo: { chave: toB64u(new Uint8Array(32).fill(9)) } }, net.pub, subtle)).toBe(false)
    expect(await objectConfirms(object, (await both('Ed25519')).pub, subtle)).toBe(false)
    const ref = P.createObject({ v: '0.4', tipo: 'chave-de-cifra', autor: ANA, criadoEm: T, previo: null, corpo: { chave: cipher.publicKey }, chavePrivada: net.node })
    expect(ref).toEqual(object)
  })

  it('an attestation is believed only from a listed issuer, for its own uid, with its own domain', async () => {
    const issuer = P.generateKeyPair()
    const device = await both('Ed25519')
    const a = P.createPersonAttestation({ issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid: ANA, handle: 'ana.teste', chave: device.pub, emitidoEm: T, expiraEm: T + 86400 })
    expect(await attestedNetworkKey(a, ANA, [issuer.publicKey], subtle)).toBe(device.pub)
    expect(await attestedNetworkKey(a, BIA, [issuer.publicKey], subtle)).toBeNull()
    expect(await attestedNetworkKey(a, ANA, [], subtle)).toBeNull()
    expect(await attestedNetworkKey({ ...a, chave: (await both('Ed25519')).pub }, ANA, [issuer.publicKey], subtle)).toBeNull()
    expect(await attestedNetworkKey({ ...a, tipo: 'outro' }, ANA, [issuer.publicKey], subtle)).toBeNull()
    expect(await attestedNetworkKey(null, ANA, [issuer.publicKey], subtle)).toBeNull()
    void createPublicKey
  })
})
