// SPDX-License-Identifier: AGPL-3.0-or-later
// Rules for the network's FREE TEXT. Every text a rover writes passes through here before it exists.
// Returns null when it is fine, or a sentence in Portuguese saying what is wrong (never echoes the text).
import { validateLinks } from './links.js'
import { validateMentionsAndTags } from './mentions.js'
import { detectPersonalData } from './pii.js'

// Control (except line break), a space that is not the ordinary space, an invisible format character, line and paragraph separators,
// private use, unassigned and a lone surrogate.
const ODD_CONTROL_OR_SPACE = /[\p{Cc}\s]/u
const INVISIBLE = /[\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}]/u
// Invisibles that the categories above do not catch: grapheme joiner, Hangul and Khmer fillers, blank Braille,
// variation selectors (except FE0F for emoji, handled apart), replacement character.
const INVISIBLE_EXTRA = /[͏ᅟᅠ឴឵᠋-᠏⠀ㅤﾠ�︀-︎\u{E0100}-\u{E01EF}]/u
const LOOSE_FE0F = /(?<![\p{Extended_Pictographic}#*0-9])️/u
// The only invisible that the network lets through: ZWJ joining two emojis (family, professions, composite flags).
const EMOJI_ZWJ = /(?<=\p{Extended_Pictographic}[️\u{1F3FB}-\u{1F3FF}]?)‍(?=\p{Extended_Pictographic})/gu
const EXCESS_MARKS = /\p{M}{4,}/u
const TAG_HTML = /<\s*[\/!?a-zA-Z]|&#|&[a-zA-Z]{2,10};/
const DANGEROUS_SCHEMA = /\b(?:javascript|vbscript)\s*:/i
const URL_RE = /:\/\//g

export const countChars = (s) => [...s].length

/**
 * @param {unknown} valor
 * `v3` turns on the rules for "0.3" texts: https-only links with no tracker (`urls` becomes the maximum number of links), mentions and hashtags with a ceiling,
 * and the extended personal data filter.
 * @param {{ min?: number, max: number, multilinha?: boolean, urls?: number, allowPersonalData?: boolean, v3?: boolean }} regras
 * @returns {string | null}
 */
export function validateText(value, { min = 0, max, multilinha: multiline = false, urls = 0, allowPersonalData = false, v3 = false }) {
  if (typeof value !== 'string') return 'precisa ser um texto'
  if (!value.isWellFormed()) return 'tem caractere Unicode quebrado'
  const size = countChars(value)
  if (size < min) return min === 1 ? 'não pode ficar vazio' : `precisa ter pelo menos ${min} caracteres`
  if (size > max) return `passa de ${max} caracteres`
  if (value.normalize('NFC') !== value) return 'precisa estar normalizado em Unicode NFC'
  if (value !== value.trim()) return 'não pode começar nem terminar com espaço ou quebra de linha'

  const clean = value.replace(EMOJI_ZWJ, '')
  const withoutBreak = multiline ? clean.replace(/\n/g, '') : clean
  const withoutPlainSpace = withoutBreak.replace(/ /g, '')
  if (ODD_CONTROL_OR_SPACE.test(withoutPlainSpace)) return 'tem caractere de controle ou espaço que não é o comum'
  if (INVISIBLE.test(clean) || INVISIBLE_EXTRA.test(clean) || LOOSE_FE0F.test(clean)) return 'tem caractere invisível'
  if (EXCESS_MARKS.test(clean)) return 'tem marcas de acentuação empilhadas demais'
  if (/\n{4,}/.test(value)) return 'tem quebras de linha demais em sequência'
  if (TAG_HTML.test(value)) return 'não pode ter HTML'
  if (DANGEROUS_SCHEMA.test(value)) return 'tem um endereço de esquema perigoso'
  if (v3) {
    const linkIssue = validateLinks(value, urls)
    if (linkIssue) return linkIssue
    const markProblem = validateMentionsAndTags(value)
    if (markProblem) return markProblem
  } else if ((value.match(URL_RE) ?? []).length > urls) return urls === 0 ? 'não pode ter links' : `tem links demais (o máximo é ${urls})`
  if (!allowPersonalData) {
    const found = detectPersonalData(value, { extended: v3 })
    if (found) return `parece conter ${found}, que nunca entra na rede`
  }
  return null
}
