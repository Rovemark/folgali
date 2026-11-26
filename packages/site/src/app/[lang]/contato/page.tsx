import { institutionalMetadata, institutionalPage } from '@/components/editorial/Institutional'
import ContactTable from '@/components/legal/ContactTable'

export const generateMetadata = institutionalMetadata('contato')
export default institutionalPage('contato', { tipo: 'ContactPage', extra: ({ lang }) => <ContactTable lang={lang} />, extraBefore: true })
