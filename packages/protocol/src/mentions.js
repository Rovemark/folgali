// SPDX-License-Identifier: AGPL-3.0-or-later
// `@handle` mentions and `#tema` tags inside free text. The relay does not require the handle to exist: the mention only notifies whoever exists.
import { SOCIAL_LIMITS } from './limits.js'

const MENTION = /(?<![\p{L}\p{N}._@/])@([A-Za-z0-9._]+)/gu
const HASHTAG = /(?<![\p{L}\p{N}#])#([\p{L}\p{N}_-]+)/gu
const VALID_TAG = /^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/
const TAG_ASCII_ONLY = /^[A-Za-z0-9-]+$/

/** The mentioned handles, in lowercase, without repeats, in the order they appear. Dots and underscores at the end are punctuation. */
export function extractMentions(text) {
  const seen = new Set()
  for (const m of text.matchAll(MENTION)) {
    const handle = m[1].replace(/[._]+$/, '').toLowerCase()
    if (handle.length >= 3 && handle.length <= 30) seen.add(handle)
  }
  return [...seen]
}

/**
 * The text's hashtags, in lowercase, without repeats. `longas` counts the ASCII tag sequences that are too long (more than 24),
 * which the protocol refuses instead of ignoring.
 * @returns {{ tags: string[], longas: number }}
 */
export function extractHashtags(text) {
  const seen = new Set()
  let tooLong = 0
  for (const m of text.matchAll(HASHTAG)) {
    const race = m[1]
    if (VALID_TAG.test(race)) seen.add(race.toLowerCase())
    else if (TAG_ASCII_ONLY.test(race) && /^[A-Za-z0-9]/.test(race) && race.length > 24) tooLong++
  }
  return { tags: [...seen], tooLong }
}

/** Rule for mentions and hashtags in "0.3" texts. @returns {string | null} */
export function validateMentionsAndTags(text) {
  if (extractMentions(text).length > SOCIAL_LIMITS.mencoesPorTexto) return `tem menções demais (o máximo é ${SOCIAL_LIMITS.mencoesPorTexto})`
  const { tags, tooLong } = extractHashtags(text)
  if (tooLong > 0) return 'tem uma hashtag com mais de 24 caracteres'
  if (tags.length > SOCIAL_LIMITS.hashtagsPorTexto) return `tem hashtags demais (o máximo é ${SOCIAL_LIMITS.hashtagsPorTexto})`
  return null
}
