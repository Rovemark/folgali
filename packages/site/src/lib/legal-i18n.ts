// Screen texts of the legal front (beta notice, legal page banners, consent, report, 18+, species badges, contacts).
// Their own files (src/i18n/legal.<lang>.json) so they do not fight over lines with the big dictionaries. Each language is typed
// with the Portuguese shape: a missing or extra key is a compile error.
import pt from '@/i18n/legal.pt.json'
import en from '@/i18n/legal.en.json'
import es from '@/i18n/legal.es.json'
import fr from '@/i18n/legal.fr.json'
import from from '@/i18n/legal.de.json'
import it from '@/i18n/legal.it.json'
import already from '@/i18n/legal.ja.json'
import ko from '@/i18n/legal.ko.json'
import zh from '@/i18n/legal.zh.json'
import ru from '@/i18n/legal.ru.json'
import ar from '@/i18n/legal.ar.json'
import nl from '@/i18n/legal.nl.json'
import type { Locale } from '@/lib/i18n-base'

export type LegalUi = typeof pt

const DICTS: Record<Locale, LegalUi> = { pt, en: en as LegalUi, es: es as LegalUi, fr: fr as LegalUi, de: from as LegalUi, it: it as LegalUi, ja: already as LegalUi, ko: ko as LegalUi, zh: zh as LegalUi, ru: ru as LegalUi, ar: ar as LegalUi, nl: nl as LegalUi }

export const legalDict = (lang: Locale): LegalUi => DICTS[lang]

/** Fills `{chave}` placeholders. */
export const fill = (t: string, v: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m))
