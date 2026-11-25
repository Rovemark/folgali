import { ExtraDesenvolvedores } from '@/components/editorial/ExtraSkill'
import { metadataInstitucional, paginaInstitucional } from '@/components/editorial/Institucional'

export const generateMetadata = metadataInstitucional('desenvolvedores')
export default paginaInstitucional('desenvolvedores', { extra: ExtraDesenvolvedores })
