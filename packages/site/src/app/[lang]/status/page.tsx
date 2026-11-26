import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'
import { ExtraStatus } from '@/components/editorial/extras'

export const generateMetadata = institutionalMetadata('status')
export default institutionalPage('status', { extra: ExtraStatus, extraBefore: true })
