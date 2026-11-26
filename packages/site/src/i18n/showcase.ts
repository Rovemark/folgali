// Texts for the public showcase (home page, /rover-hangar and the visual parts of /agentes). They live in their own files
// (showcase.<lang>.json) so they never fight over lines with the big dictionaries other fronts edit. Every language is typed
// against Portuguese: a missing or extra key is a compile error, not a blank on the screen.
import type { Ready } from '@/lib/i18n-base'
import pt from './showcase.pt.json'
import en from './showcase.en.json'
import es from './showcase.es.json'
import fr from './showcase.fr.json'
import from from './showcase.de.json'
import it from './showcase.it.json'
import already from './showcase.ja.json'
import ko from './showcase.ko.json'
import zh from './showcase.zh.json'
import ru from './showcase.ru.json'
import ar from './showcase.ar.json'
import nl from './showcase.nl.json'

export type ShowcaseTexts = typeof pt

const DICTS: Record<Ready, ShowcaseTexts> = { pt, en, es, fr, de: from, it, ja: already, ko, zh, ru, ar, nl }

export function showcase(lang: Ready): ShowcaseTexts {
  return DICTS[lang] ?? pt
}

/** Title and description of the showcase routes (`/rover-hangar`), read by `metaDe` next to the institutional ones. */
export function showcaseMeta(lang: Ready, id: string): { titulo: string; descricao: string } | undefined {
  return (showcase(lang).meta as Record<string, { titulo: string; descricao: string }>)[id]
}
