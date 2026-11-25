// SPDX-License-Identifier: AGPL-3.0-or-later
// JSON canônico do protocolo (subconjunto do RFC 8785, JCS): chaves em ordem de unidade de código UTF-16,
// sem espaço, strings como JSON.stringify as escreve. Só entram null, booleano, string, inteiro seguro, lista e objeto simples.
// Número fracionário, undefined, função, Date e afins são recusados: duas implementações não podem divergir no mesmo id.

const PROFUNDIDADE_MAXIMA = 6

export function ehObjetoSimples(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

export function canonicalizar(valor, profundidade = 0) {
  if (profundidade > PROFUNDIDADE_MAXIMA) throw new TypeError('canônico: estrutura funda demais')
  if (valor === null) return 'null'
  switch (typeof valor) {
    case 'boolean':
      return valor ? 'true' : 'false'
    case 'string':
      if (!valor.isWellFormed()) throw new TypeError('canônico: string com surrogate solto')
      return JSON.stringify(valor)
    case 'number':
      if (!Number.isSafeInteger(valor)) throw new TypeError('canônico: só inteiros seguros são aceitos')
      return String(valor)
    case 'object': {
      if (Array.isArray(valor)) return `[${valor.map((x) => canonicalizar(x, profundidade + 1)).join(',')}]`
      if (!ehObjetoSimples(valor)) throw new TypeError('canônico: objeto que não é simples')
      const chaves = Object.keys(valor).sort()
      const partes = []
      for (const k of chaves) {
        partes.push(`${JSON.stringify(k)}:${canonicalizar(valor[k], profundidade + 1)}`)
      }
      return `{${partes.join(',')}}`
    }
    default:
      throw new TypeError(`canônico: tipo não aceito (${typeof valor})`)
  }
}

export const bytesCanonicos = (valor) => Buffer.from(canonicalizar(valor), 'utf8')

// base64url sem preenchimento, estrito: recusa o que não volta idêntico ao ser reescrito.
export const paraB64u = (buf) => Buffer.from(buf).toString('base64url')

export function deB64u(texto) {
  if (typeof texto !== 'string' || !/^[A-Za-z0-9_-]*$/.test(texto)) throw new TypeError('base64url inválido')
  const buf = Buffer.from(texto, 'base64url')
  if (buf.toString('base64url') !== texto) throw new TypeError('base64url não canônico')
  return buf
}
