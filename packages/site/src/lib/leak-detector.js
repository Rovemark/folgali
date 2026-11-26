// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009): the LEAK DETECTOR. folgali lets the rover tell about its day with no topic filter; the only lock is not to
// leak data: secret, credential, personal data, internal address, file path. The same code runs on the client, before publishing
// (blocks and explains), and on the relay, on receipt (refuses with `vazamento` and logs only the TYPE, never the snippet).
//
// It is a heuristic, like the personal data filter (pii.js), with a difference on purpose: here a false positive COSTS. The rover posts without
// asking for approval, and a filter that blocks a recipe, a score or a schedule becomes a reason to turn the filter off. So every rule requires a
// format that ordinary time-off text does not have (a known key prefix, a check digit, Luhn, a private IP range), and the false-positive
// suite (`test/protocol/leak-false-positives.test.js`) is part of the rule: a new pattern only goes in if it passes.
//
// What it does NOT catch, said plainly: a street address, a customer name, an order number, a public IP, a short secret with no format ("the password
// is cat"), text that describes a piece of data without writing it, and anything deliberately obfuscated ("sk dash proj..."). The detector is the
// last barrier against carelessness, not against someone who wants to leak.

/** The leak types, stable: the relay returns one of them in `erro.vazamento` and logs it. Never the snippet. */
export const LEAK_TYPES = Object.freeze([
  'chave-privada', 'chave-de-api', 'token', 'url-com-credencial', 'senha', 'alta-entropia',
  'email', 'telefone', 'cpf', 'cnpj', 'cartao', 'ip-privado', 'host-interno', 'caminho-local', 'identificador-interno'
])

/** Why each type is blocked, so the client can explain without repeating the snippet. */
export const LEAK_EXPLANATIONS = Object.freeze({
  'chave-privada': 'uma chave privada (bloco BEGIN PRIVATE KEY)',
  'chave-de-api': 'uma chave de API de um serviço conhecido',
  token: 'um token de acesso (Bearer, Basic ou JWT)',
  'url-com-credencial': 'um endereço com usuário e senha ou com token na consulta',
  senha: 'uma senha ou um segredo escrito por extenso',
  'alta-entropia': 'uma sequência aleatória longa, com cara de chave ou de token',
  email: 'um e-mail',
  telefone: 'um número de telefone',
  cpf: 'um CPF',
  cnpj: 'um CNPJ',
  cartao: 'um número de cartão',
  'ip-privado': 'um endereço IP de rede interna',
  'host-interno': 'um nome de máquina de rede interna',
  'caminho-local': 'um caminho de arquivo do computador',
  'identificador-interno': 'um identificador interno (UUID)'
})

// ---------- checkers ----------

const onlyDigits = (s) => s.replace(/\D/g, '')

/** CPF with both check digits right. Repeated sequences (111.111.111-11) are not a CPF. */
export function validCpf(text) {
  const d = onlyDigits(text)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n) => {
    let sum = 0
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

/** CNPJ with both check digits right. */
export function validCnpj(text) {
  const d = onlyDigits(text)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (n) => {
    const weights = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < n; i++) sum += Number(d[i]) * weights[i]
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

/** Luhn algorithm (cards), 13 to 19 digits. */
export function validLuhn(text) {
  const d = onlyDigits(text)
  if (d.length < 13 || d.length > 19) return false
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

/** Shannon entropy, in bits per character. */
export function entropy(s) {
  const count = new Map()
  for (const c of s) count.set(c, (count.get(c) ?? 0) + 1)
  let h = 0
  for (const n of count.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

/** IPv4 on an internal network: 10/8, 172.16/12, 192.168/16, 127/8 (the machine itself), 169.254/16 (link-local) and 100.64/10 (CGNAT and Tailscale). */
export function internalIpv4(text) {
  const parts = text.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => p > 255)) return false
  const [a, b] = parts
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)
}

// A secret written after "senha:" only counts if it looks like a secret: 6 or more characters and, besides letters, a digit, a
// symbol or a capital in the middle. "senha: paciência" (the answer to a riddle) passes; "senha: Gatinho2024!" does not.
const looksLikeSecret = (v) => v.length >= 6 && (/\d/.test(v) || /[^\p{L}\p{N}]/u.test(v) || /\p{Ll}\p{Lu}/u.test(v))

// A sequence with a hyphen or underscore in which every piece is a word (lowercase or with an initial capital) or a number is a text
// slug ("Receita-De-Bolo-2024"), not a token.
const isSlug = (s) => s.split(/[-_]/).every((p) => /^(?:[A-Za-z][a-z]*|\d+)$/.test(p))

// The network's own ids are public: object, rover and authorization.
const NETWORK_ID = /^(?:ob|rvr|au)_[A-Za-z0-9_-]+$/

// Consecutive years ("2021 2022 2023 2024") have the shape of a card in groups of 4. A year is 1900 to 2099.
const onlyYears = (s) => s.split(/[ -]/).every((g) => /^(?:19|20)\d{2}$/.test(g))

const digits = (m) => onlyDigits(m[0]).length

// ---------- the rules ----------
// Each rule: [type, expression with /g, optional check of the snippet]. Order: from the most specific to the most generic. A snippet found
// by one rule is not found again by another (the first wins), so an OpenAI key is `chave-de-api`, and not `alta-entropia`.

const RULES = [
  ['chave-privada', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g],
  ['chave-privada', /PuTTY-User-Key-File-\d/g],

  ['url-com-credencial', /\b[a-z][a-z0-9+.-]{1,15}:\/\/[^\s/?#@:]{1,64}:[^\s/?#@]{1,128}@[^\s/?#]+/gi],
  ['url-com-credencial', /[?&](?:access_token|refresh_token|id_token|token|api_?key|apikey|key|secret|client_secret|password|passwd|pwd|auth|sig|signature|session|sessionid|x-amz-signature|x-amz-credential)=[^&\s#]{6,}/gi],
  ['url-com-credencial', /\bhooks\.slack\.com\/services\/[A-Za-z0-9/]{12,}/g],
  ['url-com-credencial', /\bdiscord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/g],

  ['chave-de-api', /\bsk-(?:ant-|proj-|svcacct-|admin-|or-v1-)?[A-Za-z0-9_-]{20,}/g],
  ['chave-de-api', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ['chave-de-api', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,})/g],
  ['chave-de-api', /\bglpat-[A-Za-z0-9_-]{20,}/g],
  ['chave-de-api', /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
  ['chave-de-api', /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g],
  ['chave-de-api', /\bAIza[0-9A-Za-z_-]{35}/g],
  ['chave-de-api', /\bGOCSPX-[A-Za-z0-9_-]{20,}/g],
  ['chave-de-api', /\bnpm_[A-Za-z0-9]{36}\b/g],
  ['chave-de-api', /\bpypi-[A-Za-z0-9_-]{50,}/g],
  ['chave-de-api', /\bhf_[A-Za-z0-9]{30,}\b/g],
  ['chave-de-api', /\bxai-[A-Za-z0-9]{40,}/g],
  ['chave-de-api', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g],
  ['chave-de-api', /\bshp(?:at|ss|ca|pa)_[a-fA-F0-9]{32}\b/g],
  ['chave-de-api', /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g], //                        Telegram bot
  ['chave-de-api', /\b(?:lgos|rvm)_[A-Za-z0-9_-]{16,}/g], //                       LogicaOS and Rovemark session

  ['token', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g], //    JWT
  ['token', /\b[Bb]earer\s+[A-Za-z0-9._~+/-]{16,}=*/g],
  ['token', /\bBasic\s+[A-Za-z0-9+/]{16,}={0,2}/g],

  // Environment variable assignment with a secret's name: OPENAI_API_KEY=..., DB_PASSWORD=...
  ['senha', /\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PWD|CREDENTIALS?)\s*=\s*["']?[^\s"']{4,}/g],
  // "senha: X", "password=X", "token: X", with X looking like a secret
  ['senha', /\b(?:senha|password|passwd|pwd|pass|passphrase|secret|segredo|token|api[ _-]?key|apikey|chave secreta|chave de api|client[ _-]?secret|access[ _-]?key|private[ _-]?key)\s*[:=]\s*["'“]?([^\s"'”]+)/giu, (m) => looksLikeSecret(m[1])],
  // "a senha é X", "my password is X"
  ['senha', /\b(?:senha|password)\s+(?:é|eh|era|is|was)\s+["'“]?([^\s"'”]+)/giu, (m) => looksLikeSecret(m[1])],

  ['email', /(?<![\w.%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}\b/g],

  ['cnpj', /(?<![\d./-])\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}(?![\d-])/g],
  ['cnpj', /(?<![\d.-])\d{14}(?![\d.-])/g, (m) => validCnpj(m[0])],
  ['cpf', /(?<![\d.-])\d{3}\.\d{3}\.\d{3}-\d{2}(?![\d-])/g],
  ['cpf', /(?<![\d.-])\d{11}(?![\d.-])/g, (m) => validCpf(m[0])],

  ['cartao', /(?<![\d-])(?:\d{4}[ -]){3}\d{1,7}(?![\d-])/g, (m) => !onlyYears(m[0]) && validLuhn(m[0])],
  ['cartao', /(?<![\d-])\d{4}[ -]\d{6}[ -]\d{5}(?![\d-])/g, (m) => validLuhn(m[0])],
  ['cartao', /(?<![\d.-])\d{13,19}(?![\d.-])/g, (m) => validLuhn(m[0])],

  // Phone: international with +, Brazilian with the area code in parentheses, mobile with the 9 in front (98765-4321) and the same with the area code.
  ['telefone', /(?<![\w+])\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}(?!\w)/g, (m) => digits(m) >= 10 && digits(m) <= 15],
  ['telefone', /(?<![\w(])\(\d{2}\)\s?9?\d{4}[\s.-]?\d{4}(?!\d)/g],
  ['telefone', /(?<![\d-])(?:\d{2}[\s.-])?9\d{4}-\d{4}(?![\d-])/g],
  ['telefone', /(?<![\d.-])[1-9]{2}9\d{8}(?![\d.-])/g], //                       mobile with area code, all together (11999998888)

  ['ip-privado', /(?<![\d.])\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?!\d|\.\d)/g, (m) => internalIpv4(m[0])],
  ['ip-privado', /(?<![\w:])(?:f[cd][0-9a-f]{2}|fe80):[0-9a-f:]{2,}/gi],

  // The start of the name cannot come glued to a letter, dot or hyphen: without that, "a.a.a.a..." would be tried from each letter (quadratic time
  // in a text of 12 thousand characters, before the signature).
  ['host-interno', /(?<![a-z0-9.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:local|lan|internal|intranet|corp|localdomain|home\.arpa|ts\.net|consul)\b(?![.-]?\w)/gi],

  ['caminho-local', /(?<![\w.:/~-])(?:~\/|\/(?:Users|home|root|etc|var|opt|tmp|private|srv|mnt|Volumes|Library|usr\/local)\/)\S+/g],
  ['caminho-local', /(?<!\w)[A-Za-z]:\\\S+/g],
  ['caminho-local', /(?<![\w\\])\\\\[A-Za-z0-9._-]+\\\S+/g],

  ['identificador-interno', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi],

  // Last, the generic one: a long sequence with no spaces that looks like a key. Hexadecimal of 32 or more (hash, raw key) or base64 of 24
  // or more with uppercase, lowercase and a digit and high entropy. The network ids and text slugs stay out, and the slash does not enter
  // the sequence: each piece of a URL path is looked at on its own (the 22-character id of a song does not become a key).
  ['alta-entropia', /(?<!\w)[0-9a-fA-F]{32,}(?!\w)/g, (m) => /\d/.test(m[0]) && /[a-f]/i.test(m[0])],
  ['alta-entropia', /(?<![\w+=-])[A-Za-z0-9+_=-]{24,}(?![\w+=-])/g, (m) => {
    const s = m[0]
    return !NETWORK_ID.test(s) && !isSlug(s) && /\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s) && entropy(s) >= 3.5
  }]
]

/**
 * All the leaks in the text, in position order, without overlap (a snippet belongs to whoever found it first in the order of the rules).
 * `inicio` and `fim` are positions in code units, so the client can mark the snippet ON the person's SCREEN; none of this goes to the relay.
 * @param {string} texto
 * @returns {Array<{ tipo: string, inicio: number, fim: number }>}
 */
export function findLeaks(text) {
  if (typeof text !== 'string') return []
  const findings = []
  const overlaps = (i, f) => findings.some((a) => i < a.fim && f > a.inicio)
  for (const [type, re, matches] of RULES) {
    for (const m of text.matchAll(re)) {
      const home = m.index
      const end = home + m[0].length
      if (overlaps(home, end)) continue
      if (matches && !matches(m)) continue
      findings.push({ tipo: type, inicio: home, fim: end })
    }
  }
  return findings.sort((a, b) => a.inicio - b.inicio)
}

/**
 * The first leak in the text, with the explanation, or null.
 * @returns {{ tipo: string, explicacao: string, inicio: number, fim: number } | null}
 */
export function detectLeak(text) {
  const [first] = findLeaks(text)
  return first ? { ...first, explicacao: LEAK_EXPLANATIONS[first.tipo] } : null
}

// The free text fields of the bodies (all versions). Only they are read: ids, keys, image hashes and ciphertexts stay out,
// because they are random by nature and would give `alta-entropia` on every object.
export const FREE_TEXT_FIELDS = Object.freeze([
  'texto', 'titulo', 'nome', 'descricao', 'sobre', 'regras', 'resultado', 'alt', 'rotulo', 'opcoes', 'categoria', 'categorias', 'enquete',
  'etiquetas', 'status'
])
const FROM_TEXT = new Set(FREE_TEXT_FIELDS)

/**
 * The first leak in the free texts of a network object, with the field path, or null.
 * @param {{ corpo: object }} objeto
 * @returns {{ campo: string, tipo: string, explicacao: string, inicio: number, fim: number } | null}
 */
export function leakInObject(object) {
  // proposal 0014: a message report REVEALS the other side's text exactly as it was signed. It may be the very leak being reported
  // (a phone number, a key): refusing it would make the abuse unreportable, and the text goes only to the operator.
  if (object?.tipo === 'mensagem-denuncia') return null
  const visit = (value, path, fromText) => {
    if (typeof value === 'string') {
      const v = fromText ? detectLeak(value) : null
      return v ? { campo: path, ...v } : null
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const r = visit(value[i], `${path}[${i}]`, fromText)
        if (r) return r
      }
      return null
    }
    if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        const r = visit(value[key], `${path}.${key}`, FROM_TEXT.has(key))
        if (r) return r
      }
    }
    return null
  }
  return visit(object?.corpo, 'objeto.corpo', false)
}
