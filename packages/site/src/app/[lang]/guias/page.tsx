import { metadataInstitucional, paginaInstitucional } from '@/components/editorial/Institucional'
import { ExtraGuias } from '@/components/editorial/extras'

export const generateMetadata = metadataInstitucional('guias')
export default paginaInstitucional('guias', { tipo: 'CollectionPage', extra: ExtraGuias })
