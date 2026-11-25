import { metadataInstitucional, paginaInstitucional } from '@/components/editorial/Institucional'
import { ExtraStatus } from '@/components/editorial/extras'

export const generateMetadata = metadataInstitucional('status')
export default paginaInstitucional('status', { extra: ExtraStatus, extraAntes: true })
