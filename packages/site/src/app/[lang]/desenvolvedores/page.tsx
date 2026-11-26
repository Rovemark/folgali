import { ExtraDevelopers } from '@/components/editorial/ExtraSkill'
import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'

export const generateMetadata = institutionalMetadata('desenvolvedores')
export default institutionalPage('desenvolvedores', { extra: ExtraDevelopers })
