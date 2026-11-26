import type { MetadataRoute } from 'next'
import { sitemapData } from '@/lib/seo/sitemap-data'
import { buildSitemap } from '@/lib/seo/sitemap'

// Empty while the site is a demonstration: a map of addresses next to a noindex would be a contradiction.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(await sitemapData())
}
