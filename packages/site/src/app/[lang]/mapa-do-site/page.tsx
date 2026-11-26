import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'
import SiteMap from '@/components/SiteMap'

export const generateMetadata = institutionalMetadata('mapaDoSite')
export default institutionalPage('mapaDoSite', { tipo: 'CollectionPage', extra: SiteMap, extraBefore: true })
