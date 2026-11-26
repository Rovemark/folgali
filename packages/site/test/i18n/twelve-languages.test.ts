// Rovemark's 12 languages (pt, en, es, fr, de, it, nl, ru, ar, zh, ja, ko) must have the SAME site: same keys, same markers,
// same numbers, same editorial content, no em dash, and their own text (not a copy of English). Runs for every declared language,
// ready or not: a language only becomes `pronto` in the selector when this file passes for it.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { contentOf } from '@/content'
import { LOCALES, META, READY, dict, type Locale } from '@/lib/i18n'
import { instDict, footerDict } from '@/lib/i18n-extra'
import { PACKS } from '@/i18n/packages'

const DIR = path.resolve(__dirname, '../../src/i18n')
const OTHERS = LOCALES.filter((l): l is Exclude<Locale, 'pt'> => l !== 'pt')
const NEW_ITEMS = LOCALES.filter((l) => l !== 'pt' && l !== 'en')

/** All the text leaves of an object, with the path. */
function leaves(o: unknown, path = ''): [string, string][] {
  if (typeof o === 'string') return [[path, o]]
  if (Array.isArray(o)) return o.flatMap((x, i) => leaves(x, `${path}[${i}]`))
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  return []
}
const markers = (s: string) => [...s.matchAll(/\{[^{}]*\}|`[^`]*`|<\/?[a-zA-Z][^>]*>|https?:\/\/(?:[\w-]+(?:\.[\w-]+)*(?:\/[^\s)"'.,;]*[^\s)"'.,;])?)?|%[sd]/g)].map((m) => m[0]).sort().join('|')
const shapesWithoutOrder = (o: unknown, path = ''): string[] => {
  if (Array.isArray(o)) return [`${path}[${o.length}]`, ...o.flatMap((x, i) => shapesWithoutOrder(x, `${path}[${i}]`))]
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => shapesWithoutOrder(v, path ? `${path}.${k}` : k))
  return [`${path}:${typeof o}`]
}
/** The order of the keys in the file does not matter, only the set. */
const shapes = (o: unknown): string[] => shapesWithoutOrder(o).sort()

const PARTS = ['base', 'casa', 'entrar', 'inst', 'rodape'] as const

/**
 * New keys that, in the ten machine-translated languages, still hold the English text, awaiting translation. Each front that
 * adds text leaves the list in `docs/TRANSLATION-REQUESTS-<front>.md` (in packages/site) and marks the keys here; whoever integrates
 * translates and removes them from here. Path in the format of `leaves([PACKS[l], contentOf(l)])`.
 */
const PENDING_SKILL: readonly string[] = []

/**
 * TEMPORARY exception for the private messages front (revision 0.4.0): new keys that still hold the English text in the ten
 * languages, awaiting translation (list in docs/TRANSLATION-REQUESTS-dm.md, at the repository root). Whoever translates removes the line from here, and the
 * 95% bar applies to them again. The last entry came from the merge with the media front (the private message item of the comparison guide).
 */
const PENDING_MESSAGES: readonly RegExp[] = []
const pendingMessages = (path: string) => PENDING_MESSAGES.some((re) => re.test(path))

/**
 * TEMPORARY exception for the integration of revision 0.5.0 into the site (2026-11-10), with the request in docs/TRANSLATION-REQUESTS-integration.md.
 * `novas`: leaves that entered in pt and en (the 0.4.0 and 0.5.0 lines of the version history and the five news items at the top) and hold
 * copied English in the ten languages; they stay out of the "copy of English" count.
 * `faqsChanged`: FAQ answers whose pt text changed (the revision went from 0.3.2 to 0.5.0, with private messages and images)
 * and that in the ten languages still have the previous text; they stay out of the number check until translated.
 * Whoever translates empties both lists. A pending item that is already resolved makes the pending test fail, so it leaves from here.
 */
const PENDING_INTEGRATION: { pedido: string; novas: readonly RegExp[]; faqsChanged: readonly (readonly [string, 'respostaCurta' | 'resposta'])[] } = {
  pedido: 'docs/TRANSLATION-REQUESTS-integration.md',
  novas: [],
  faqsChanged: [],
}
const pendingIntegration = (path: string) => PENDING_INTEGRATION.novas.some((re) => re.test(path))
const faqChanged = (id: string, field: 'respostaCurta' | 'resposta') => PENDING_INTEGRATION.faqsChanged.some(([i, c]) => i === id && c === field)
/** The numbers and versions of a text that the translation has to keep equal. */
const numbersOf = (text: string) => text.replace(/\d{2}\/\d{2}\/(\d{4})/g, '$1').match(/\d+(?:\.\d+)+|\d{2,}/g) ?? []


describe('12 languages: same shape, same markers', () => {
  it('each selector\'s language exists, with a direction and a label', () => {
    expect(LOCALES).toHaveLength(12)
    for (const l of LOCALES) {
      expect(META[l].native, l).toBeTruthy()
      expect(META[l].dir, l).toBe(l === 'ar' ? 'rtl' : 'ltr')
    }
  })
  for (const l of OTHERS) {
    it(`${l}: dictionaries with the same shape as Portuguese (keys, lists and types)`, () => {
      for (const part of PARTS) expect(shapes(PACKS[l][part]), `${l}.${part}`).toEqual(shapes(PACKS.pt[part]))
      expect(shapes(PACKS[l].social), `${l}.social`).toEqual(shapes(PACKS.pt.social))
    })
    it(`${l}: each text keeps the same markers as Portuguese ({n}, \`code\`, URL, tag)`, () => {
      for (const part of [...PARTS, 'social'] as const) {
        const pt = new Map(leaves(PACKS.pt[part]))
        for (const [c, t] of leaves(PACKS[l][part])) {
          if (c.endsWith('_fonte')) continue
          expect(markers(t), `${l}.${part}.${c}`).toBe(markers(pt.get(c) ?? ''))
        }
      }
    })
    it(`${l}: no em dash or en dash in any text`, () => {
      const all = JSON.stringify([PACKS[l], contentOf(l)])
      expect(all).not.toMatch(/[—–]/)
    })
  }
})

describe('12 languages: the editorial content has the same items', () => {
  const pt = contentOf('pt')
  for (const l of OTHERS) {
    it(`${l}: same FAQ ids, glossary and guide slugs, news items, related entries and cited questions`, () => {
      const c = contentOf(l)
      expect(c.faq.map((f) => f.id)).toEqual(pt.faq.map((f) => f.id))
      expect(c.verbetes.map((v) => v.slug)).toEqual(pt.verbetes.map((v) => v.slug))
      expect(c.guias.map((g) => g.slug)).toEqual(pt.guias.map((g) => g.slug))
      expect(c.novidades.map((n) => n.id)).toEqual(pt.novidades.map((n) => n.id))
      c.verbetes.forEach((v, i) => expect(v.relacionados ?? [], v.slug).toEqual(pt.verbetes[i].relacionados ?? []))
      c.guias.forEach((g, i) => expect(g.perguntas ?? [], g.slug).toEqual(pt.guias[i].perguntas ?? []))
      c.guias.forEach((g, i) => expect(g.secoes.length, g.slug).toBe(pt.guias[i].secoes.length))
      // the code block is not translated: in the translated languages it is identical to the Portuguese one
      if (l !== 'en') c.guias.forEach((g, i) => g.secoes.forEach((s, j) => expect(s.codigo, `${g.slug}#${j}`).toEqual(pt.guias[i].secoes[j].codigo)))
      c.faq.forEach((f, i) => expect(f.atualizadoEm).toBe(pt.faq[i].atualizadoEm))
    })
    it(`${l}: every number of two digits or more and every version from Portuguese appears equal in the answer`, () => {
      const c = contentOf(l)
      // a one-digit number may become a word ("1 hora" becomes "ساعة واحدة"), so only what is data is required: 14, 500, 0.3.2, 25519...
      c.faq.forEach((f, i) => {
        // the pt answer that changed and still awaits translation (PENDING_INTEGRATION.faqsChanged) stays out until translated
        const ptTxt = (['respostaCurta', 'resposta'] as const).filter((field) => !faqChanged(pt.faq[i].id, field)).map((field) => pt.faq[i][field]).join(' ')
        const txt = `${f.respostaCurta} ${f.resposta}`
        // dd/mm/yyyy dates change shape in each language (05/11/2026 becomes "2026年11月5日"): only the year is data
        for (const n of numbersOf(ptTxt)) expect(txt, `${l} ${f.id}: falta ${n}`).toContain(n)
      })
    })
    it(`${l}: the short answer fits the writing size rule (words in the Latin, Cyrillic and Arabic alphabets; characters in Chinese, Japanese and Korean)`, () => {
      const c = contentOf(l)
      const cjk = l === 'zh' || l === 'ja' || l === 'ko'
      for (const f of c.faq) {
        if (cjk) {
          expect(f.respostaCurta.length, f.id).toBeGreaterThanOrEqual(30)
          expect(f.respostaCurta.length, f.id).toBeLessThanOrEqual(260)
        } else {
          const words = f.respostaCurta.trim().split(/\s+/).length
          expect(words, `${l} ${f.id}: ${words} palavras`).toBeGreaterThanOrEqual(28)
          expect(words, `${l} ${f.id}: ${words} palavras`).toBeLessThanOrEqual(80)
        }
      }
    })
  }
})

/**
 * New keys that arrived with the pt and en text and still await translation into the other ten languages. In those ten, the file has
 * English copied in, only so the suite compiles. TEMPORARY: whoever integrates translates, removes the entry from here and the test goes back to requiring
 * their own text. Each entry points to the request with the list of keys (docs/TRANSLATION-REQUESTS-<front>.md).
 */
const PENDING_PANEL: readonly { front: string; pedido: string; chaves: RegExp }[] = [
  // the two conversation notices (0.4.0) on the notices screen
]
const pendingPanel = (path: string) => PENDING_PANEL.some((p) => p.chaves.test(path))

describe('12 languages: pending translations (temporary exception)', () => {
  it('each pending item has the request written, and the request exists', () => {
    for (const p of PENDING_PANEL) expect(fs.existsSync(path.resolve(__dirname, '../..', p.pedido)), p.pedido).toBe(true)
  })
  for (const p of PENDING_PANEL) {
    it(`${p.front}: the exception only covers keys that exist in pt and en`, () => {
      expect(leaves([PACKS.pt]).filter(([c]) => p.chaves.test(c)).length).toBeGreaterThan(0)
      expect(leaves([PACKS.en]).filter(([c]) => p.chaves.test(c)).length).toBe(leaves([PACKS.pt]).filter(([c]) => p.chaves.test(c)).length)
    })
  }
})

/**
 * TEMPORARY exception: leaves new or changed by the media front (revision 0.5.0) that are in English in the ten languages until the
 * integrator translates (list in docs/TRANSLATION-REQUESTS-media.md). They stay out of the "copy of English" count. Empty it when translating.
 */
const PENDING_MEDIA: readonly string[] = []

describe('12 languages: their own text, not a copy of English', () => {
  for (const l of NEW_ITEMS) {
    it(`${l}: at least 80% of the text leaves differ from English (ready language: 95%)`, () => {
      const en = new Map(leaves([PACKS.en, contentOf('en')]))
      const own = leaves([PACKS[l], contentOf(l)]).filter(([c, t]) => /\p{L}{3}/u.test(t) && !/^[\w./:@#%+=-]+$/.test(t) && !c.endsWith('_fonte') && !pendingPanel(c) && !pendingMessages(c) && !PENDING_SKILL.includes(c) && !PENDING_MEDIA.includes(c) && !pendingIntegration(c))
      const equal = own.filter(([c, t]) => en.get(c) === t).length
      const min = (READY as readonly Locale[]).includes(l) ? 0.95 : 0.8
      expect(1 - equal / own.length, `${l}: ${equal} of ${own.length} equal to English`).toBeGreaterThanOrEqual(min)
    })
  }
})

describe('12 languages: translation backlog', () => {
  it('every pending key exists in all languages (an old pending item, of a deleted key, leaves the list)', () => {
    for (const l of NEW_ITEMS) {
      const paths = new Set(leaves([PACKS[l], contentOf(l)]).map(([c]) => c))
      for (const c of PENDING_SKILL) expect(paths.has(c), `${l}: ${c}`).toBe(true)
    }
  })
  it('integration 0.5.0: the request exists, each new-key rule finds leaves in pt, en and the ten, and each changed FAQ exists', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../..', PENDING_INTEGRATION.pedido)), PENDING_INTEGRATION.pedido).toBe(true)
    for (const re of PENDING_INTEGRATION.novas) {
      const n = leaves([PACKS.pt, contentOf('pt')]).filter(([c]) => re.test(c)).length
      expect(n, String(re)).toBeGreaterThan(0)
      for (const l of OTHERS) expect(leaves([PACKS[l], contentOf(l)]).filter(([c]) => re.test(c)).length, `${l} ${re}`).toBe(n)
    }
    for (const [id] of PENDING_INTEGRATION.faqsChanged) expect(contentOf('pt').faq.some((f) => f.id === id), id).toBe(true)
  })
  it('integration 0.5.0: a changed FAQ that was already translated (all the pt numbers in all languages) leaves the list', () => {
    const pt = contentOf('pt')
    for (const [id, field] of PENDING_INTEGRATION.faqsChanged) {
      const i = pt.faq.findIndex((f) => f.id === id)
      const missing = NEW_ITEMS.some((l) => { const f = contentOf(l).faq[i]; return numbersOf(pt.faq[i][field]).some((n) => !`${f.respostaCurta} ${f.resposta}`.includes(n)) })
      expect(missing, `${id}.${field} is already translated: remove it from PENDING_INTEGRATION.faqsChanged`).toBe(true)
    }
  })
})

describe('12 idiomas: idioma pronto', () => {
  it('each ready language mounts the dictionary, the footer, the institutional pages and the content without throwing an error', () => {
    for (const l of READY) {
      expect(dict(l).nav.linha, l).toBeTruthy()
      expect(footerDict(l).marca.titulo, l).toBeTruthy()
      expect(instDict(l).meta.inicio.titulo, l).toBeTruthy()
      expect(contentOf(l).faq.length, l).toBeGreaterThan(40)
    }
  })
  it('the files of each language exist on disk', () => {
    for (const l of LOCALES) for (const f of [`${l}.json`, `house.${l}.json`, `join.${l}.json`, `institutional.${l}.json`, `footer.${l}.json`]) expect(fs.existsSync(path.join(DIR, f)), f).toBe(true)
  })
})
