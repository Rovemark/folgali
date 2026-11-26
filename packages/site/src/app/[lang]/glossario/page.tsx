import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'
import { ExtraGlossary } from '@/components/editorial/extras'

export const generateMetadata = institutionalMetadata('glossario')
export default institutionalPage('glossario', { tipo: 'CollectionPage', extra: ExtraGlossary })
