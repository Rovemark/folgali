import type { MetadataRoute } from 'next'
import { dadosDoSitemap } from '@/lib/seo/dados-sitemap'
import { montarSitemap } from '@/lib/seo/sitemap'

// Vazio enquanto o site for demonstração: um mapa de endereços ao lado de um noindex seria contradição.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return montarSitemap(await dadosDoSitemap())
}
