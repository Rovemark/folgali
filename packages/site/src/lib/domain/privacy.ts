// Detector of private data and of content the protocol refuses, inside a text the rover wants to
// publish. The network never shows private data of the person, and the rover sees a lot (files,
// e-mails, conversations). If the draft carries something like that, approval locks until the person edits or refuses.
//
// Mirrors packages/protocol/src/pii.js and texto.js (a parity test checks both when the
// protocol is alongside). It is a safety net, not a guarantee: known patterns, no outside call.

export type PrivateCode = 'email' | 'segredo' | 'numero-longo' | 'caminho' | 'link-com-chave'
export type ForbiddenCode = 'html' | 'esquema-perigoso' | 'links-demais'

export interface PrivateData {
  codigo: PrivateCode
  /** Piece of the text that raised the alert, already shortened for the screen. */
  trecho: string
}

const shorten = (s: string) => (s.length > 28 ? `${s.slice(0, 25)}...` : s)

const RULES: Array<[PrivateCode, RegExp]> = [
  ['link-com-chave', /https?:\/\/[^\s]*[?&](?:token|key|apikey|api_key|secret|senha|password|auth|sig|signature)=[^\s&]+/i],
  ['email', /[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}/i],
  ['segredo', /-----BEGIN [A-Z ]*(?:KEY|CERTIFICATE)-----/],
  ['segredo', /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/],
  ['segredo', /\bAKIA[0-9A-Z]{16}\b/],
  ['segredo', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['segredo', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  ['segredo', /(?<![\w-])(?!ob_|rvr_)[A-Za-z0-9+/_-]{40,}/],
  ['numero-longo', /(?<![\d])(?:\d[ .()-]?){10,}(?!\d)/],
  ['caminho', /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s/\\]+/],
]

/** The first finding of each code, in rule order. */
export function detectPrivateData(text: string): PrivateData[] {
  const findings: PrivateData[] = []
  for (const [code, re] of RULES) {
    const m = re.exec(text)
    if (m && !findings.some((a) => a.codigo === code)) findings.push({ codigo: code, trecho: shorten(m[0]) })
  }
  return findings
}

const TAG_HTML = /<\s*[/!?a-zA-Z]|&#|&[a-zA-Z]{2,10};/
const DANGEROUS_SCHEMA = /\b(?:javascript|vbscript)\s*:/i

/** Content the relay refuses by text rule: HTML, dangerous scheme and too many links. */
export function detectForbidden(text: string, maxLinks: number): ForbiddenCode[] {
  const codes: ForbiddenCode[] = []
  if (TAG_HTML.test(text)) codes.push('html')
  if (DANGEROUS_SCHEMA.test(text)) codes.push('esquema-perigoso')
  if ((text.match(/:\/\//g) ?? []).length > maxLinks) codes.push('links-demais')
  return codes
}
