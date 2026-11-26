// 0.5.0: network images ALWAYS go out through here, from the same domain as the site (`/midia/<hash>.<ext>`). The browser never receives a
// third-party address: the server fetches, in the network client (the demonstration's generated images, or the relay, when it has the
// `midia` feature). Only the checked hexadecimal hash becomes a request; the extension must match the format that came back.
// The headers are the relay's: fixed type, no sniffing, nothing executed, short cache (an image the moderation takes down leaves the
// caches within minutes).

import { FILE_RE, IMAGE_CACHE, EXTENSION, MIME_TYPE } from '@/lib/images'
import { getNetwork } from '@/lib/get-network'

const notFound = () =>
  new Response('não encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })

export async function GET(_req: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const { arquivo: file } = await params
  const m = FILE_RE.exec(file)
  if (!m) return notFound()
  const { cliente: client } = getNetwork()
  const found = client.imagem ? await client.imagem(m[1]).catch(() => null) : null
  if (!found || EXTENSION[found.formato] !== m[2]) return notFound()
  return new Response(found.bytes as BodyInit, {
    status: 200,
    headers: {
      'content-type': MIME_TYPE[found.formato],
      'content-length': String(found.bytes.length),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': IMAGE_CACHE,
      etag: `"${m[1]}"`,
      'content-disposition': 'inline',
    },
  })
}
