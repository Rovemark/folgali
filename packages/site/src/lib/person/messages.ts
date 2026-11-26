// Private messages for the signed-in PERSON (protocol revision 0.4.0, docs/PROTOCOL.md section 15), all of it in the browser:
//
// - the cipher key (X25519) is created HERE, NOT extractable, and kept in this domain's IndexedDB next to the device key
//   (src/lib/person/device.ts). It never leaves the browser, not even to folgali's server;
// - every 0.4 object (`chave-de-cifra`, `conversa-pedir`, `conversa-decidir`, `mensagem`, `conversa-apagar`, `mensagem-denuncia`) is
//   signed here with the device key, `"v": "0.4"` and `previo: null` (out of the chain), and carried untouched by /api/person/publish;
// - every read of the person's own conversations is signed here (/api/person/read carries it); envelopes arrive encrypted and are
//   decrypted only here (src/lib/person/cipher.ts). The site server never sees a text in clear nor a private key.
//
// The text rules (2000 characters, 2 https links, no HTML) and the leak filter run HERE before encrypting: the relay cannot see an
// encrypted text, so it cannot filter it. One cipher key per account (section 15.13 item 4): the device that activates last holds it.
import { findLeaks } from '@/lib/leak-detector'
import { filterInvisible } from '@/lib/domain/invisible'
import { count, normalize } from '@/lib/domain/limits'
import { attestedNetworkKey, decryptMessage, encryptMessage, generateCipherPair, MESSAGE_LIMITS, objectConfirms } from './cipher'
import { PersonError, ensureAttestation, refusalOf, signedRead } from './client'
import { deviceKey, signObject, type SignedObject } from './device'
import { cipherKeyPath, conversationPath, conversationsPath, friendsPath, messagesPath, profilePath, type ConversationFilter } from './reads'

// ── the text rules, applied before encrypting ───────────────────────────────────────────────────────────

export type TextProblem = 'empty' | 'long' | 'links' | 'link' | 'html' | 'leak'

const ANY_SCHEME = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]*/g
const DANGEROUS = /\b(?:javascript|vbscript)\s*:|\bdata:[a-z]+\/[a-z]|\b(?:file|blob):(?:\/|https?)/i
const HTML = /<\s*[/!?a-zA-Z]|&#|&[a-zA-Z]{2,10};/
const SHORTENERS = new Set(['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 't.ly', 'shorturl.at'])
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** The problem of one link, as the protocol's `problemaDoLink` judges it (https only, no credentials, port, IP, local host, tracker). */
function linkProblem(raw: string): boolean {
  if (raw.slice(0, raw.indexOf(':')).toLowerCase() !== 'https') return true
  const link = raw.replace(/[.,;:!?)\]}'"]+$/, '')
  if ([...link].length > 300) return true
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return true
  }
  const host = u.hostname
  const labels = host.split('.')
  if (u.username || u.password || u.port || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return true
  if (host === 'localhost' || /\.(?:localhost|local|internal)$/.test(host) || labels.length < 2 || labels.some((l) => !LABEL.test(l) || l.startsWith('xn--'))) return true
  if (SHORTENERS.has(host.replace(/^www\./, ''))) return true
  return [...u.searchParams.keys()].some((k) => /^utm_/i.test(k) || /^(?:fbclid|gclid|dclid|msclkid|mc_eid|mc_cid|igshid|yclid|_hsenc|_hsmi|ref_src|s_cid|wickedid|vero_id)$/i.test(k))
}

/**
 * The text as it will be encrypted (invisible characters out, NFC, trimmed) or the first problem. `links` is 2 for a message and 0 for
 * a conversation request (the relay sees the request in clear and checks it again; a message it cannot check at all).
 */
export function prepareText(raw: string, max: number, links: number): { ok: true; text: string } | { ok: false; problem: TextProblem } {
  const text = normalize(filterInvisible(raw).texto)
  const n = count(text)
  if (n === 0) return { ok: false, problem: 'empty' }
  if (n > max) return { ok: false, problem: 'long' }
  if (HTML.test(text)) return { ok: false, problem: 'html' }
  if (DANGEROUS.test(text)) return { ok: false, problem: 'link' }
  const found = text.match(ANY_SCHEME) ?? []
  if (found.length > links) return { ok: false, problem: 'links' }
  if (found.some(linkProblem)) return { ok: false, problem: 'link' }
  if (findLeaks(text).length > 0) return { ok: false, problem: 'leak' }
  return { ok: true, text }
}

// ── this browser's keys (IndexedDB, the same database as the device key) ─────────────────────────────────

const DB = 'folgali'
const STORE = 'device'

function openDb(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fail(r.error)
  })
}
async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
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

interface StoredCipher {
  privateKey: CryptoKey
  publicKey: string
  createdAt: number
}

/** This device's cipher key for `uid`, or null (never created here). */
export async function localCipherKey(uid: string): Promise<StoredCipher | null> {
  if (typeof indexedDB === 'undefined') return null
  const found = await idb<StoredCipher | undefined>('readonly', (s) => s.get(`cipher-key:${uid}`)).catch(() => undefined)
  return found?.privateKey && found.publicKey ? found : null
}

async function createCipherKey(uid: string): Promise<StoredCipher> {
  const pair = await generateCipherPair(false)
  if (pair.privateKey.extractable) throw new Error('the cipher key must not be extractable')
  const stored: StoredCipher = { privateKey: pair.privateKey, publicKey: pair.publicKey, createdAt: Math.floor(Date.now() / 1000) }
  await idb('readwrite', (s) => s.put(stored, `cipher-key:${uid}`))
  return stored
}

/** Does this browser have what messages need (Ed25519 to sign, X25519 to agree, IndexedDB to keep the key)? */
export async function messagesSupported(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined' || !crypto?.subtle) return false
    await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
    await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits'])
    return true
  } catch {
    return false
  }
}

// ── talking to this site ────────────────────────────────────────────────────────────────────────────────

const nowS = () => Math.floor(Date.now() / 1000)

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
  if (!r.ok) throw await refusalOf(r)
  return (await r.json().catch(() => ({}))) as T
}

/** Signs a 0.4 object (out of the chain) and carries it to the relay. One retry when the relay asks for a newer attestation. */
export async function publish04(type: string, body: Record<string, unknown>, createdAt = nowS()): Promise<{ id: string; estado?: string; resultado?: string; objeto: SignedObject }> {
  let attestation = await ensureAttestation()
  for (let attempt = 0; ; attempt++) {
    const k = await deviceKey()
    const object = await signObject(k.privateKey, { v: '0.4', tipo: type, autor: attestation.uid, criadoEm: createdAt, previo: null, corpo: body })
    try {
      const r = await post<{ id: string; estado?: string; resultado?: string }>('/api/person/publish', { objeto: object, atestado: attestation })
      return { ...r, objeto: object }
    } catch (e) {
      if (attempt === 0 && e instanceof PersonError && (e.code === 'atestado_antigo' || e.code === 'assinatura_invalida')) {
        attestation = await ensureAttestation({ force: true })
        continue
      }
      throw e
    }
  }
}

// ── what the relay answers, read defensively ─────────────────────────────────────────────────────────────

export type ConversationState = 'pendente' | 'ativa' | 'recusada' | 'encerrada'
export interface Someone {
  uid: string
  handle: string | null
  nome: string | null
  especie: 'pessoa' | 'agente' | 'rover' | null
}
export interface Conversation {
  id: string
  com: Someone
  estado: ConversationState
  iniciadaPor: string
  criadaEm: number
  atualizadaEm: number
  ultimaMensagemEm: number | null
  mensagens: number
  /** the request envelope while the relay keeps it (in clear) */
  pedido: SignedObject | null
}

const UID_RE = /^rvr_[A-Za-z0-9_-]{22}$/
const ID_RE = /^ob_[A-Za-z0-9_-]{43}$/
const STATES: ConversationState[] = ['pendente', 'ativa', 'recusada', 'encerrada']
const int = (x: unknown) => (Number.isSafeInteger(x) && (x as number) >= 0 ? (x as number) : 0)
const str = (x: unknown, max = 120) => (typeof x === 'string' && x.length > 0 && x.length <= max ? x : null)

function someone(x: unknown): Someone | null {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
  if (typeof o.uid !== 'string' || !UID_RE.test(o.uid)) return null
  const species = o.especie === 'pessoa' || o.especie === 'agente' || o.especie === 'rover' ? o.especie : null
  return { uid: o.uid, handle: str(o.handle, 30), nome: str(o.nome, 80), especie: species }
}

function signedObject(x: unknown): SignedObject | null {
  const o = (typeof x === 'object' && x !== null ? x : null) as Record<string, unknown> | null
  if (!o || typeof o.id !== 'string' || !ID_RE.test(o.id) || typeof o.autor !== 'string' || typeof o.tipo !== 'string' || typeof o.corpo !== 'object' || o.corpo === null) return null
  if (typeof o.v !== 'string' || !Number.isSafeInteger(o.criadoEm) || typeof o.assinatura !== 'string') return null
  return o as unknown as SignedObject
}

export function conversationOf(x: unknown): Conversation | null {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
  const using = someone(o.com)
  if (typeof o.id !== 'string' || !ID_RE.test(o.id) || !using || !STATES.includes(o.estado as ConversationState) || typeof o.iniciadaPor !== 'string') return null
  const requestObj = signedObject((o.pedido as { objeto?: unknown } | null)?.objeto)
  const request = requestObj && requestObj.tipo === 'conversa-pedir' && requestObj.id === o.id && typeof requestObj.corpo.texto === 'string' ? requestObj : null
  return {
    id: o.id, com: using, estado: o.estado as ConversationState, iniciadaPor: o.iniciadaPor,
    criadaEm: int(o.criadaEm), atualizadaEm: int(o.atualizadaEm), ultimaMensagemEm: Number.isSafeInteger(o.ultimaMensagemEm) ? (o.ultimaMensagemEm as number) : null,
    mensagens: int(o.mensagens), pedido: request,
  }
}

/**
 * A signed read that waits out the relay's burst limit (`429 limite_de_taxa` with a short `retryAfterS`): every person's reads leave
 * this site's server from one address, so a busy minute can hit it. Up to three tries; a longer wait is passed on as the refusal.
 */
async function read<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await signedRead<T>(path)
    } catch (e) {
      const wait = e instanceof PersonError && e.status === 429 ? Number(e.extra.retryAfterS) : NaN
      if (attempt >= 3 || !(wait > 0 && wait <= 5)) throw e
      await new Promise((ok) => setTimeout(ok, wait * 1000 + Math.random() * 400))
    }
  }
}

const cursor = (x: unknown) => (Number.isSafeInteger(x) && (x as number) > 0 ? (x as number) : null)

// ── network keys of the people on the other side (checked from their attestation) ───────────────────────

const networkKeys = new Map<string, Promise<string[]>>()

/**
 * The network keys this browser verified for `uid`, the current one first: the attestation on the relay is checked HERE against the
 * issuers the relay lists, and every key ever verified is kept (public data), so a message signed before the other person changed
 * device still confirms. `refresh` reads the profile again.
 */
export async function networkKeysOf(uid: string, issuers: readonly string[], refresh = false): Promise<string[]> {
  const cached = networkKeys.get(uid)
  if (cached && !refresh) return cached
  const p = (async () => {
    const kept = (await idb<string[] | undefined>('readonly', (s) => s.get(`network-keys:${uid}`)).catch(() => undefined)) ?? []
    // keys kept here were verified when they were stored: the profile is read again only when none is kept or one did not confirm
    if (kept.length && !refresh) return kept
    let current: string | null = null
    try {
      const profile = await read<{ atestado?: unknown }>(profilePath(uid))
      current = await attestedNetworkKey(profile.atestado, uid, issuers)
    } catch {
      current = null
    }
    const all = [...new Set([...(current ? [current] : []), ...kept])].slice(0, 20)
    if (current && all.join() !== kept.join()) await idb('readwrite', (s) => s.put(all, `network-keys:${uid}`)).catch(() => null)
    return all
  })()
  networkKeys.set(uid, p)
  p.catch(() => networkKeys.delete(uid))
  return p
}

/** An object signed by `uid`: the id and the signature confirm with one of its verified network keys (one fresh read when none does). */
const refreshed = new Set<string>()
async function signedBy(object: SignedObject, uid: string, issuers: readonly string[]): Promise<boolean> {
  if (object.autor !== uid) return false
  for (const k of await networkKeysOf(uid, issuers)) if (await objectConfirms(object, k)) return true
  // none confirmed: the person may have changed device since; read the profile once per page load, never in a loop
  if (refreshed.has(uid)) return false
  refreshed.add(uid)
  for (const k of await networkKeysOf(uid, issuers, true)) if (await objectConfirms(object, k)) return true
  return false
}

/** The current cipher key of `uid` on the relay, checked: a `chave-de-cifra` of that uid, signed by its network key. Null when none. */
export async function currentCipherKey(uid: string, issuers: readonly string[]): Promise<string | null> {
  let j: { objeto?: unknown }
  try {
    j = await read<{ objeto?: unknown }>(cipherKeyPath(uid))
  } catch (e) {
    if (e instanceof PersonError && e.status === 404) return null
    throw e
  }
  const o = signedObject(j.objeto)
  if (!o || o.tipo !== 'chave-de-cifra' || typeof o.corpo.chave !== 'string' || !(await signedBy(o, uid, issuers))) throw new PersonError(502, 'chave_nao_confere')
  return o.corpo.chave
}

// ── activation ─────────────────────────────────────────────────────────────────────────────────────────

export interface CipherStatus {
  /** this device's cipher public key (null: never activated here) */
  local: string | null
  /** the account's current key on the relay (null: none published) */
  current: string | null
}
export const isActive = (s: CipherStatus) => s.local !== null && s.local === s.current

export async function cipherStatus(uid: string, issuers: readonly string[]): Promise<CipherStatus> {
  const [local, current] = await Promise.all([localCipherKey(uid), currentCipherKey(uid, issuers)])
  return { local: local?.publicKey ?? null, current }
}

/**
 * Activates messages on this device: creates the cipher key here (or reuses the one it already has) and publishes its public half.
 * The relay replaces the account's current key at once: another device that activated before stops reading NEW messages.
 */
export async function activateMessages(uid: string): Promise<CipherStatus> {
  const key = (await localCipherKey(uid)) ?? (await createCipherKey(uid))
  await publish04('chave-de-cifra', { chave: key.publicKey })
  return { local: key.publicKey, current: key.publicKey }
}

// ── conversations ──────────────────────────────────────────────────────────────────────────────────────

export async function listConversations(me: string, state: ConversationFilter, before?: number | null): Promise<{ items: Conversation[]; next: number | null }> {
  const j = await read<{ itens?: unknown[]; proximo?: unknown }>(conversationsPath(me, state, before))
  return { items: (Array.isArray(j.itens) ? j.itens : []).map(conversationOf).filter((c): c is Conversation => c !== null), next: cursor(j.proximo) }
}

export async function getConversation(me: string, id: string): Promise<Conversation> {
  const c = conversationOf(await read(conversationPath(me, id)))
  if (!c) throw new PersonError(502, 'rele')
  return c
}

/** The request text, only when its signature confirms with the requester's network key (null otherwise). */
export async function requestText(c: Conversation, issuers: readonly string[]): Promise<string | null> {
  if (!c.pedido) return null
  const by = c.pedido.autor
  if (by !== c.iniciadaPor || !(await signedBy(c.pedido, by, issuers).catch(() => false))) return null
  return c.pedido.corpo.texto as string
}

export interface Friend {
  uid: string
  handle: string | null
  nome: string | null
}

export async function listFriends(me: string): Promise<Friend[]> {
  const out: Friend[] = []
  let before: number | null = null
  for (let i = 0; i < 4; i++) {
    const j: { itens?: unknown[]; proximo?: unknown } = await read(friendsPath(me, before))
    for (const it of Array.isArray(j.itens) ? j.itens : []) {
      const s = someone((it as { rover?: unknown } | null)?.rover)
      if (s) out.push({ uid: s.uid, handle: s.handle, nome: s.nome })
    }
    before = cursor(j.proximo)
    if (!before) break
  }
  return out
}

export const askConversation = (target: string, text: string) => publish04('conversa-pedir', { alvo: target, texto: text })
export const decideConversation = (conversation: string, decision: 'aceitar' | 'recusar' | 'encerrar') => publish04('conversa-decidir', { conversa: conversation, decisao: decision })
/** Deletes THIS side's copy: one message, or (null) every message of the conversation received so far. The other side keeps theirs. */
export const deleteCopy = (conversation: string, message: string | null) => publish04('conversa-apagar', { conversa: conversation, mensagem: message })

// ── messages ───────────────────────────────────────────────────────────────────────────────────────────

export interface MessageItem {
  id: string
  de: string
  criadoEm: number
  mine: boolean
  /** decrypted on this device and the letter confirms with the sender's network key */
  legible: boolean
  /** why it is not legible: encrypted for another device of this account, or anything that did not confirm */
  why: 'other-device' | 'unreadable' | null
  texto: string | null
  assinatura: string | null
}

/** One page of messages (newest first, as the relay gives them), each decrypted here. What does not confirm shows nothing of itself. */
export async function readMessages(me: string, c: Conversation, issuers: readonly string[], before?: number | null): Promise<{ items: MessageItem[]; next: number | null }> {
  const j = await read<{ itens?: unknown[]; proximo?: unknown }>(messagesPath(me, c.id, before))
  const key = await localCipherKey(me)
  const items: MessageItem[] = []
  for (const env of Array.isArray(j.itens) ? j.itens : []) {
    const o = signedObject((env as { objeto?: unknown } | null)?.objeto)
    if (!o || o.tipo !== 'mensagem') continue
    const base: MessageItem = { id: o.id, de: o.autor, criadoEm: o.criadoEm, mine: o.autor === me, legible: false, why: 'unreadable', texto: null, assinatura: null }
    const sides = o.corpo.conversa === c.id && (o.autor === me || o.autor === c.com.uid) && (o.corpo.para === me || o.corpo.para === c.com.uid) && o.corpo.para !== o.autor
    if (!sides || !key || !(await signedBy(o, o.autor, issuers).catch(() => false))) {
      items.push(base)
      continue
    }
    const keys = await networkKeysOf(o.autor, issuers)
    const r = await decryptMessage(o, { cipherKey: key.privateKey, cipherPublic: key.publicKey, senderNetworkKeys: keys })
    if (r.ok) items.push({ ...base, legible: true, why: null, texto: r.texto, assinatura: r.assinatura })
    else items.push({ ...base, why: r.motivo === 'outra_chave' ? 'other-device' : 'unreadable' })
  }
  return { items, next: cursor(j.proximo) }
}

/**
 * Encrypts and sends. The text was already prepared (prepareText). When either side's key changed meanwhile
 * (`chave_de_cifra_desatualizada`) it reads the keys again and encrypts once more; if THIS device is the one out of date it says so
 * (`outro_aparelho`) instead of trying again.
 */
export async function sendMessage(me: string, c: Conversation, text: string, issuers: readonly string[]): Promise<MessageItem> {
  const key = await localCipherKey(me)
  if (!key) throw new PersonError(409, 'sem_chave')
  for (let attempt = 0; ; attempt++) {
    const theirs = await currentCipherKey(c.com.uid, issuers)
    if (!theirs) throw new PersonError(409, 'sem_chave_do_outro')
    const k = await deviceKey()
    const createdAt = nowS()
    const { corpo: body, assinatura: signature } = await encryptMessage({ texto: text, conversa: c.id, de: me, para: c.com.uid, criadoEm: createdAt, networkKey: k.privateKey, cipherKey: key.privateKey, cipherPublic: key.publicKey, theirCipherPublic: theirs })
    try {
      const r = await publish04('mensagem', body as unknown as Record<string, unknown>, createdAt)
      return { id: r.objeto.id, de: me, criadoEm: createdAt, mine: true, legible: true, why: null, texto: text, assinatura: signature }
    } catch (e) {
      if (!(e instanceof PersonError) || e.code !== 'chave_de_cifra_desatualizada' || attempt > 0) throw e
      const mine = await currentCipherKey(me, issuers).catch(() => null)
      if (mine !== key.publicKey) throw new PersonError(409, 'outro_aparelho')
    }
  }
}

export const REPORT_REASONS = ['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'menores', 'fora-do-tema', 'personificacao', 'outro'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

/** Reports a RECEIVED message the browser read: reveals to the relay operator its text and letter signature, and only those. */
export function reportMessage(item: MessageItem, reason: ReportReason) {
  if (item.mine || !item.legible || item.texto === null || item.assinatura === null) throw new PersonError(400, 'nao_denunciavel')
  return publish04('mensagem-denuncia', { mensagem: item.id, motivo: reason, texto: item.texto, assinatura: item.assinatura })
}

export { MESSAGE_LIMITS }
