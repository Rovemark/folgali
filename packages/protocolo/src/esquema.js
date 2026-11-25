// SPDX-License-Identifier: AGPL-3.0-or-later
// Mini validador de esquema FECHADO. Cada validador devolve null (serve) ou { caminho, mensagem }.
// Fechado quer dizer: campo que o esquema não conhece é recusado, e campo obrigatório que falta também.
// Nada aqui confia em protótipo, em getter ou em chave herdada: só em chaves próprias de objeto simples.
import { ehObjetoSimples } from './canonico.js'
import { validarTexto } from './texto.js'

export const falha = (caminho, mensagem) => ({ caminho, mensagem })

export const texto = (regras) => (v, caminho) => {
  const m = validarTexto(v, regras)
  return m ? falha(caminho, m) : null
}

export const padrao = (re, descricao) => (v, caminho) =>
  typeof v === 'string' && re.test(v) ? null : falha(caminho, `precisa ser ${descricao}`)

export const literal = (esperado) => (v, caminho) =>
  v === esperado ? null : falha(caminho, `precisa ser exatamente ${JSON.stringify(esperado)}`)

export const booleano = (v, caminho) => (typeof v === 'boolean' ? null : falha(caminho, 'precisa ser verdadeiro ou falso'))

export const um_de = (lista) => (v, caminho) =>
  typeof v === 'string' && lista.includes(v) ? null : falha(caminho, `precisa ser um destes: ${lista.join(', ')}`)

export const inteiro = ({ min, max }) => (v, caminho) =>
  Number.isSafeInteger(v) && v >= min && v <= max ? null : falha(caminho, `precisa ser um inteiro entre ${min} e ${max}`)

export const ou_nulo = (validador) => (v, caminho) => (v === null ? null : validador(v, caminho))

export const lista = (validador, { min = 0, max, unicos }) => (v, caminho) => {
  if (!Array.isArray(v)) return falha(caminho, 'precisa ser uma lista')
  if (v.length < min) return falha(caminho, `tem itens de menos (o mínimo é ${min})`)
  if (v.length > max) return falha(caminho, `tem itens demais (o máximo é ${max})`)
  for (let i = 0; i < v.length; i++) {
    const erro = validador(v[i], `${caminho}[${i}]`)
    if (erro) return erro
  }
  if (unicos && new Set(v).size !== v.length) return falha(caminho, 'tem itens repetidos')
  return null
}

export const opcional = (validador) => ({ validador })

/** Objeto fechado. `campos` mapeia nome para validador, ou para opcional(validador). */
export const objetoFechado = (campos) => (v, caminho) => {
  if (!ehObjetoSimples(v)) return falha(caminho, 'precisa ser um objeto')
  const conhecidos = Object.keys(campos)
  for (const chave of Object.keys(v)) {
    if (!Object.hasOwn(campos, chave)) return falha(`${caminho}.${chave}`, 'campo desconhecido')
  }
  for (const nome of conhecidos) {
    const def = campos[nome]
    const opc = typeof def === 'object'
    if (!Object.hasOwn(v, nome)) {
      if (opc) continue
      return falha(`${caminho}.${nome}`, 'campo obrigatório ausente')
    }
    const erro = (opc ? def.validador : def)(v[nome], `${caminho}.${nome}`)
    if (erro) return erro
  }
  return null
}
