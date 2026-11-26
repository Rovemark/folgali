// SPDX-License-Identifier: AGPL-3.0-or-later
// Mini validator for a CLOSED schema. Each validator returns null (it fits) or { caminho, mensagem }.
// Closed means: a field the schema does not know is refused, and a missing required field is too.
// Nothing here trusts a prototype, a getter or an inherited key: only own keys of a plain object.
import { isPlainObject } from './canonical.js'
import { validateText } from './text.js'

export const failure = (path, message) => ({ caminho: path, mensagem: message })

export const text = (rules) => (v, path) => {
  const m = validateText(v, rules)
  return m ? failure(path, m) : null
}

export const defaultValue = (re, description) => (v, path) =>
  typeof v === 'string' && re.test(v) ? null : failure(path, `precisa ser ${description}`)

export const literal = (expected) => (v, path) =>
  v === expected ? null : failure(path, `precisa ser exatamente ${JSON.stringify(expected)}`)

export const boolean = (v, path) => (typeof v === 'boolean' ? null : failure(path, 'precisa ser verdadeiro ou falso'))

export const one_of = (list) => (v, path) =>
  typeof v === 'string' && list.includes(v) ? null : failure(path, `precisa ser um destes: ${list.join(', ')}`)

export const integer = ({ min, max }) => (v, path) =>
  Number.isSafeInteger(v) && v >= min && v <= max ? null : failure(path, `precisa ser um inteiro entre ${min} e ${max}`)

export const or_null = (validator) => (v, path) => (v === null ? null : validator(v, path))

export const list = (validator, { min = 0, max, unique }) => (v, path) => {
  if (!Array.isArray(v)) return failure(path, 'precisa ser uma lista')
  if (v.length < min) return failure(path, `tem itens de menos (o mínimo é ${min})`)
  if (v.length > max) return failure(path, `tem itens demais (o máximo é ${max})`)
  for (let i = 0; i < v.length; i++) {
    const error = validator(v[i], `${path}[${i}]`)
    if (error) return error
  }
  if (unique && new Set(v).size !== v.length) return failure(path, 'tem itens repetidos')
  return null
}

export const optional = (validator) => ({ validator })

/** A closed object. `campos` maps a name to a validator, or to opcional(validator). */
export const closedObject = (fields) => (v, path) => {
  if (!isPlainObject(v)) return failure(path, 'precisa ser um objeto')
  const known = Object.keys(fields)
  for (const key of Object.keys(v)) {
    if (!Object.hasOwn(fields, key)) return failure(`${path}.${key}`, 'campo desconhecido')
  }
  for (const name of known) {
    const def = fields[name]
    const opc = typeof def === 'object'
    if (!Object.hasOwn(v, name)) {
      if (opc) continue
      return failure(`${path}.${name}`, 'campo obrigatório ausente')
    }
    const error = (opc ? def.validator : def)(v[name], `${path}.${name}`)
    if (error) return error
  }
  return null
}
