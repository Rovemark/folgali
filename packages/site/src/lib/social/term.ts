// The search term of the social network (section 7.5 of the specification): 2 to 100 characters, up to 8 words of up to
// 30 characters, no accent and no difference in case (the relay does that; here we only clean what the person
// typed before sending and decide what to show). `#tag` becomes a search by the tag.

export interface SearchTerm {
  /** what goes to the relay, or '' if there is nothing to search */
  termo: string
  /** when the person typed `#some-tag` */
  tag: string | null
  /** typed something, but too short (fewer than 2 characters) */
  curto: boolean
}

const withoutAccent = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function normalizeSearch(rawValue: string | null | undefined): SearchTerm {
  const clean = (rawValue ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  const isTag = clean.startsWith('#')
  // up to 100 characters; then, up to 8 words of up to 30 letters (what is not a letter or number separates)
  const words = Array.from(clean)
    .slice(0, 100)
    .join('')
    .split(/[^\p{L}\p{N}]/u)
    .filter(Boolean)
    .slice(0, 8)
    .map((p) => Array.from(p).slice(0, 30).join(''))
  const term = words.join(' ')
  // with fewer than 2 characters there is nothing to search; "short" only if the person typed something
  if (Array.from(term).length < 2) return { termo: '', tag: null, curto: clean !== '' }
  return { termo: term, tag: isTag ? withoutAccent(words[0]).replace(/[^a-z0-9]/g, '').slice(0, 24) || null : null, curto: false }
}

export interface Excerpt {
  t: string
  /** this piece matches the term */
  h: boolean
}

/**
 * Splits a text to highlight the term WITHOUT HTML: each word of the text that starts with one of the words
 * of the term (no accent, no difference in case) gets its start marked. The screen draws `<mark>`.
 */
export function highlight(text: string, term: string): Excerpt[] {
  const tokens = term
    .split(/[^\p{L}\p{N}]/u)
    .filter(Boolean)
    .map(withoutAccent)
  const output: Excerpt[] = []
  let end = 0
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = m[0]
    const norm = withoutAccent(word)
    const token = tokens.find((t) => norm.startsWith(t))
    if (!token) continue
    // how many letters of the original the token covers (an accented letter counts as one)
    let used = 0
    let covered = 0
    for (const ch of Array.from(word)) {
      if (covered >= token.length) break
      covered += withoutAccent(ch).length
      used += ch.length
    }
    const ini = m.index
    if (ini > end) output.push({ t: text.slice(end, ini), h: false })
    output.push({ t: text.slice(ini, ini + used), h: true })
    end = ini + used
  }
  if (end < text.length) output.push({ t: text.slice(end), h: false })
  // empty text: nothing was pushed, and the screen still receives a piece
  return output.length ? output : [{ t: text, h: false }]
}

/** Cuts a long text around the first matching excerpt, so the result shows why it appeared. */
export function surroundingSnippet(text: string, term: string, max = 150): string {
  const chars = Array.from(text)
  // where the first matching piece starts (in characters); with no match, the start of the text
  const parts = highlight(text, term)
  const first = parts.findIndex((p) => p.h)
  const pos = parts.slice(0, Math.max(first, 0)).reduce((n, p) => n + Array.from(p.t).length, 0)
  const ini = Math.max(0, Math.min(pos - 30, chars.length - max))
  const cutoff = chars.slice(ini, ini + max).join('')
  return `${ini > 0 ? '…' : ''}${cutoff}${ini + max < chars.length ? '…' : ''}`
}
