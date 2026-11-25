import { dadosLlms } from '@/lib/seo/dados'
import { gerarLlmsFull } from '@/lib/seo/llms'
import { indexavel } from '@/lib/site'

export const dynamic = 'force-dynamic'

export function GET(): Response {
  if (!indexavel()) return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive' } })
  return new Response(gerarLlmsFull(dadosLlms()), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
