import type { MetadataRoute } from 'next'
import { regrasDeRobots } from '@/lib/seo/politica'
import { indexavel, urlBase } from '@/lib/site'

// Fechado por padrão (demonstração em domínio provisório). Com ROVER_NETWORK_INDEXAVEL=sim abre o conteúdo público para busca e
// IA, e continua fechando o que depende de credencial. A política inteira está em src/lib/seo/politica.ts e em docs/SEO-AEO-GEO.md.
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return regrasDeRobots(indexavel(), urlBase())
}
