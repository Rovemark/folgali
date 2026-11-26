// 0.11.0 part 3: carries to the relay the bytes of a video the BROWSER cleaned and signed (src/lib/person/video.ts): the upload
// credential (`Rover-Envio`, device key) covers only `PUT /v1/video/<hash>`. Nothing is signed or changed here. The server checks what
// only it can (signed in, accepted the Terms, 18 or over for Rovemark, the credential is hers, the size fits) and then STREAMS the body
// to the relay: a 50 MB video never sits whole in this server's memory. The relay checks the rest again (format by the bytes, codecs,
// duration, dimensions, no metadata left, the hash of the bytes, account age, upload limits).
//
// Two things make the stream possible: this path is outside the proxy matcher (src/proxy.ts), because a request the proxy sees has its
// body copied in memory and cut at 10 MB; and the browser sends `content-length` (XMLHttpRequest with a Blob), checked before reading.
import type { NextRequest } from 'next/server'
import { MINOR, NOT_READY, NO_CONSENT, SIGNED_OUT, answer, refuse } from '@/lib/folgali/api'
import { consentOf } from '@/lib/folgali/vault'
import { IssuerFailure, issuersReady, personFromRovemark } from '@/lib/folgali/issuers'
import { accessFromRequest } from '@/lib/folgali/session'
import { VIDEO_LIMITS } from '@/lib/videos'

export const dynamic = 'force-dynamic'
/** A 50 MB video on a slow connection takes minutes; the relay gives it five. */
export const maxDuration = 300

const HASH = /^[0-9a-f]{64}$/
const UPLOAD = /^Rover-Envio uid=(rvr_[A-Za-z0-9_-]{22}), t=\d{10}, a=[A-Za-z0-9_-]{86}$/
const MAX = VIDEO_LIMITS.bytesMax
const TOO_BIG = { status: 413, code: 'video_grande', message: 'O vídeo passa de 50 MB.' }
const NO_LENGTH = { status: 411, code: 'corpo', message: 'Falta o tamanho do vídeo.' }
const FORM = { status: 400, code: 'corpo', message: 'O pedido não tem a forma esperada.' }

/** The body as it arrives, counted: more bytes than declared (or than the protocol allows) stops the stream. */
function counted(body: ReadableStream<Uint8Array>, declared: number): ReadableStream<Uint8Array> {
  let total = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) {
        total += chunk.length
        if (total > declared || total > MAX) c.error(new Error('too_big'))
        else c.enqueue(chunk)
      },
      flush(c) {
        if (total !== declared) c.error(new Error('short'))
      },
    }),
  )
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const ready = issuersReady()
  if (!ready) return refuse(NOT_READY)
  const { hash } = await params
  const auth = req.headers.get('x-rover-envio') ?? ''
  const signer = UPLOAD.exec(auth)
  if (!HASH.test(hash) || !signer) return refuse(FORM)
  const raw = req.headers.get('content-length')
  if (raw === null || !/^\d{1,9}$/.test(raw)) return refuse(NO_LENGTH)
  const declared = Number(raw)
  if (declared > MAX) return refuse(TOO_BIG)
  if (declared === 0 || !req.body) return refuse(FORM)
  const who = await accessFromRequest(req)
  if (!who) return refuse(SIGNED_OUT)
  if (!consentOf(who.pessoa)) return refuse(NO_CONSENT)
  try {
    const p = await personFromRovemark(ready.login, who.pessoa, who.at)
    if (p.adult !== true) return refuse(MINOR)
    if (signer[1] !== p.uid) return refuse({ status: 403, code: 'outro_autor', message: 'Só dá para enviar como você mesmo.' })
    const r = await fetch(`${ready.relay}/v1/video/${hash}`, {
      method: 'PUT',
      headers: { authorization: auth, 'content-type': 'application/octet-stream', 'content-length': String(declared) },
      body: counted(req.body, declared),
      duplex: 'half',
      redirect: 'error',
      signal: AbortSignal.timeout(300_000),
    } as RequestInit & { duplex: 'half' })
    return answer(await r.json().catch(() => ({})), r.status)
  } catch (e) {
    if (e instanceof IssuerFailure) return refuse(e.failure)
    return refuse({ status: 502, code: 'rele', message: 'A folgali não respondeu. Tente de novo.' })
  }
}
