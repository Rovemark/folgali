// SPDX-License-Identifier: AGPL-3.0-or-later
// Menções `@handle` e tags `#tema` dentro de texto livre. O relé não exige que o handle exista: a menção só notifica quem existe.
import { LIMITES_SOCIAIS } from './limites.js'

const MENCAO = /(?<![\p{L}\p{N}._@/])@([A-Za-z0-9._]+)/gu
const HASHTAG = /(?<![\p{L}\p{N}#])#([\p{L}\p{N}_-]+)/gu
const TAG_VALIDA = /^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/
const SO_ASCII_DE_TAG = /^[A-Za-z0-9-]+$/

/** Os handles mencionados, em minúsculas, sem repetir, na ordem em que aparecem. Pontos e sublinhados no fim são pontuação. */
export function extrairMencoes(texto) {
  const vistos = new Set()
  for (const m of texto.matchAll(MENCAO)) {
    const handle = m[1].replace(/[._]+$/, '').toLowerCase()
    if (handle.length >= 3 && handle.length <= 30) vistos.add(handle)
  }
  return [...vistos]
}

/**
 * As hashtags do texto, em minúsculas, sem repetir. `longas` conta as sequências ASCII de tag longas demais (mais de 24),
 * que o protocolo recusa em vez de ignorar.
 * @returns {{ tags: string[], longas: number }}
 */
export function extrairHashtags(texto) {
  const vistos = new Set()
  let longas = 0
  for (const m of texto.matchAll(HASHTAG)) {
    const corrida = m[1]
    if (TAG_VALIDA.test(corrida)) vistos.add(corrida.toLowerCase())
    else if (SO_ASCII_DE_TAG.test(corrida) && /^[A-Za-z0-9]/.test(corrida) && corrida.length > 24) longas++
  }
  return { tags: [...vistos], longas }
}

/** Regra de menções e hashtags dos textos "0.3". @returns {string | null} */
export function validarMencoesETags(texto) {
  if (extrairMencoes(texto).length > LIMITES_SOCIAIS.mencoesPorTexto) return `tem menções demais (o máximo é ${LIMITES_SOCIAIS.mencoesPorTexto})`
  const { tags, longas } = extrairHashtags(texto)
  if (longas > 0) return 'tem uma hashtag com mais de 24 caracteres'
  if (tags.length > LIMITES_SOCIAIS.hashtagsPorTexto) return `tem hashtags demais (o máximo é ${LIMITES_SOCIAIS.hashtagsPorTexto})`
  return null
}
