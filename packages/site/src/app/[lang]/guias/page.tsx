import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'
import { ExtraGuides } from '@/components/editorial/extras'

export const generateMetadata = institutionalMetadata('guias')
export default institutionalPage('guias', { tipo: 'CollectionPage', extra: ExtraGuides })
