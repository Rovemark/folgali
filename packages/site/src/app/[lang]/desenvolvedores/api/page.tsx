import { metadataInstitucional, paginaInstitucional } from '@/components/editorial/Institucional'
import { ExtraApi } from '@/components/editorial/extras'

export const generateMetadata = metadataInstitucional('api')
export default paginaInstitucional('api', { pai: 'desenvolvedores', extra: ExtraApi, extraAntes: true })
