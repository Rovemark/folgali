// The person's DEVICE on folgali, in the browser (docs/INTEGRATION-ROVEMARK-PEOPLE.md, section 2). The key pair is Ed25519 from
// WebCrypto with the private key NOT extractable: it is created here, kept in this domain's IndexedDB as a CryptoKey and never
// leaves the browser, not even to folgali's server. The public key goes to Rovemark, which signs the person attestation.
//
// Every object the person publishes is built and signed here, with the same canonical JSON and domain prefixes as the protocol
// (packages/protocol: canonico.js, objetos.js). The site server only carries the signed envelope to the relay.
// No dependency: this file runs in the browser and must stay small.

export interface Attestation {
  tipo: 'atestado-pessoa'
  v: '0.7'
  emissor: string
  uid: string
  handle: string
  chave: string
  emitidoEm: number
  expiraEm: number
  assinatura: string
}

export interface SignedObject {
  v: string
  tipo: string
  autor: string
  criadoEm: number
  previo: string | null
  corpo: Record<string, unknown>
  id: string
  assinatura: string
}

/** Canonical JSON (subset of RFC 8785): keys sorted by UTF-16 code units, no spaces, safe integers only. */
export function canonical(value: unknown, depth = 0): string {
  if (depth > 6) throw new TypeError('canonical: too deep')
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('canonical: only safe integers')
    return String(value)
  }
  if (Array.isArray(value)) return `[${value.map((x) => canonical(x, depth + 1)).join(',')}]`
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k], depth + 1)}`)
      .join(',')}}`
  }
  throw new TypeError(`canonical: type not accepted (${typeof value})`)
}

const utf8 = (s: string) => new TextEncoder().encode(s)

export function toB64u(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/** The object domain of protocol 0.3 and later: one prefix per type, so a signature for a reply never passes for a post. */
export const objectDomain = (v: string, type: string) => `rover-network/${v}/objeto/${type}\n`

/** Builds, computes the id (sha-256 of the canonical object without id and signature) and signs with the device key. */
export async function signObject(
  key: CryptoKey,
  { tipo: type, autor: author, criadoEm: createdAt, previo: previous, corpo: body, v = '0.3' }: { tipo: string; autor: string; criadoEm: number; previo: string | null; corpo: Record<string, unknown>; v?: string },
  subtle: SubtleCrypto = crypto.subtle,
): Promise<SignedObject> {
  const base = { v, tipo: type, autor: author, criadoEm: createdAt, previo: previous, corpo: body }
  const id = `ob_${toB64u(await subtle.digest('SHA-256', utf8(canonical(base))))}`
  const withId = { ...base, id }
  const signature = await subtle.sign('Ed25519', key, concat(utf8(objectDomain(v, type)), utf8(canonical(withId))))
  return { ...withId, assinatura: toB64u(signature) }
}

/** The read domain of the protocol (0.2, unchanged since): the signature of a read credential never passes for an object. */
export const READ_DOMAIN = 'rover-network/0.2/leitura\n'

/**
 * The `Authorization` value of a read request signed with the device key (packages/protocol/src/read.js): the signature covers
 * the canonical { alvo, metodo, t, uid }, with `alvo` the path plus the query EXACTLY as the relay will see it. The relay checks it
 * against the key of the person's latest attestation, so only the device that published last reads as the person.
 */
export async function signReadCredential(
  key: CryptoKey,
  { uid, path, t, method = 'GET' }: { uid: string; path: string; t: number; method?: string },
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  const signature = await subtle.sign('Ed25519', key, concat(utf8(READ_DOMAIN), utf8(canonical({ alvo: path, metodo: method, t, uid }))))
  return `Rover-Assinatura uid=${uid}, t=${t}, a=${toB64u(signature)}`
}

// ── the key in IndexedDB ────────────────────────────────────────────────────────────────────────

const DB = 'folgali'
const STORE = 'device'
const ID = 'person-key'

interface Stored {
  privateKey: CryptoKey
  publicKey: string
  attestation: Attestation | null
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fail(r.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((ok, fail) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => ok(req.result as T)
      req.onerror = () => fail(req.error)
    })
  } finally {
    db.close()
  }
}

/** Does this browser sign with Ed25519 in WebCrypto? (Chrome 137+, Safari 17+, Firefox 129+.) */
export async function deviceSupported(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined' || !crypto?.subtle) return false
    await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
    return true
  } catch {
    return false
  }
}

/**
 * This device's key: created on the first call (private key NOT extractable) and kept in IndexedDB.
 * Returns the CryptoKey (usable only for signing) and the public key in base64url (43 characters).
 */
export async function deviceKey(): Promise<Stored> {
  const found = await tx<Stored | undefined>('readonly', (s) => s.get(ID))
  if (found?.privateKey && found.publicKey) return found
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair
  if (pair.privateKey.extractable) throw new Error('the device key must not be extractable')
  const publicKey = toB64u(await crypto.subtle.exportKey('raw', pair.publicKey))
  const stored: Stored = { privateKey: pair.privateKey, publicKey, attestation: null }
  await tx('readwrite', (s) => s.put(stored, ID))
  return stored
}

/** The key and attestation this browser already has, without creating anything (null when this device never signed). */
export async function storedDevice(): Promise<Stored | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return null
  // opening a database that does not exist would create it: a visitor's browser gets nothing new
  const dbs = await indexedDB.databases().catch(() => [])
  if (!dbs.some((d) => d.name === DB)) return null
  const found = await tx<Stored | undefined>('readonly', (s) => s.get(ID)).catch(() => undefined)
  return found?.privateKey && found.publicKey ? found : null
}

/** Keeps the attestation next to the key (it is public: the relay shows it to anyone). */
export async function saveAttestation(attestation: Attestation): Promise<void> {
  const k = await deviceKey()
  if (attestation.chave !== k.publicKey) throw new Error('the attestation is for another device')
  await tx('readwrite', (s) => s.put({ ...k, attestation }, ID))
}

/** The attestation still good for at least `marginS` seconds (default one day), or null. */
export function usableAttestation(a: Attestation | null, publicKey: string, nowS = Math.floor(Date.now() / 1000), marginS = 86400): Attestation | null {
  return a && a.chave === publicKey && a.expiraEm - nowS > marginS ? a : null
}

/**
 * The Authorization header for one GET on the relay as this person (packages/protocol/src/read.js): it covers only that path
 * with its query, only GET, and the relay accepts it for two minutes. The relay then answers with what the person may see
 * (`voce` on a profile page, the own following list).
 */
export async function signRead(key: CryptoKey, uid: string, target: string, t = Math.floor(Date.now() / 1000), subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const signature = await subtle.sign('Ed25519', key, concat(utf8(READ_DOMAIN), utf8(canonical({ alvo: target, metodo: 'GET', t, uid }))))
  return `Rover-Assinatura uid=${uid}, t=${t}, a=${toB64u(signature)}`
}
