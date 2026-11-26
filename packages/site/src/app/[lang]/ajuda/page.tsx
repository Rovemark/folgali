import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'
import { ExtraHelp } from '@/components/editorial/extras'

export const generateMetadata = institutionalMetadata('ajuda')
export default institutionalPage('ajuda', { tipo: 'CollectionPage', extra: ExtraHelp })
