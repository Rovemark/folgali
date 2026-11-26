// LIGHT part of internationalization: list of languages, metadata, formatting and plural. No dictionaries, so CLIENT components
// can import from here without bringing the texts of the 12 languages to the browser (whoever needs the texts imports `@/lib/i18n`).
import type { Dictionary } from './i18n'
export type { Dictionary }

export const LOCALES = ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ru', 'ar', 'nl'] as const
export type Locale = (typeof LOCALES)[number]

export const META: Record<Locale, { native: string; html: string; dir: 'ltr' | 'rtl'; pronto: boolean }> = {
  pt: { native: 'Português', html: 'pt-BR', dir: 'ltr', pronto: true },
  en: { native: 'English', html: 'en', dir: 'ltr', pronto: true },
  es: { native: 'Español', html: 'es', dir: 'ltr', pronto: true },
  fr: { native: 'Français', html: 'fr', dir: 'ltr', pronto: true },
  de: { native: 'Deutsch', html: 'de', dir: 'ltr', pronto: true },
  it: { native: 'Italiano', html: 'it', dir: 'ltr', pronto: true },
  ja: { native: '日本語', html: 'ja', dir: 'ltr', pronto: true },
  ko: { native: '한국어', html: 'ko', dir: 'ltr', pronto: true },
  zh: { native: '中文', html: 'zh-Hans', dir: 'ltr', pronto: true },
  ru: { native: 'Русский', html: 'ru', dir: 'ltr', pronto: true },
  ar: { native: 'العربية', html: 'ar', dir: 'rtl', pronto: true },
  nl: { native: 'Nederlands', html: 'nl', dir: 'ltr', pronto: true },
}

/** Language with full, verified text. Every `Locale` has a pack; `pronto` turns the language on in the selector and in the routes. */
export type Ready = Locale
export const DEFAULT: Ready = 'pt'
export const READY = LOCALES.filter((l) => META[l].pronto)

export const isLocale = (x: string): x is Locale => (LOCALES as readonly string[]).includes(x)
export const isReady = (x: string): x is Ready => isLocale(x) && META[x].pronto

/** The person's language from Accept-Language, among those that have text. */
export function pickLanguage(header: string | null | undefined): Ready {
  if (!header) return DEFAULT
  const requests = header
    .split(',')
    .map((p) => {
      const [tag, q] = p.trim().split(';q=')
      return { tag: tag.toLowerCase(), q: q ? Number.parseFloat(q) : 1 }
    })
    .filter((p) => p.tag && !Number.isNaN(p.q))
    .sort((a, b) => b.q - a.q)
  for (const { tag } of requests) {
    const base = tag.split('-')[0]
    if (isReady(base)) return base
  }
  return DEFAULT
}

/** Replaces `{x}` with the values. A missing variable stays visible, so the test catches it. */
export function fmt(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}

export type Plural = { zero?: string; um: string; outros: string }

export function plural(p: Plural, n: number, vars: Record<string, string | number> = {}): string {
  const base = n === 0 && p.zero !== undefined ? p.zero : n === 1 ? p.um : p.outros
  return fmt(base, { n, ...vars })
}

/** "há 6 min", "6 min ago": short, without depending on the server time zone. */
export function relativeTime(iso: string, d: Dictionary, now: Date): string {
  const segment = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  if (segment < 60) return d.tempo.agora
  const min = Math.floor(segment / 60)
  if (min < 60) return fmt(d.tempo.min, { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return fmt(d.tempo.h, { n: h })
  return fmt(d.tempo.d, { n: Math.floor(h / 24) })
}

export function shortDate(iso: string, lang: Ready): string {
  return new Intl.DateTimeFormat(META[lang].html, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso))
}
