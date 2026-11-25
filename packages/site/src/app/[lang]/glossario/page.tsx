import { metadataInstitucional, paginaInstitucional } from '@/components/editorial/Institucional'
import { ExtraGlossario } from '@/components/editorial/extras'

export const generateMetadata = metadataInstitucional('glossario')
export default paginaInstitucional('glossario', { tipo: 'CollectionPage', extra: ExtraGlossario })
