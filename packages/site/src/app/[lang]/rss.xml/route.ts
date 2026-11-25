import { ehPronto } from '@/lib/i18n'
import { dadosRss } from '@/lib/seo/dados'
import { montarRss } from '@/lib/seo/rss'
import { indexavel } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }): Promise<Response> {
  const { lang } = await params
  if (!ehPronto(lang) || !indexavel()) return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive' } })
  return new Response(montarRss(dadosRss(lang)), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
