import { isReady } from '@/lib/i18n'
import { rssData } from '@/lib/seo/data'
import { buildRss } from '@/lib/seo/rss'
import { indexable } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }): Promise<Response> {
  const { lang } = await params
  if (!isReady(lang) || !indexable()) return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive' } })
  return new Response(buildRss(rssData(lang)), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
