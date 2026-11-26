// Languages. The structure is already 12 (the same as Rover Hangar); today only pt-BR and en have text. The
// other ten are declared as pending: they appear in the selector, turned off, and whoever opens their
// address falls back to English. When a language gets its JSON file, just change `pronto` to true.

import { PACKS } from '@/i18n/packages'
import { LOCALES, type Locale, type Ready } from './i18n-base'
import type { SocialDictionary } from '@/i18n/social'

// The house rule and the About page live in casa.<language>.json, and only there: they are the texts the legal review
// will replace (the legal team's draft of the house rules). The rest of the messages stay in <language>.json.
const merge = <B extends { linha: object; aprovar: object }, C extends { linha: object; sobre: object; aprovar: object }>(
  base: B,
  house: C,
): Omit<B, 'linha' | 'aprovar'> & { linha: B['linha'] & C['linha']; aprovar: B['aprovar'] & C['aprovar']; sobre: C['sobre'] } => ({
  ...base,
  linha: { ...base.linha, ...house.linha },
  // the text describing approval (the nuance between what asks for approval and what is free) also belongs to the house
  aprovar: { ...base.aprovar, ...house.aprovar },
  sobre: house.sobre,
})

export type Dictionary = ReturnType<typeof merge<typeof PACKS.pt.base, typeof PACKS.pt.casa>> & SocialDictionary

const build = (l: Locale): Dictionary => {
  const p = PACKS[l]
  return { ...merge(p.base, p.casa), ...p.social.comum, ...p.social.perfil, ...p.social.comunidades, ...p.social.paginas, ...p.social.aprovar, ...p.social.home, ...p.social.inicio, ...p.social.mensagens, ...p.social.folgali } as Dictionary
}
const DICTIONARIES = Object.fromEntries(LOCALES.map((l) => [l, build(l)])) as Record<Locale, Dictionary>

export function dict(lang: Ready): Dictionary {
  return DICTIONARIES[lang]
}

export * from './i18n-base'
