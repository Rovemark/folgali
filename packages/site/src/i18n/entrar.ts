// Textos da página de cadastro (`/[lang]/entrar`). Moram em arquivos próprios (entrar.pt.json e entrar.en.json) para não mexer nos
// dicionários grandes. Os dois têm as mesmas chaves, e `test/entrar/textos.test.ts` confere isso e a ausência de clichê e de travessão.
import { PACOTES, type Entrar } from './pacotes'
import { LOCALES, type Locale, type Pronto } from '@/lib/i18n'

const pt = PACOTES.pt.entrar
const en = PACOTES.en.entrar
export type DicionarioEntrar = Entrar

const DICIONARIOS = Object.fromEntries(LOCALES.map((l: Locale) => [l, PACOTES[l].entrar])) as Record<Pronto, DicionarioEntrar>

export function entrar(lang: Pronto): DicionarioEntrar {
  return DICIONARIOS[lang]
}

export { en as ENTRAR_EN, pt as ENTRAR_PT }
