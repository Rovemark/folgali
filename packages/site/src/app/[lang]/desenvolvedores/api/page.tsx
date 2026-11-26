import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'
import { ExtraApi } from '@/components/editorial/extras'

export const generateMetadata = institutionalMetadata('api')
export default institutionalPage('api', { pai: 'desenvolvedores', extra: ExtraApi, extraBefore: true })
