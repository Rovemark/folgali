import { metadataInstitucional, paginaInstitucional } from '@/components/editorial/Institucional'
import { ExtraLicenca } from '@/components/editorial/extras'

export const generateMetadata = metadataInstitucional('licenca')
export default paginaInstitucional('licenca', { extra: ExtraLicenca })
