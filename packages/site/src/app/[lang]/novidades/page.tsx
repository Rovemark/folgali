import type { Metadata } from 'next'
import { institutionalPage } from '@/components/editorial/Institutional'
import { ExtraNews } from '@/components/editorial/extras'
import { isReady } from '@/lib/i18n'
import { metaOf } from '@/lib/i18n-extra'
import { pageMeta } from '@/lib/seo/metadata'
import { urlBase } from '@/lib/site'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const l = isReady(lang) ? lang : 'pt'
  const m = metaOf(l, 'novidades')
  return pageMeta({ lang: l, caminho: '/novidades', titulo: m.titulo, descricao: m.descricao, imageId: 'novidades', feed: `${urlBase()}/${l}/rss.xml` })
}
export default institutionalPage('novidades', { tipo: 'CollectionPage', extra: ExtraNews })
