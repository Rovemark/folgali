import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'
import { ExtraLicense } from '@/components/editorial/extras'

export const generateMetadata = institutionalMetadata('licenca')
export default institutionalPage('licenca', { extra: ExtraLicense })
