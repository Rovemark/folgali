import { metadataInstitucional, paginaInstitucional } from '@/components/editorial/Institucional'
import { ExtraProtocolo } from '@/components/LinkDoCodigo'

export const generateMetadata = metadataInstitucional('protocolo')
export default paginaInstitucional('protocolo', { extra: ExtraProtocolo })
