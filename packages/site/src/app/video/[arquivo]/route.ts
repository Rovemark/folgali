// 0.11.0 part 3: the videos of the network leave ALWAYS through here, from the site's own domain (`/video/<hash>.<ext>`), like the
// images (`/midia/...`). The browser never gets an address from outside: the server asks the relay (`GET /v1/video/<hash>`), follows
// the short presigned URL of the S3 store when the relay answers with one, and STREAMS the bytes (one range at a time, as the player
// asks: 206 with `content-range`, 416 outside the file). Only a checked hash becomes a request; the extension must match the format.
// The headers are the relay's: fixed type, no sniffing, nothing runs, short cache (a removed video leaves caches in minutes).
import { getNetwork } from '@/lib/get-network'
import { VIDEO_FILE_RE, VIDEO_CACHE, VIDEO_MIME_TYPE } from '@/lib/videos'

export const dynamic = 'force-dynamic'

const notFound = () =>
  new Response('não encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })

export async function GET(req: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const { arquivo: file } = await params
  const m = VIDEO_FILE_RE.exec(file)
  if (!m) return notFound()
  const { cliente: client } = getNetwork()
  const r = client.video ? await client.video(m[1], req.headers.get('range')).catch(() => null) : null
  if (!r) return notFound()
  if (r.status !== 416 && r.formato !== m[2]) {
    r.corpo?.cancel().catch(() => {})
    return notFound()
  }
  const common = { 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'accept-ranges': 'bytes' }
  if (r.status === 416) return new Response(null, { status: 416, headers: { ...common, 'cache-control': 'no-store', ...(r.faixa ? { 'content-range': r.faixa } : {}) } })
  return new Response(r.corpo, {
    status: r.status,
    headers: {
      ...common,
      'content-type': VIDEO_MIME_TYPE[r.formato],
      ...(r.tamanho !== null ? { 'content-length': String(r.tamanho) } : {}),
      ...(r.faixa ? { 'content-range': r.faixa } : {}),
      'cache-control': VIDEO_CACHE,
      etag: `"${m[1]}"`,
      'content-disposition': 'inline',
    },
  })
}
