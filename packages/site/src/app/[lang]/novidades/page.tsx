import type { Metadata } from 'next'
import { paginaInstitucional } from '@/components/editorial/Institucional'
import { ExtraNovidades } from '@/components/editorial/extras'
import { ehPronto } from '@/lib/i18n'
import { metaDe } from '@/lib/i18n-extra'
import { metaDaPagina } from '@/lib/seo/metadata'
import { urlBase } from '@/lib/site'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const l = ehPronto(lang) ? lang : 'pt'
  const m = metaDe(l, 'novidades')
  return metaDaPagina({ lang: l, caminho: '/novidades', titulo: m.titulo, descricao: m.descricao, imagemId: 'novidades', feed: `${urlBase()}/${l}/rss.xml` })
}
export default paginaInstitucional('novidades', { tipo: 'CollectionPage', extra: ExtraNovidades })
