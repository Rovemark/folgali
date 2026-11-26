// The legal pages of the site: which document each route shows, its version, and the text in each language. The texts come from
// Lex's legal pack through scripts/generate-legal.mjs; Portuguese and English are the source, the other ten languages are
// machine translations from English (src/legal/sources/<lang>), and a page missing in a language falls back to English.
import '@/lib/legacy-env'
import { TEXTS as pt } from './generated/pt'
import { TEXTS as en } from './generated/en'
import { TEXTS as es } from './generated/es'
import { TEXTS as fr } from './generated/fr'
import { TEXTS as from } from './generated/de'
import { TEXTS as it } from './generated/it'
import { TEXTS as already } from './generated/ja'
import { TEXTS as ko } from './generated/ko'
import { TEXTS as zh } from './generated/zh'
import { TEXTS as ru } from './generated/ru'
import { TEXTS as ar } from './generated/ar'
import { TEXTS as nl } from './generated/nl'
import { VERSIONS } from './generated/versions'
import type { Locale } from '@/lib/i18n-base'
import type { LegalTexts } from './types'

export type LegalPage = {
  /** the document key in src/legal/sources (also the base of the route) */
  key: string
  /** the route id in src/lib/seo/routes.ts */
  routeId: string
  /** path without the language */
  path: string
}

export const LEGAL_PAGES: readonly LegalPage[] = [
  { key: 'termos', routeId: 'termos', path: '/termos' },
  { key: 'privacidade', routeId: 'privacidade', path: '/privacidade' },
  { key: 'cookies', routeId: 'cookies', path: '/cookies' },
  { key: 'regras', routeId: 'regras', path: '/regras' },
  // /moderacao is the public moderation log; the policy lives under it (Lex's request, section 1)
  { key: 'moderacao', routeId: 'moderacaoPolitica', path: '/moderacao/politica' },
  { key: 'direitos-autorais', routeId: 'direitosAutorais', path: '/direitos-autorais' },
  { key: 'idade', routeId: 'idade', path: '/idade' },
  { key: 'desenvolvedores-termos', routeId: 'termosDesenvolvedores', path: '/desenvolvedores/termos' },
  { key: 'responsabilidade-por-agentes', routeId: 'responsabilidadeAgentes', path: '/responsabilidade-por-agentes' },
]

const TEXTS: Record<Locale, LegalTexts> = { pt, en, es, fr, de: from, it, ja: already, ko, zh, ru, ar, nl }

/** Languages whose legal text is the original (Portuguese) or the full human translation (English). */
export const LEGAL_SOURCE_LANGS: readonly Locale[] = ['pt', 'en']

export const legalPage = (key: string): LegalPage => {
  const p = LEGAL_PAGES.find((x) => x.key === key)
  if (!p) throw new Error(`unknown legal page: ${key}`)
  return p
}

/** The document in a language, and whether it is a machine translation or an English fallback. */
export function legalText(key: string, lang: Locale): { md: string; lang: Locale; machine: boolean } {
  const own = TEXTS[lang][key]
  if (own) return { md: own, lang, machine: !LEGAL_SOURCE_LANGS.includes(lang) }
  return { md: TEXTS.en[key] ?? '', lang: 'en', machine: false }
}

export const legalVersion = (key: string): string => VERSIONS[key] ?? '1.0-beta'

/** Links inside the documents point to the path without language; /moderacao means the policy, not the log. */
export function legalLink(lang: Locale) {
  return (path: string): string => {
    const [p, hash] = path.split('#')
    const target = p === '/moderacao' ? '/moderacao/politica' : p
    return `/${lang}${target}${hash ? `#${hash}` : ''}`
  }
}

/**
 * When the texts are in force. Lex left the publication date to be filled in: set FOLGALI_LEGAL_EFFECTIVE (YYYY-MM-DD) at build time
 * when the texts go live; without it the page says the date is still to be provided.
 */
export function effectiveDate(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const v = env.FOLGALI_LEGAL_EFFECTIVE?.trim()
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}
