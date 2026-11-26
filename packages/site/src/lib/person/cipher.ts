// The cipher of private messages (protocol revision 0.4.0, docs/PROTOCOL.md section 15.5) done in the BROWSER with WebCrypto, byte for
// byte as packages/protocol/src/messages.js does it with node:crypto:
//
//   letter     = canonical({ conversa, criadoEm, de, iv, para, texto })
//   signature  = Ed25519(sender NETWORK key, "rover-network/0.4/carta\n" || letter)
//   plain      = canonical({ assinatura, texto }) padded with spaces (0x20) to a multiple of 256 bytes (at least 256)
//   Z          = X25519(own cipher private key, other side's cipher public key)        (an all-zero Z is refused)
//   context    = canonical({ chaveDe, chavePara, conversa, criadoEm, de, para })
//   K          = HKDF-SHA256(Z, salt, "rover-network/0.4/mensagem\n" || context, 32 bytes)
//   cifrado    = AES-256-GCM(K, iv, plain, AAD = context) || 16-byte tag
//
// No storage and no network here: keys come in as CryptoKey objects (the private ones are created NOT extractable by the caller,
// src/lib/person/messages.ts) and everything that leaves is the public `corpo` of a `mensagem`. test/person/messages-cipher.test.ts
// proves the equivalence with the protocol package in both directions.
import { canonical, toB64u, type SignedObject } from './device'

export const LETTER_DOMAIN = 'rover-network/0.4/carta\n'
export const MESSAGE_KEY_DOMAIN = 'rover-network/0.4/mensagem\n'
/** The object domain of a 0.4 object (one prefix per type, as in 0.3). */
export const objectDomain04 = (type: string) => `rover-network/0.4/objeto/${type}\n`

/** The numbers of LIMITES_DE_MENSAGEM (packages/protocol/src/limits.js); test/person/messages-cipher.test.ts compares them. */
export const MESSAGE_LIMITS = Object.freeze({ blockBytes: 256, plainMaxBytes: 8192, tagBytes: 16, saltBytes: 32, ivBytes: 12, textMax: 2000, requestMax: 280, linksPerMessage: 2 })

const utf8 = (s: string) => new TextEncoder().encode(s)
const buf = (b: Uint8Array) => b as Uint8Array<ArrayBuffer>

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Strict base64url without padding: what does not come back identical when re-encoded is refused (null), as `deB64u` does. */
export function fromB64u(text: unknown, n?: number): Uint8Array | null {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null
  let bin: string
  try {
    bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
  } catch {
    return null
  }
  const out = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  if (toB64u(out) !== text) return null
  return n === undefined || out.length === n ? out : null
}

/** The canonical JSON in UTF-8, refusing broken Unicode as the protocol does (its `canonicalizar` throws on a lone surrogate). */
function canonicalBytes(value: Record<string, unknown>): Uint8Array {
  for (const v of Object.values(value)) if (typeof v === 'string' && !v.isWellFormed()) throw new TypeError('canonical: lone surrogate')
  return utf8(canonical(value))
}

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

// ---------- keys ----------

/** A new X25519 pair for messages only (never the network key). The private key is NOT extractable unless a test asks for it. */
export async function generateCipherPair(extractable = false, subtle: SubtleCrypto = crypto.subtle): Promise<{ privateKey: CryptoKey; publicKey: string }> {
  const pair = (await subtle.generateKey({ name: 'X25519' }, extractable, ['deriveBits'])) as CryptoKeyPair
  return { privateKey: pair.privateKey, publicKey: toB64u(await subtle.exportKey('raw', pair.publicKey)) }
}

/** Z = X25519(private, public). A public key that does not import, or one of small order (all-zero Z), is `chave_fraca`. */
export async function sharedSecret(privateKey: CryptoKey, publicB64u: string, subtle: SubtleCrypto = crypto.subtle): Promise<Uint8Array> {
  const raw = fromB64u(publicB64u, 32)
  let z: Uint8Array | null = null
  try {
    if (raw) {
      const pub = await subtle.importKey('raw', buf(raw), { name: 'X25519' }, true, [])
      z = new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: pub }, privateKey, 256))
    }
  } catch {
    z = null
  }
  if (!z || z.every((b) => b === 0)) throw new Error('chave_fraca')
  return z
}

async function messageKey(z: Uint8Array, salt: Uint8Array, context: Uint8Array, subtle: SubtleCrypto): Promise<CryptoKey> {
  const ikm = await subtle.importKey('raw', buf(z), 'HKDF', false, ['deriveBits'])
  const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(concatBytes(utf8(MESSAGE_KEY_DOMAIN), context)) }, ikm, 256)
  return subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Pads with spaces to the next multiple of 256 bytes (at least 256): the relay sees the size only in 256-byte bands. */
export function pad(bytes: Uint8Array): Uint8Array {
  const size = Math.max(MESSAGE_LIMITS.blockBytes, Math.ceil(bytes.length / MESSAGE_LIMITS.blockBytes) * MESSAGE_LIMITS.blockBytes)
  const out = new Uint8Array(size).fill(0x20)
  out.set(bytes, 0)
  return out
}

const letterBytes = (f: { conversa: string; criadoEm: number; de: string; iv: string; para: string; texto: string }) =>
  canonicalBytes({ conversa: f.conversa, criadoEm: f.criadoEm, de: f.de, iv: f.iv, para: f.para, texto: f.texto })
const contextBytes = (f: { chaveDe: string; chavePara: string; conversa: string; criadoEm: number; de: string; para: string }) =>
  canonicalBytes({ chaveDe: f.chaveDe, chavePara: f.chavePara, conversa: f.conversa, criadoEm: f.criadoEm, de: f.de, para: f.para })

async function importNetworkPublic(b64u: string, subtle: SubtleCrypto): Promise<CryptoKey | null> {
  const raw = fromB64u(b64u, 32)
  if (!raw) return null
  try {
    return await subtle.importKey('raw', buf(raw), { name: 'Ed25519' }, false, ['verify'])
  } catch {
    return null
  }
}

/** Ed25519 verify of `domain || bytes` with a public key in base64url. Any malformed input is false, never an exception. */
export async function verifySigned(domain: string, bytes: Uint8Array, signature: unknown, publicB64u: string, subtle: SubtleCrypto = crypto.subtle): Promise<boolean> {
  const sig = fromB64u(signature, 64)
  const key = sig ? await importNetworkPublic(publicB64u, subtle) : null
  if (!sig || !key) return false
  try {
    return await subtle.verify('Ed25519', key, buf(sig), buf(concatBytes(utf8(domain), bytes)))
  } catch {
    return false
  }
}

// ---------- the letter and the cipher ----------

export interface MessageBody {
  conversa: string
  para: string
  chaveDe: string
  chavePara: string
  sal: string
  iv: string
  cifrado: string
}

export interface EncryptInput {
  texto: string
  conversa: string
  /** the sender's uid (the object's author) */
  de: string
  para: string
  criadoEm: number
  /** the sender's NETWORK key (Ed25519, the device key), signs the letter */
  networkKey: CryptoKey
  /** the sender's cipher private key (X25519) and its public half */
  cipherKey: CryptoKey
  cipherPublic: string
  /** the other side's current cipher public key */
  theirCipherPublic: string
  salt?: Uint8Array
  iv?: Uint8Array
}

/**
 * Builds the body of a `mensagem`. The text rules are the caller's job (src/lib/person/messages.ts), BEFORE this: the relay never sees
 * the text and cannot apply them. Returns the letter signature too (the report of a message reveals it).
 */
export async function encryptMessage(i: EncryptInput, subtle: SubtleCrypto = crypto.subtle): Promise<{ corpo: MessageBody; assinatura: string }> {
  const salt = i.salt ?? randomBytes(MESSAGE_LIMITS.saltBytes)
  const iv = i.iv ?? randomBytes(MESSAGE_LIMITS.ivBytes)
  if (salt.length !== MESSAGE_LIMITS.saltBytes || iv.length !== MESSAGE_LIMITS.ivBytes) throw new TypeError('salt or iv of the wrong size')
  const ivB64u = toB64u(iv)
  const letter = letterBytes({ conversa: i.conversa, criadoEm: i.criadoEm, de: i.de, iv: ivB64u, para: i.para, texto: i.texto })
  const signature = toB64u(await subtle.sign('Ed25519', i.networkKey, buf(concatBytes(utf8(LETTER_DOMAIN), letter))))
  const context = contextBytes({ chaveDe: i.cipherPublic, chavePara: i.theirCipherPublic, conversa: i.conversa, criadoEm: i.criadoEm, de: i.de, para: i.para })
  const k = await messageKey(await sharedSecret(i.cipherKey, i.theirCipherPublic, subtle), salt, context, subtle)
  const plain = pad(canonicalBytes({ assinatura: signature, texto: i.texto }))
  if (plain.length > MESSAGE_LIMITS.plainMaxBytes) throw new Error('longa')
  const sealed = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(context), tagLength: 128 }, k, buf(plain)))
  return {
    corpo: { conversa: i.conversa, para: i.para, chaveDe: i.cipherPublic, chavePara: i.theirCipherPublic, sal: toB64u(salt), iv: ivB64u, cifrado: toB64u(sealed) },
    assinatura: signature,
  }
}

const decoder = () => new TextDecoder('utf-8', { fatal: true })

/** From the padded plain text to `{ assinatura, texto }`, demanding the exact canonical form. Null when it is not. */
export function readPlain(plain: Uint8Array): { assinatura: string; texto: string } | null {
  let end = plain.length
  while (end > 0 && plain[end - 1] === 0x20) end--
  let s: string
  let v: unknown
  try {
    s = decoder().decode(plain.subarray(0, end))
    v = JSON.parse(s)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) return null
  const o = v as Record<string, unknown>
  if (Object.keys(o).sort().join(',') !== 'assinatura,texto' || typeof o.assinatura !== 'string' || typeof o.texto !== 'string') return null
  try {
    if (!o.texto.isWellFormed() || canonical(o) !== s) return null
  } catch {
    return null
  }
  return { assinatura: o.assinatura, texto: o.texto }
}

export type Decrypted = { ok: true; texto: string; assinatura: string } | { ok: false; motivo: 'nao_e_mensagem' | 'outra_chave' | 'forma' | 'cifra' | 'forma_do_claro' | 'carta' }

/**
 * Decrypts a `mensagem` with one side's cipher key (the receiver's or the sender's: Z is the same) and checks the letter against the
 * sender's network keys (every key this browser verified for that uid; the first that matches wins). Any failure is "unreadable":
 * the screen shows nothing of it.
 */
export async function decryptMessage(
  object: Pick<SignedObject, 'tipo' | 'autor' | 'criadoEm' | 'corpo'>,
  { cipherKey, cipherPublic, senderNetworkKeys }: { cipherKey: CryptoKey; cipherPublic: string; senderNetworkKeys: readonly string[] },
  subtle: SubtleCrypto = crypto.subtle,
): Promise<Decrypted> {
  const fail = (reason: Extract<Decrypted, { ok: false }>['motivo']): Decrypted => ({ ok: false, motivo: reason })
  if (object?.tipo !== 'mensagem' || typeof object.corpo !== 'object' || object.corpo === null) return fail('nao_e_mensagem')
  const { conversa: conversation, para: to, chaveDe: keyOf, chavePara: keyFor, sal: saltValue, iv, cifrado: ciphertext } = object.corpo as Record<string, unknown>
  if (typeof conversation !== 'string' || typeof to !== 'string' || typeof keyOf !== 'string' || typeof keyFor !== 'string' || typeof iv !== 'string') return fail('forma')
  const from = object.autor
  const other = cipherPublic === keyFor ? keyOf : cipherPublic === keyOf ? keyFor : null
  if (other === null) return fail('outra_chave')
  const salt = fromB64u(saltValue, MESSAGE_LIMITS.saltBytes)
  const ivB = fromB64u(iv, MESSAGE_LIMITS.ivBytes)
  const sealed = fromB64u(ciphertext)
  if (!salt || !ivB || !sealed || sealed.length <= MESSAGE_LIMITS.tagBytes || !Number.isSafeInteger(object.criadoEm)) return fail('forma')
  let plain: Uint8Array
  try {
    const context = contextBytes({ chaveDe: keyOf, chavePara: keyFor, conversa: conversation, criadoEm: object.criadoEm, de: from, para: to })
    const k = await messageKey(await sharedSecret(cipherKey, other, subtle), salt, context, subtle)
    plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: buf(ivB), additionalData: buf(context), tagLength: 128 }, k, buf(sealed)))
  } catch {
    return fail('cifra')
  }
  const read = readPlain(plain)
  if (!read) return fail('forma_do_claro')
  let letter: Uint8Array
  try {
    letter = letterBytes({ conversa: conversation, criadoEm: object.criadoEm, de: from, iv, para: to, texto: read.texto })
  } catch {
    return fail('forma_do_claro')
  }
  for (const key of senderNetworkKeys) {
    if (await verifySigned(LETTER_DOMAIN, letter, read.assinatura, key, subtle)) return { ok: true, texto: read.texto, assinatura: read.assinatura }
  }
  return fail('carta')
}

// ---------- objects and attestations ----------

/** The id of an object (sha-256 of the canonical object without id and signature) and its signature with a network key. */
export async function objectConfirms(object: SignedObject, networkPublic: string, subtle: SubtleCrypto = crypto.subtle): Promise<boolean> {
  try {
    const base = { v: object.v, tipo: object.tipo, autor: object.autor, criadoEm: object.criadoEm, previo: object.previo, corpo: object.corpo }
    const id = `ob_${toB64u(await subtle.digest('SHA-256', buf(utf8(canonical(base)))))}`
    if (id !== object.id) return false
    const domain = object.v === '0.1' || object.v === '0.2' ? `rover-network/${object.v}/objeto\n` : `rover-network/${object.v}/objeto/${object.tipo}\n`
    return await verifySigned(domain, utf8(canonical({ ...base, id })), object.assinatura, networkPublic, subtle)
  } catch {
    return false
  }
}

/**
 * The network key an attestation binds to `uid`, checked here: signed by an issuer the relay lists (`/v1/info` `emissores`), with the
 * person domain (`rover-network/0.7/atestado-pessoa`) or the rover one (`rover-network/<v>/atestado-handle`). Null when anything is off.
 * The expiry is not demanded on purpose: an old attestation still says which key signed an old message.
 */
export async function attestedNetworkKey(attestation: unknown, uid: string, issuers: readonly string[], subtle: SubtleCrypto = crypto.subtle): Promise<string | null> {
  if (typeof attestation !== 'object' || attestation === null || Array.isArray(attestation)) return null
  const a = attestation as Record<string, unknown>
  if (a.uid !== uid || typeof a.emissor !== 'string' || !issuers.includes(a.emissor) || typeof a.chave !== 'string' || !fromB64u(a.chave, 32) || typeof a.v !== 'string') return null
  const domain = a.tipo === 'atestado-pessoa' ? 'rover-network/0.7/atestado-pessoa\n' : a.tipo === undefined ? `rover-network/${a.v}/atestado-handle\n` : null
  if (!domain || !/^\d+\.\d+$/.test(a.v)) return null
  const { assinatura: signature, ...rest } = a
  try {
    return (await verifySigned(domain, utf8(canonical(rest)), signature, a.emissor, subtle)) ? a.chave : null
  } catch {
    return null
  }
}
