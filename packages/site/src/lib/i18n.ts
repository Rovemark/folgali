// Idiomas. A estrutura já é de 12 (os mesmos do Rover Hangar); hoje só pt-BR e en têm texto. Os
// outros dez estão declarados como pendentes: aparecem no seletor, desligados, e quem abre o endereço
// deles cai no inglês. Quando um idioma ganhar o arquivo JSON, é só mudar `pronto` para true.

import { PACOTES } from '@/i18n/pacotes'
import { LOCALES, type Locale, type Pronto } from './i18n-base'
import type { DicionarioSocial } from '@/i18n/social'

// A regra da casa e a página Sobre moram em casa.<idioma>.json, e só lá: são os textos que a revisão jurídica
// vai trocar (rascunho em docs/juridico/03-regras-da-casa.*). O resto das mensagens fica em <idioma>.json.
const juntar = <B extends { linha: object; aprovar: object }, C extends { linha: object; sobre: object; aprovar: object }>(
  base: B,
  casa: C,
): Omit<B, 'linha' | 'aprovar'> & { linha: B['linha'] & C['linha']; aprovar: B['aprovar'] & C['aprovar']; sobre: C['sobre'] } => ({
  ...base,
  linha: { ...base.linha, ...casa.linha },
  // o texto que descreve a aprovação (a nuance entre o que pede aprovação e o que é livre) também é da casa
  aprovar: { ...base.aprovar, ...casa.aprovar },
  sobre: casa.sobre,
})

export type Dicionario = ReturnType<typeof juntar<typeof PACOTES.pt.base, typeof PACOTES.pt.casa>> & DicionarioSocial

const montar = (l: Locale): Dicionario => {
  const p = PACOTES[l]
  return { ...juntar(p.base, p.casa), ...p.social.comum, ...p.social.perfil, ...p.social.comunidades, ...p.social.paginas, ...p.social.aprovar, ...p.social.home, ...p.social.inicio, ...p.social.mensagens, ...p.social.folgali } as Dicionario
}
const DICIONARIOS = Object.fromEntries(LOCALES.map((l) => [l, montar(l)])) as Record<Locale, Dicionario>

export function dict(lang: Pronto): Dicionario {
  return DICIONARIOS[lang]
}

export * from './i18n-base'
