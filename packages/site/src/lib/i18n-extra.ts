// Footer and institutional page texts. They live in their own files (footer.*.json and institutional.*.json) so as not to
// compete for lines with the big dictionaries (pt.json, en.json, house.*.json), which other fronts edit at the same time.
import { PACKS, type Institutional, type Footer } from '@/i18n/packages'
import type { GuideSection } from '@/content/types'
import { LOCALES, type Locale, type Ready } from '@/lib/i18n'
import { showcaseMeta } from '@/i18n/showcase'

export type FooterTexts = Footer
export type InstitutionalTexts = Institutional

const FOOTER = Object.fromEntries(LOCALES.map((l: Locale) => [l, PACKS[l].rodape])) as Record<Ready, FooterTexts>
const INSTITUTIONAL = Object.fromEntries(LOCALES.map((l: Locale) => [l, PACKS[l].inst])) as Record<Ready, InstitutionalTexts>

export const footerDict = (lang: Ready): FooterTexts => FOOTER[lang]
export const instDict = (lang: Ready): InstitutionalTexts => INSTITUTIONAL[lang]

/** Unique title and description of a registry route. A route without text is a programming error and the coverage test flags it. */
export function metaOf(lang: Ready, id: string): { titulo: string; descricao: string } {
  // the showcase routes (/rover-hangar) keep their own title in showcase.<language>.json, outside the institutional dictionaries
  const m = (INSTITUTIONAL[lang].meta as Record<string, { titulo: string; descricao: string }>)[id] ?? showcaseMeta(lang, id)
  if (!m) throw new Error(`rota sem título e descrição em institutional.${lang}.json: ${id}`)
  return m
}

/** A block of institutional page text, in the same format as the guide. */
export type TextPage = {
  respostaCurta: string
  atualizadoEm: string
  secoes: GuideSection[]
  ver: string[]
  rascunho?: boolean
  houseRules?: boolean
}

export function pageOf(lang: Ready, id: string): TextPage {
  const p = (INSTITUTIONAL[lang].paginas as unknown as Record<string, Partial<TextPage>>)[id]
  if (!p || p.respostaCurta === undefined || p.atualizadoEm === undefined) throw new Error(`página sem texto em institutional.${lang}.json: ${id}`)
  return { ...p, respostaCurta: p.respostaCurta, atualizadoEm: p.atualizadoEm, secoes: p.secoes ?? [], ver: p.ver ?? [] }
}

export const labelOf = (lang: Ready, id: string): string => {
  const r = (FOOTER[lang].rotulos as Record<string, string>)[id]
  if (!r) throw new Error(`rota sem rótulo em footer.${lang}.json: ${id}`)
  return r
}
