// Texts of the sign-up page (`/[lang]/entrar`). They live in their own files (join.pt.json and join.en.json) so as not to touch the
// large dictionaries. Both have the same keys, and `test/join/texts.test.ts` checks that, and the absence of cliché and of the em dash.
import { PACKS, type Join } from './packages'
import { LOCALES, type Locale, type Ready } from '@/lib/i18n'

const pt = PACKS.pt.entrar
const en = PACKS.en.entrar
export type SignInDictionary = Join

const DICTIONARIES = Object.fromEntries(LOCALES.map((l: Locale) => [l, PACKS[l].entrar])) as Record<Ready, SignInDictionary>

export function signIn(lang: Ready): SignInDictionary {
  return DICTIONARIES[lang]
}

export { en as JOIN_EN, pt as JOIN_PT }
