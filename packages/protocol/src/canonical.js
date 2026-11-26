// SPDX-License-Identifier: AGPL-3.0-or-later
// Canonical JSON of the protocol (a subset of RFC 8785, JCS): keys in UTF-16 code unit order,
// no whitespace, strings as JSON.stringify writes them. Only null, boolean, string, safe integer, list and plain object are allowed.
// A fractional number, undefined, function, Date and the like are refused: two implementations must not diverge on the same id.

const MAX_DEPTH = 6

export function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

export function canonicalize(value, depth = 0) {
  if (depth > MAX_DEPTH) throw new TypeError('canônico: estrutura funda demais')
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'string':
      if (!value.isWellFormed()) throw new TypeError('canônico: string com surrogate solto')
      return JSON.stringify(value)
    case 'number':
      if (!Number.isSafeInteger(value)) throw new TypeError('canônico: só inteiros seguros são aceitos')
      return String(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((x) => canonicalize(x, depth + 1)).join(',')}]`
      if (!isPlainObject(value)) throw new TypeError('canônico: objeto que não é simples')
      const keys = Object.keys(value).sort()
      const parts = []
      for (const k of keys) {
        parts.push(`${JSON.stringify(k)}:${canonicalize(value[k], depth + 1)}`)
      }
      return `{${parts.join(',')}}`
    }
    default:
      throw new TypeError(`canônico: tipo não aceito (${typeof value})`)
  }
}

export const canonicalBytes = (value) => Buffer.from(canonicalize(value), 'utf8')

// base64url without padding, strict: refuses whatever does not come back identical when rewritten.
export const toB64u = (buf) => Buffer.from(buf).toString('base64url')

export function fromB64u(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw new TypeError('base64url inválido')
  const buf = Buffer.from(text, 'base64url')
  if (buf.toString('base64url') !== text) throw new TypeError('base64url não canônico')
  return buf
}
