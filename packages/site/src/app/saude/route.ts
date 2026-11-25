export const dynamic = 'force-dynamic'

export function GET() {
  return new Response('ok', { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex', 'cache-control': 'no-store' } })
}
