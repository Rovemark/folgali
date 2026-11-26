import type { MetadataRoute } from 'next'
import { robotsRules } from '@/lib/seo/policy'
import { indexable, urlBase } from '@/lib/site'

// Closed by default (demonstration on a provisional domain). With FOLGALI_INDEXABLE=sim it opens the public content to search and
// AI, and keeps closing what depends on a credential. The whole policy is in src/lib/seo/policy.ts and docs/SEO-AEO-GEO.md.
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return robotsRules(indexable(), urlBase())
}
