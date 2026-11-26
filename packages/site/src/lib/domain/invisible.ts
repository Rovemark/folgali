// Invisible content filter. Text that arrives from another rover (or that the rover proposed) must not
// carry anything the eye cannot see: instructions hidden in tag characters (U+E0000), direction
// arrows that swap the order of what is read (U+202E), zero width spaces that break search and
// reporting, filler characters that make empty text look full.
//
// Rule of thumb: if the character does not appear on screen and does not change the shape of a letter or of an emoji
// next to it, it goes. The two that change it (ZWJ between emojis, FE0F after an emoji) stay only
// in that context. What comes out of here passes the relay's protocol 0.1 text validator, which refuses
// any format character (category Cf), private use, unassigned, and stacked marks.
// Known cost: the Persian ZWNJ also goes, because the protocol refuses it.

export type InvisibleCategory = 'tag' | 'bidi' | 'largura-zero' | 'controle' | 'variacao' | 'preenchimento' | 'espaco-estranho' | 'marcas-demais'

export interface InvisibleReport {
  texto: string
  removidos: number
  byCategory: Record<InvisibleCategory, number>
  /** True when something was removed that only serves to hide or deceive (tags, direction, supplementary variation). */
  dangerous: boolean
}

const ZEROED = (): Record<InvisibleCategory, number> => ({
  tag: 0,
  bidi: 0,
  'largura-zero': 0,
  controle: 0,
  variacao: 0,
  preenchimento: 0,
  'espaco-estranho': 0,
  'marcas-demais': 0,
})

const PICTO = /\p{Extended_Pictographic}/u
const BASE_KEYCAP = /[0-9#*]/
const EMOJI_CONTINUATION = /[\ufe0e\ufe0f\u{1f3fb}-\u{1f3ff}]/u
const NO_PLACE = /[\p{Cs}\p{Co}\p{Cn}]/u
const FORMAT = /\p{Cf}/u
const BRAND = /\p{M}/u

const ZERO_WIDTH = new Set([0xad, 0x34f, 0x180e, 0x200b, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0xfeff])
const FILLER = new Set([0x115f, 0x1160, 0x2800, 0x3164, 0xffa0, 0xfff9, 0xfffa, 0xfffb, 0xfffc])
const SPACES = new Set([0xa0, 0x1680, 0x202f, 0x205f, 0x3000])

function isBidi(cp: number): boolean {
  return cp === 0x61c || cp === 0x200e || cp === 0x200f || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)
}
function isSpace(cp: number): boolean {
  return SPACES.has(cp) || (cp >= 0x2000 && cp <= 0x200a)
}
function isControl(cp: number): boolean {
  if (cp === 0x0a || cp === 0x09) return false // (the CR already became LF before the loop)
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)
}

export function filterInvisible(input: string): InvisibleReport {
  const cps = Array.from(input.replace(/\r\n?/g, '\n'), (c) => c.codePointAt(0)!)
  const byCategory = ZEROED()
  let output = ''
  let previous = '' // last KEPT character (for the FE0F context)
  let base = '' // last kept character that is neither a variation selector nor a skin tone (for the ZWJ context)
  let consecutiveMarks = 0
  const mark = (c: InvisibleCategory) => {
    byCategory[c]++
  }
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]
    const ch = String.fromCodePoint(cp)
    const next = i + 1 < cps.length ? String.fromCodePoint(cps[i + 1]) : ''
    let keep = true
    let swap: string | null = null

    if (cp >= 0xe0000 && cp <= 0xe007f) {
      keep = false
      mark('tag')
    } else if (cp >= 0xe0100 && cp <= 0xe01ef) {
      keep = false
      mark('variacao')
    } else if (isBidi(cp)) {
      keep = false
      mark('bidi')
    } else if (cp === 0x200d) {
      if (!(PICTO.test(base) && PICTO.test(next))) {
        keep = false
        mark('largura-zero')
      }
    } else if (cp === 0xfe0e || cp === 0xfe0f) {
      if (!(PICTO.test(previous) || BASE_KEYCAP.test(previous))) {
        keep = false
        mark('variacao')
      }
    } else if (cp >= 0xfe00 && cp <= 0xfe0d) {
      keep = false
      mark('variacao')
    } else if (ZERO_WIDTH.has(cp)) {
      keep = false
      mark('largura-zero')
    } else if (FILLER.has(cp)) {
      keep = false
      mark('preenchimento')
    } else if (isControl(cp) || NO_PLACE.test(ch)) {
      keep = false
      mark('controle')
    } else if (FORMAT.test(ch)) {
      keep = false
      mark('largura-zero')
    } else if (BRAND.test(ch) && consecutiveMarks >= 3) {
      keep = false
      mark('marcas-demais')
    } else if (cp === 0x09 || isSpace(cp)) {
      swap = ' '
      mark('espaco-estranho')
    } else if (cp === 0x2028 || cp === 0x2029) {
      swap = '\n'
      mark('espaco-estranho')
    }

    if (swap !== null) {
      output += swap
      previous = base = swap
      consecutiveMarks = 0
    } else if (keep) {
      output += ch
      previous = ch
      if (!EMOJI_CONTINUATION.test(ch)) base = ch
      consecutiveMarks = BRAND.test(ch) ? consecutiveMarks + 1 : 0
    }
  }
  const removed = Object.values(byCategory).reduce((a, b) => a + b, 0)
  return {
    texto: output,
    removidos: removed,
    byCategory,
    dangerous: byCategory.tag + byCategory.bidi > 0 || byCategory.variacao > 0,
  }
}
