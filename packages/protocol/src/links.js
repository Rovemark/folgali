// SPDX-License-Identifier: AGPL-3.0-or-later
// Links inside free text ("0.3" objects). The network does NOT fetch any link: the relay makes no outbound request and the client must not
// preview. Here we only decide what may appear written: https only, a real domain, no tracker.
import { SOCIAL_LIMITS } from './limits.js'

const ANY_SCHEMA = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]*/g
// Schemes without "//" that run or embed content. "Data: hoje" is ordinary text, so `data:` only counts when it looks like a MIME type.
const DANGEROUS_SCHEMA_WITHOUT_SLASHES = /\b(?:javascript|vbscript)\s*:|\bdata:[a-z]+\/[a-z]|\b(?:file|blob):(?:\/|https?)/i
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/

const SHORTENERS = new Set([
  'bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 't.ly', 'shorturl.at'
])
const TRACKING_PARAMETERS = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_eid', 'mc_cid', 'igshid', 'yclid', '_hsenc', '_hsmi', 'ref_src', 's_cid', 'wickedid', 'vero_id'
])
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** Returns the sentence about the problem with ONE link, or null if it is fine. `bruto` is the link as written in the text. */
export function linkProblem(rawValue) {
  const schema = rawValue.slice(0, rawValue.indexOf(':')).toLowerCase()
  if (schema !== 'https') return 'só aceita links https'
  const link = rawValue.replace(TRAILING_PUNCTUATION, '')
  if ([...link].length > SOCIAL_LIMITS.linkChars) return `tem um link de mais de ${SOCIAL_LIMITS.linkChars} caracteres`
  let u
  try { u = new URL(link) } catch { return 'tem um link malformado' }
  if (u.username !== '' || u.password !== '') return 'tem um link com usuário e senha'
  if (u.port !== '') return 'tem um link com porta'
  const host = u.hostname
  if (IPV4.test(host) || host.includes(':') || host.startsWith('[')) return 'tem um link para endereço IP'
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return 'tem um link para rede local'
  const labels = host.split('.')
  if (labels.length < 2 || labels.some((r) => !LABEL.test(r))) return 'tem um link com domínio inválido'
  if (labels.some((r) => r.startsWith('xn--'))) return 'tem um link com domínio internacionalizado (xn--), que a rede não aceita'
  if (SHORTENERS.has(host.replace(/^www\./, ''))) return 'tem um link de encurtador'
  for (const key of u.searchParams.keys()) {
    const k = key.toLowerCase()
    if (k.startsWith('utm_') || TRACKING_PARAMETERS.has(k)) return 'tem um link com parâmetro de rastreamento'
  }
  return null
}

/** The links in the text, as written (any `scheme://...`). */
export const linksOf = (text) => text.match(ANY_SCHEMA) ?? []

/**
 * Rule for links in "0.3" texts: https only, no tracker, no dangerous scheme, at most `max`.
 * @returns {string | null}
 */
export function validateLinks(text, max) {
  if (DANGEROUS_SCHEMA_WITHOUT_SLASHES.test(text)) return 'tem um endereço de esquema perigoso'
  const links = linksOf(text)
  if (links.length > max) return max === 0 ? 'não pode ter links' : `tem links demais (o máximo é ${max})`
  for (const l of links) {
    const problem = linkProblem(l)
    if (problem) return problem
  }
  return null
}
