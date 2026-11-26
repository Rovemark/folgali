// The browser side of a person writing on folgali: talks only to this site's own API (/api/person...), which asks Rovemark for the
// attestation and carries the signed envelope to the relay. The device key signs here and never leaves.
import { MAX_READS, OBJECT_ID, postPath, repliesPath } from './reads'
import { signUpload } from './media'
import { deviceKey, saveAttestation, signObject, signRead, signReadCredential, storedDevice, usableAttestation, type Attestation, type SignedObject } from './device'

export class PersonError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(code)
  }
}

export interface PersonState {
  uid: string
  handle: string | null
  adult: boolean | null
  head: string | null
  profile: boolean
  name: string | null
  /** the body of the current profile object on the relay (null before the first profile) */
  body?: Record<string, unknown> | null
  consent: boolean
  /** 0.11.0 part 2: the relay announces `edicao` (the screens offer "Edit" on what is hers) */
  edit?: boolean
}

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) {
    const e = (j.erro ?? {}) as Record<string, unknown>
    const extra = Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'codigo' && k !== 'mensagem'))
    throw new PersonError(r.status, typeof e.codigo === 'string' ? e.codigo : 'erro', extra)
  }
  return j as T
}

export const personState = () => api<PersonState>('GET', '/api/person')

/** An attestation good for at least a day for this device; asks Rovemark for a new one when missing, near the end or forced. */
export async function ensureAttestation({ handle, force = false }: { handle?: string; force?: boolean } = {}): Promise<Attestation> {
  const k = await deviceKey()
  const kept = force || handle ? null : usableAttestation(k.attestation, k.publicKey)
  if (kept) return kept
  const r = await api<{ attestation: Attestation }>('POST', '/api/person/attestation', { key: k.publicKey, ...(handle ? { handle } : {}) })
  await saveAttestation(r.attestation)
  return r.attestation
}

const nowS = () => Math.floor(Date.now() / 1000)

/**
 * Signs and publishes one object as the person. The attestation goes with every envelope (the relay accepts it again), so a new
 * device or a renewed attestation needs nothing special. One retry on the two conflicts a person can hit: another device moved
 * the chain (`previo_incorreto`) or published with a newer attestation (`atestado_antigo`, `assinatura_invalida`).
 */
export async function publish(type: string, body: Record<string, unknown>, opts: { handle?: string } = {}): Promise<{ id: string; estado?: string; objeto: SignedObject }> {
  let attestation = await ensureAttestation(opts)
  let state = await personState()
  for (let attempt = 0; ; attempt++) {
    const k = await deviceKey()
    const object = await signObject(k.privateKey, { tipo: type, autor: attestation.uid, criadoEm: nowS(), previo: state.head, corpo: body })
    try {
      const r = await api<{ id: string; estado?: string }>('POST', '/api/person/publish', { objeto: object, atestado: attestation })
      return { ...r, objeto: object }
    } catch (e) {
      if (!(e instanceof PersonError) || attempt > 0) throw e
      if (e.code === 'previo_incorreto') state = await personState()
      else if (e.code === 'atestado_antigo' || e.code === 'assinatura_invalida') attestation = await ensureAttestation({ force: true })
      else throw e
    }
  }
}

/**
 * A GET on the relay as the signed-in person, through this site (/api/person/read): the device signs the read credential for the
 * exact path, the server checks it is the person's own uid and carries it. Only the paths the server allows (a profile page, the
 * own following list).
 */
export async function signedRead<T>(path: string): Promise<T> {
  const attestation = await ensureAttestation()
  const k = await deviceKey()
  const auth = await signRead(k.privateKey, attestation.uid, path)
  return api<T>('POST', '/api/person/read', { path, auth })
}

/** A post on screen whose reaction is asked: replies are read through their post's reply list (the relay has no reply detail). */
export interface ReactionTarget {
  id: string
  /** for a reply, the id of the post it answers */
  parent?: string
}

/**
 * The person's own reaction on each target, read from the relay as the person: the browser signs one read credential per relay path
 * with the device key (nothing is stored, nothing new is created) and this site's route carries them. Empty when this browser never
 * signed as a person, when the session ended or when another device published last (the relay knows only the latest key).
 */
export async function myReactions(targets: ReactionTarget[]): Promise<Record<string, string | null>> {
  const device = await storedDevice()
  const uid = device?.attestation?.uid
  if (!device || !uid) return {}
  const paths = new Set<string>()
  for (const t of targets) {
    if (t.parent && OBJECT_ID.test(t.parent)) paths.add(repliesPath(t.parent))
    else if (OBJECT_ID.test(t.id)) paths.add(postPath(t.id))
  }
  if (!paths.size) return {}
  const t = nowS()
  const reads = await Promise.all([...paths].slice(0, MAX_READS).map(async (path) => ({ path, credential: await signReadCredential(device.privateKey, { uid, path, t }) })))
  try {
    const r = await api<{ reactions: Record<string, string | null> }>('POST', '/api/person/reactions', { reads })
    return r.reactions ?? {}
  } catch {
    return {}
  }
}

/** A profile photo on the relay: the `imagem` object and the file it describes. */
export interface UploadedPhoto {
  id: string
  hash: string
  width: number
  height: number
}

/** A prepared picture (src/lib/person/media.ts): the cleaned bytes, their hash and the size in pixels. */
export interface PreparedMedia {
  bytes: Uint8Array
  hash: string
  width: number
  height: number
}

/** The refusal of a `fetch` answer as a PersonError, with everything the relay said besides the code (`retryAfterS`, `limite`, `libera`). */
export async function refusalOf(r: Response): Promise<PersonError> {
  const j = (await r.json().catch(() => ({}))) as { erro?: Record<string, unknown> }
  const e = j.erro ?? {}
  const extra = Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'codigo' && k !== 'mensagem'))
  return new PersonError(r.status, typeof e.codigo === 'string' ? e.codigo : 'erro', extra)
}

/**
 * Sends the bytes of a prepared picture as the signed-in person: they go through this site to the relay with an upload credential
 * signed on the device (/api/person/media/<hash>). The relay re-checks everything: format by the bytes, size, dimensions, the hash of
 * the cleaned bytes, the account age and the upload limits. Sending the same file twice is fine (the relay keeps one).
 */
export async function uploadMedia(p: PreparedMedia): Promise<void> {
  const attestation = await ensureAttestation()
  const k = await deviceKey()
  const auth = await signUpload(k.privateKey, attestation.uid, `/v1/midia/${p.hash}`)
  const r = await fetch(`/api/person/media/${p.hash}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'x-rover-envio': auth, accept: 'application/json' },
    body: p.bytes as BodyInit,
    credentials: 'same-origin',
  })
  if (!r.ok) throw await refusalOf(r)
}

/**
 * Sends a prepared profile photo (src/lib/person/media.ts) as the signed-in person: the bytes (uploadMedia), then the `imagem` object
 * (use `retrato` or `capa`, the alt text the screen wrote), signed and published like any object. The relay also holds the daily limit
 * of profile photos.
 */
export async function uploadProfilePhoto(p: PreparedMedia, use: 'retrato' | 'capa', alt: string): Promise<UploadedPhoto> {
  await uploadMedia(p)
  const body = { uso: use, alvo: null, ordem: null, hash: p.hash, formato: 'jpeg', largura: p.width, altura: p.height, bytes: p.bytes.length, alt }
  const { id } = await publish('imagem', body)
  return { id, hash: p.hash, width: p.width, height: p.height }
}

/**
 * Attaches one uploaded picture to a publication of the same author (protocol 0.11.0, `midia-livre`): the `imagem` object with use
 * `anexo`, the id of the post, reply, topic or forum reply, and the position (0 to 3, each used once). The alternative text is
 * optional: an empty string says the author wrote none.
 */
export async function publishAttachment(p: PreparedMedia, target: string, order: number, alt: string): Promise<{ id: string }> {
  const body = { uso: 'anexo', alvo: target, ordem: order, hash: p.hash, formato: 'jpeg', largura: p.width, altura: p.height, bytes: p.bytes.length, alt: alt.trim() }
  const { id } = await publish('imagem', body)
  return { id }
}

// ---------- video (protocol 0.11.0 part 3, `video`) ----------

/** What the relay says of an uploaded video (`201 recebida` or `200 duplicada`): the numbers the `video` object must repeat. */
export interface VideoReceipt {
  hash: string
  formato: 'mp4' | 'webm'
  largura: number
  altura: number
  bytes: number
  duracaoMs: number
}

/** The answer of an upload, read: the receipt, or the refusal as a PersonError (`video_longo`, `limite_de_taxa`, with `libera`). */
export function videoReceiptOf(status: number, body: unknown): VideoReceipt {
  const j = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  if (status !== 200 && status !== 201) {
    const e = (typeof j.erro === 'object' && j.erro !== null ? j.erro : {}) as Record<string, unknown>
    const extra = Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'codigo' && k !== 'mensagem'))
    throw new PersonError(status, typeof e.codigo === 'string' ? e.codigo : 'erro', extra)
  }
  const n = (k: string) => (Number.isSafeInteger(j[k]) && (j[k] as number) > 0 ? (j[k] as number) : null)
  const [width, height, bytes, durationMs] = [n('largura'), n('altura'), n('bytes'), n('duracaoMs')]
  if (typeof j.hash !== 'string' || !/^[0-9a-f]{64}$/.test(j.hash) || (j.formato !== 'mp4' && j.formato !== 'webm') || !width || !height || !bytes || !durationMs) {
    throw new PersonError(502, 'rele')
  }
  return { hash: j.hash, formato: j.formato, largura: width, altura: height, bytes, duracaoMs: durationMs }
}

/** A cleaned video as it leaves (src/lib/person/video.ts). */
export interface UploadableVideo {
  bytes: Uint8Array
  hash: string
}

/**
 * Sends a cleaned video as the signed-in person: the bytes go through this site to the relay (/api/person/video/<hash>, streamed on the
 * server) with an upload credential signed on the device for `PUT /v1/video/<hash>`. XMLHttpRequest, not fetch: it is the one that says
 * how much of a 50 MB body already left (`onProgress`, 0 to 1). Sending the same file twice is fine (`200 duplicada`).
 */
export async function uploadVideo(v: UploadableVideo, onProgress?: (fraction: number) => void): Promise<VideoReceipt> {
  const attestation = await ensureAttestation()
  const k = await deviceKey()
  const auth = await signUpload(k.privateKey, attestation.uid, `/v1/video/${v.hash}`)
  const body = new Blob([v.bytes as BlobPart], { type: 'application/octet-stream' })
  const { status, json } = await new Promise<{ status: number; json: unknown }>((ok, fail) => {
    const x = new XMLHttpRequest()
    x.open('PUT', `/api/person/video/${v.hash}`)
    x.setRequestHeader('content-type', 'application/octet-stream')
    x.setRequestHeader('x-rover-envio', auth)
    x.setRequestHeader('accept', 'application/json')
    x.withCredentials = true
    x.responseType = 'text'
    x.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total))
    }
    x.onload = () => {
      let json: unknown = {}
      try {
        json = JSON.parse(x.responseText || '{}')
      } catch {
        json = {}
      }
      ok({ status: x.status, json })
    }
    x.onerror = () => fail(new PersonError(0, 'rede'))
    x.ontimeout = () => fail(new PersonError(0, 'rede'))
    x.send(body)
  })
  return videoReceiptOf(status, json)
}

/**
 * Attaches an uploaded video to a publication of the same author: the `video` object, signed on the device and published without
 * approval, with the numbers EXACTLY as the relay answered the upload, the hash of the poster image (or null) and the description
 * (optional, empty when she wrote none).
 */
export async function publishVideo(r: VideoReceipt, target: string, poster: string | null, alt: string): Promise<{ id: string }> {
  const body = { alvo: target, hash: r.hash, formato: r.formato, largura: r.largura, altura: r.altura, bytes: r.bytes, duracaoMs: r.duracaoMs, miniatura: poster, alt: alt.trim() }
  const { id } = await publish('video', body)
  return { id }
}
