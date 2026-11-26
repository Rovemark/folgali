// Social network text: mentions, tags and links, and the expanded personal data filter of protocol 0.3
// (section 2 of docs/API-SOCIAL-NETWORK.md). Pure and proved by test and by mutation. The client uses it in
// two ways: BEFORE proposing (so the screen warns) and to DRAW the text (mention and tag become a link,
// a URL becomes the whole domain, nothing is fetched or previewed). The relay repeats all the rules.

export const MAX_MENTIONS = 5
export const MAX_HASHTAGS = 5
export const MAX_LINK = 200

export const SHORTENERS = ['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 't.ly', 'shorturl.at'] as const
const TRACKERS = ['fbclid', 'gclid', 'dclid', 'msclkid', 'mc_eid', 'mc_cid', 'igshid', 'yclid', '_hsenc', '_hsmi', 'ref_src', 's_cid', 'wickedid', 'vero_id']

export type LinkCode = 'link-esquema' | 'link-longo' | 'link-host' | 'link-rastreador' | 'link-invalido'

export interface LinkFinding {
  codigo: LinkCode
  /** the link, shortened for the screen */
  trecho: string
}

const shorten = (s: string) => (s.length > 40 ? `${s.slice(0, 37)}...` : s)

// ---- mentions --------------------------------------------------------------------------------------

const RE_MENTION = /(?<![\p{L}\p{N}._@/])@([A-Za-z0-9._]+)/gu

/** The mentioned handles, in lowercase, without repeats, in text order. A dot and underscore at the end are punctuation. */
export function extractMentions(text: string): string[] {
  const findings: string[] = []
  for (const m of text.matchAll(RE_MENTION)) {
    const h = m[1].replace(/[._]+$/, '').toLowerCase()
    if (h.length >= 3 && h.length <= 30 && !findings.includes(h)) findings.push(h)
  }
  return findings
}

/** How many DISTINCT mentions the text has: the relay counts handles without repeats (the same person cited 6 times is 1). */
export function countMentions(text: string): number {
  return extractMentions(text).length
}

// ---- tags --------------------------------------------------------------------------------------------

const RE_TAG = /(?<![\p{L}\p{N}#])#([\p{L}\p{N}_-]+)/gu
const VALID_TAG = /^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/
const TAG_ASCII_ONLY = /^[A-Za-z0-9-]+$/

export interface TagFinding {
  tags: string[]
  /** a sequence of more than 24 characters is a schema error */
  longa: boolean
  total: number
}

/**
 * The valid tags (lowercase, without repeats) and whether any ASCII sequence went past 24 characters (error, it is not
 * ignored). The run of letters goes as far as the protocol cuts it (letter, number, underscore and hyphen): `#abc_def`
 * and `#café` are one whole invalid sequence, not a tag `abc`. `total` counts DISTINCT tags, as the relay does.
 */
export function extractTags(text: string): TagFinding {
  const tags: string[] = []
  let long = false
  for (const m of text.matchAll(RE_TAG)) {
    const race = m[1]
    if (VALID_TAG.test(race)) {
      const t = race.toLowerCase()
      if (!tags.includes(t)) tags.push(t)
    } else if (TAG_ASCII_ONLY.test(race) && /^[A-Za-z0-9]/.test(race) && race.length > 24) long = true
  }
  return { tags, longa: long, total: tags.length }
}

// ---- links -------------------------------------------------------------------------------------------

const RE_ANY_SCHEME = /([A-Za-z][A-Za-z0-9+.-]*):\/\/[^\s]*/g
// Schemes without "//" that execute or embed content (same as the relay). "Data: hoje" is ordinary text: `data:` only counts when it looks like a MIME type.
const RE_SCHEME_WITHOUT_SLASHES = /\b(?:javascript|vbscript)\s*:|\bdata:[a-z]+\/[a-z]|\b(?:file|blob):(?:\/|https?)/i

/** Trims punctuation that does not belong to the link: "veja https://x.com/a." */
function cleanEnd(l: string): string {
  return l.replace(/[.,;:!?)\]}'"]+$/, '')
}

export function extractLinks(text: string): string[] {
  return Array.from(text.matchAll(RE_ANY_SCHEME), (m) => cleanEnd(m[0]))
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** Checks ONE link against section 2.3 (the same checks as the relay). Returns the reason or null. */
export function linkProblem(link: string): LinkCode | null {
  if (!/^https:\/\//.test(link)) return 'link-esquema'
  if (Array.from(link).length > MAX_LINK) return 'link-longo'
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return 'link-invalido'
  }
  if (u.username !== '' || u.password !== '' || u.port !== '') return 'link-host'
  const host = u.hostname.toLowerCase()
  if (IPV4.test(host) || host.includes(':') || host.startsWith('[')) return 'link-host'
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return 'link-host'
  const labels = host.split('.')
  if (labels.length < 2 || labels.some((r) => !LABEL.test(r) || r.startsWith('xn--'))) return 'link-host'
  if ((SHORTENERS as readonly string[]).includes(host.replace(/^www\./, ''))) return 'link-host'
  for (const k of u.searchParams.keys()) {
    const key = k.toLowerCase()
    if (key.startsWith('utm_') || TRACKERS.includes(key)) return 'link-rastreador'
  }
  return null
}

/** The whole domain, to show before the person leaves the network. */
export function linkDomain(link: string): string | null {
  try {
    const u = new URL(link)
    return u.protocol === 'https:' ? u.hostname : null
  } catch {
    return null
  }
}

export function parseLinks(text: string, maxLinks: number): { total: number; achados: LinkFinding[]; rest: boolean } {
  const findings: LinkFinding[] = []
  const links = extractLinks(text)
  for (const l of links) {
    const p = linkProblem(l)
    if (p) findings.push({ codigo: p, trecho: shorten(l) })
  }
  // "javascript:", "data:" and the like have no "//": the relay refuses the scheme the same way.
  const loose = RE_SCHEME_WITHOUT_SLASHES.exec(text)
  if (loose) findings.push({ codigo: 'link-esquema', trecho: shorten(loose[0]) })
  return { total: links.length, achados: findings, rest: links.length > maxLinks }
}

// ---- personal data that 0.3 adds --------------------------------------------------------------

export type PersonalCode03 = 'cep' | 'coordenadas'

const RE_CEP = /(?<![\d-])\d{5}-\d{3}(?![\d-])/
const RE_COORD = /(?<![\d.])-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}(?![\d.])/

export function detectPersonal03(text: string): { codigo: PersonalCode03; trecho: string }[] {
  const r: { codigo: PersonalCode03; trecho: string }[] = []
  const cep = RE_CEP.exec(text)
  if (cep) r.push({ codigo: 'cep', trecho: cep[0] })
  const c = RE_COORD.exec(text)
  if (c) r.push({ codigo: 'coordenadas', trecho: shorten(c[0]) })
  return r
}

// ---- for drawing -----------------------------------------------------------------------------------

export type Part = { t: 'texto'; v: string } | { t: 'mencao'; v: string } | { t: 'tag'; v: string } | { t: 'link'; v: string; dominio: string | null; seguro: boolean }

/**
 * Splits the text for the screen to draw. Nothing becomes HTML: the screen receives parts and chooses the element. A
 * link is only "safe" (clickable) if it passes every rule; the rest shows as plain text.
 */
export function split(text: string): Part[] {
  const marks: { ini: number; fim: number; part: Part }[] = []
  for (const m of text.matchAll(RE_ANY_SCHEME)) {
    const l = cleanEnd(m[0])
    marks.push({ ini: m.index, fim: m.index + l.length, part: { t: 'link', v: l, dominio: linkDomain(l), seguro: linkProblem(l) === null } })
  }
  for (const m of text.matchAll(RE_MENTION)) {
    const h = m[1].replace(/[._]+$/, '')
    if (h.length >= 3 && h.length <= 30) marks.push({ ini: m.index, fim: m.index + 1 + h.length, part: { t: 'mencao', v: h.toLowerCase() } })
  }
  for (const m of text.matchAll(RE_TAG)) {
    const c = m[1]
    if (VALID_TAG.test(c)) marks.push({ ini: m.index, fim: m.index + 1 + c.length, part: { t: 'tag', v: c.toLowerCase() } })
  }
  // links go in first and a mention or tag that falls inside a link (`/#fio`, `?a=(@pipa)`) is skipped because of the overlap
  marks.sort((a, b) => a.ini - b.ini)
  const parts: Part[] = []
  let pos = 0
  for (const x of marks) {
    if (x.ini < pos) continue
    if (x.ini > pos) parts.push({ t: 'texto', v: text.slice(pos, x.ini) })
    parts.push(x.part)
    pos = x.fim
  }
  if (pos < text.length) parts.push({ t: 'texto', v: text.slice(pos) })
  return parts
}
