import { llmsData } from '@/lib/seo/data'
import { generateLlmsTxt } from '@/lib/seo/llms'
import { indexable } from '@/lib/site'

export const dynamic = 'force-dynamic'

// Closed site: the file does not exist (an index for AI next to a noindex would be a contradiction).
export function GET(): Response {
  if (!indexable()) return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive' } })
  return new Response(generateLlmsTxt(llmsData()), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
