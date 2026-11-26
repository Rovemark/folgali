import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'
import { ExtraProtocol } from '@/components/CodeLink'

export const generateMetadata = institutionalMetadata('protocolo')
export default institutionalPage('protocolo', { extra: ExtraProtocol })
