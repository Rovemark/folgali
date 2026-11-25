// Parte LEVE da internacionalização: lista de idiomas, metadados, formatação e plural. Sem dicionários, para que componentes de
// CLIENTE possam importar daqui sem levar os textos dos 12 idiomas para o navegador (quem precisa dos textos importa `@/lib/i18n`).
import type { Dicionario } from './i18n'
export type { Dicionario }

export const LOCALES = ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ru', 'ar', 'nl'] as const
export type Locale = (typeof LOCALES)[number]

export const META: Record<Locale, { nativo: string; html: string; dir: 'ltr' | 'rtl'; pronto: boolean }> = {
  pt: { nativo: 'Português', html: 'pt-BR', dir: 'ltr', pronto: true },
  en: { nativo: 'English', html: 'en', dir: 'ltr', pronto: true },
  es: { nativo: 'Español', html: 'es', dir: 'ltr', pronto: true },
  fr: { nativo: 'Français', html: 'fr', dir: 'ltr', pronto: true },
  de: { nativo: 'Deutsch', html: 'de', dir: 'ltr', pronto: true },
  it: { nativo: 'Italiano', html: 'it', dir: 'ltr', pronto: true },
  ja: { nativo: '日本語', html: 'ja', dir: 'ltr', pronto: true },
  ko: { nativo: '한국어', html: 'ko', dir: 'ltr', pronto: true },
  zh: { nativo: '中文', html: 'zh-Hans', dir: 'ltr', pronto: true },
  ru: { nativo: 'Русский', html: 'ru', dir: 'ltr', pronto: true },
  ar: { nativo: 'العربية', html: 'ar', dir: 'rtl', pronto: true },
  nl: { nativo: 'Nederlands', html: 'nl', dir: 'ltr', pronto: true },
}

/** Idioma com texto completo e verificado. Todo `Locale` tem pacote; `pronto` liga o idioma no seletor e nas rotas. */
export type Pronto = Locale
export const PADRAO: Pronto = 'pt'
export const PRONTOS = LOCALES.filter((l) => META[l].pronto)

export const ehLocale = (x: string): x is Locale => (LOCALES as readonly string[]).includes(x)
export const ehPronto = (x: string): x is Pronto => ehLocale(x) && META[x].pronto

/** O idioma da pessoa a partir de Accept-Language, entre os que têm texto. */
export function escolherIdioma(cabecalho: string | null | undefined): Pronto {
  if (!cabecalho) return PADRAO
  const pedidos = cabecalho
    .split(',')
    .map((p) => {
      const [tag, q] = p.trim().split(';q=')
      return { tag: tag.toLowerCase(), q: q ? Number.parseFloat(q) : 1 }
    })
    .filter((p) => p.tag && !Number.isNaN(p.q))
    .sort((a, b) => b.q - a.q)
  for (const { tag } of pedidos) {
    const base = tag.split('-')[0]
    if (ehPronto(base)) return base
  }
  return PADRAO
}

/** Troca `{x}` pelos valores. Variável que falta fica visível, para o teste pegar. */
export function fmt(texto: string, vars: Record<string, string | number> = {}): string {
  return texto.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}

export type Plural = { zero?: string; um: string; outros: string }

export function plural(p: Plural, n: number, vars: Record<string, string | number> = {}): string {
  const base = n === 0 && p.zero !== undefined ? p.zero : n === 1 ? p.um : p.outros
  return fmt(base, { n, ...vars })
}

/** "há 6 min", "6 min ago": curto, sem depender do fuso do servidor. */
export function tempoRelativo(iso: string, d: Dicionario, agora: Date): string {
  const seg = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 1000))
  if (seg < 60) return d.tempo.agora
  const min = Math.floor(seg / 60)
  if (min < 60) return fmt(d.tempo.min, { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return fmt(d.tempo.h, { n: h })
  return fmt(d.tempo.d, { n: Math.floor(h / 24) })
}

export function dataCurta(iso: string, lang: Pronto): string {
  return new Intl.DateTimeFormat(META[lang].html, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso))
}
