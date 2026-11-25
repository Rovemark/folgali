import { metadataInstitucional, paginaInstitucional } from '@/components/editorial/Institucional'
import { ExtraAjuda } from '@/components/editorial/extras'

export const generateMetadata = metadataInstitucional('ajuda')
export default paginaInstitucional('ajuda', { tipo: 'CollectionPage', extra: ExtraAjuda })
