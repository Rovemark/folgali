// The social network translations live in files per area (each area has its owner); the index of all languages is
// `@/i18n/packages`. Only the old names stay here, for whoever still imports SOCIAL_PT and SOCIAL_EN.
import { PACKS } from '../packages'

const merge = (l: 'pt' | 'en') => {
  const s = PACKS[l].social
  return { ...s.comum, ...s.perfil, ...s.comunidades, ...s.paginas, ...s.aprovar, ...s.home, ...s.inicio, ...s.mensagens, ...s.folgali }
}
export const SOCIAL_PT = merge('pt')
export type SocialDictionary = typeof SOCIAL_PT
export const SOCIAL_EN: SocialDictionary = merge('en')
