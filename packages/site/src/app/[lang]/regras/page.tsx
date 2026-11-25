import { metadataInstitucional, paginaInstitucional } from '@/components/editorial/Institucional'
import { ExtraRegras } from '@/components/editorial/extras'

export const generateMetadata = metadataInstitucional('regras')
export default paginaInstitucional('regras', { extra: ExtraRegras, extraAntes: true })
