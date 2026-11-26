// Public identity of the site and the key that decides whether it is indexable.
//
// The site TODAY is a demonstration on a provisional domain and the legal texts are still drafts: by default NOTHING is indexable.
// The flag `FOLGALI_INDEXABLE=sim` turns everything on at once (meta robots, X-Robots-Tag, robots.txt and sitemap.xml read the SAME
// function), so nobody forgets a corner. It is read at run time, never at build time.

import '@/lib/legacy-env'
export const DEFAULT_BASE_URL = 'https://folgali.com'

/** The entity as machines should cite it: always the same name, the same sentence and the same sameAs. */
export const ENTITY = {
  nome: 'folgali',
  empresa: 'Rovemark',
  siblingProduct: 'Rover Hangar',
  licenca: 'AGPL-3.0',
  licenseUrl: 'https://www.gnu.org/licenses/agpl-3.0.html',
  companyUrl: 'https://rovemark.co',
  /** The open source (AGPL): the folgali repository on Rovemark's GitHub account (GOVERNANCE.md). */
  codeUrl: 'https://github.com/Rovemark/folgali',
  siblingProductUrl: 'https://roverhangar.com',
  securityEmail: 'security@rovemark.co',
  /** folgali contacts (Terms, section 18), all on the Rovemark domain. */
  emails: { abuse: 'abuse@rovemark.co', security: 'security@rovemark.co', privacy: 'privacy@rovemark.co', legal: 'legal@rovemark.co', support: 'support@rovemark.co' },
} as const

type Environment = Readonly<Record<string, string | undefined>>

/**
 * Is the site showing demonstration data? With the fake client, always. With the real relay (`FOLGALI_CLIENT=http`), only
 * when whoever operates says that relay is a demonstration one (`FOLGALI_DEMO=sim`). One function for the strip, the footer and the
 * screens that today show invented photos and stories: in real mode none of that appears (packages/site/docs/PRODUCTION.md).
 */
export function isDemo(mode: 'falso' | 'http', env: Environment = process.env): boolean {
  return mode === 'falso' || env.FOLGALI_DEMO === 'sim'
}

/** `sim` turns it on. Anything else (including `true`, `1`, empty) keeps the site closed: fail closed. */
export function indexable(env: Environment = process.env): boolean {
  return env.FOLGALI_INDEXABLE === 'sim'
}

/** Base address with no trailing slash. Only accepts https (or http on localhost); the rest falls back to the default. */
export function urlBase(env: Environment = process.env): string {
  const rawValue = env.FOLGALI_BASE_URL?.trim()
  if (!rawValue) return DEFAULT_BASE_URL
  try {
    const u = new URL(rawValue)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return DEFAULT_BASE_URL
    return u.origin
  } catch {
    return DEFAULT_BASE_URL
  }
}

/** Absolute address of a route. `caminho` is '' (start of the language) or starts with `/`. */
export function absoluteUrl(base: string, lang: string, path = ''): string {
  return `${base}/${lang}${path}`
}

/** A language with ready text and the code that goes in the hreflang. */
export type Language = { lang: string; hreflang: string }

/** hreflang of a route: one per ready language, plus x-default pointing to the default language. */
export function alternatives(base: string, path: string, languageSet: readonly Language[], defaultValue: string): Record<string, string> {
  const languages: Record<string, string> = {}
  for (const i of languageSet) languages[i.hreflang] = absoluteUrl(base, i.lang, path)
  languages['x-default'] = absoluteUrl(base, defaultValue, path)
  return languages
}
