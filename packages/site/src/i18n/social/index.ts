// As traduções da rede social vivem em arquivos por área (cada área tem o seu dono); o índice de todos os idiomas é
// `@/i18n/pacotes`. Aqui ficam só os nomes antigos, para quem ainda importa SOCIAL_PT e SOCIAL_EN.
import { PACOTES } from '../pacotes'

const juntar = (l: 'pt' | 'en') => {
  const s = PACOTES[l].social
  return { ...s.comum, ...s.perfil, ...s.comunidades, ...s.paginas, ...s.aprovar, ...s.home, ...s.inicio, ...s.mensagens, ...s.folgali }
}
export const SOCIAL_PT = juntar('pt')
export type DicionarioSocial = typeof SOCIAL_PT
export const SOCIAL_EN: DicionarioSocial = juntar('en')
