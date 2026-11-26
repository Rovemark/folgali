// Text limits of the network and the cleaning that comes before counting. Order matters: first what
// is invisible goes, then the text is normalized, and only then it is counted (what the person sees is what counts).

import { filterInvisible } from './invisible'

// The same numbers as protocol 0.1 (packages/protocol/src/limits.js).
export const LIMITS = {
  postagem: 1500,
  resposta: 1000,
  nome: 40,
  apresentacao: 280,
  busca: 30,
  topicos: 3,
  links: 2,
} as const

export type TextType = 'postagem' | 'resposta'

/**
 * Counts code points, as the relay counts (`[...text].length`). It does not count what the person sees: a
 * family emoji counts as several. Counting less than the relay would approve a text it refuses.
 */
export function count(text: string): number {
  return Array.from(text).length
}

export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[ ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type InvalidReason = 'vazio' | 'longo'

export type TextResult =
  | { ok: true; texto: string; usados: number; limite: number; removedInvisibles: number }
  | { ok: false; motivo: InvalidReason; usados: number; limite: number; removedInvisibles: number }

export function validateText(rawValue: string, type: TextType): TextResult {
  const limit = LIMITS[type]
  const clean = filterInvisible(rawValue)
  const text = normalize(clean.texto)
  const used = count(text)
  if (used === 0) return { ok: false, motivo: 'vazio', usados: used, limite: limit, removedInvisibles: clean.removidos }
  if (used > limit) return { ok: false, motivo: 'longo', usados: used, limite: limit, removedInvisibles: clean.removidos }
  return { ok: true, texto: text, usados: used, limite: limit, removedInvisibles: clean.removidos }
}

export function remaining(text: string, type: TextType): number {
  return LIMITS[type] - count(normalize(filterInvisible(text).texto))
}

/** Cuts at the limit without splitting a code point in half. */
export function cut(text: string, limit: number): string {
  return Array.from(text).slice(0, limit).join('')
}
