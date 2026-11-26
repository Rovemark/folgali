// Revision 0.11.0, part 2 (proposal 0013): editing what was published. The relay keeps the original object untouched and, when the
// publication was edited, puts next to it `edicao: { id, em, versoes, titulo, texto, tags, adulto }`: what it says NOW. This module is
// the one place that reads that field (every saneador calls it) and writes the body of a new `edicao` (the editor calls it). Light on
// purpose: the editor runs in the browser.
//
// The field is additive: a relay before 0.11.0 never sends it, and a crooked value must not take the page down, so the reader never
// throws. Whatever is crooked is simply "not edited" and the screen shows the original, as before.
import { filterInvisible } from './invisible'
import { isObjectId, TOPIC_RE } from './ids'
import { count, cut, normalize } from './limits'

/** The four things that can be edited, as the protocol names them (ALVOS_DE_EDICAO). */
export type EditTarget = 'postagem' | 'resposta' | 'topico' | 'resposta-forum'
export const EDIT_TARGETS: readonly EditTarget[] = ['postagem', 'resposta', 'topico', 'resposta-forum']

/** The mark "edited" of an item: the id and instant of the last edit, and how many versions there are (the original counts). */
export interface EditMark {
  id: string
  /** ISO 8601 */
  em: string
  versoes: number
}

/** What one version says, in the same four fields whatever the type (conteudoDaVersao of the protocol). */
export interface EditContent {
  titulo: string | null
  texto: string
  tags: string[]
  adulto: boolean
}

/** The limits of each target when edited: the same it had when published (protocol, conferirEdicao). */
export const EDIT_LIMITS: Record<EditTarget, { titulo: { min: number; max: number; required: boolean } | null; texto: number; tags: number }> = {
  postagem: { titulo: { min: 1, max: 100, required: false }, texto: 1500, tags: 3 },
  resposta: { titulo: null, texto: 1000, tags: 0 },
  topico: { titulo: { min: 3, max: 120, required: true }, texto: 2000, tags: 5 },
  'resposta-forum': { titulo: null, texto: 1500, tags: 0 },
}

/** How many edits of the same publication fit in one hour, and versions in all (LIMITES_DE_EDICAO of the protocol). */
export const EDITS_PER_HOUR = 5
export const VERSIONS_PER_TARGET = 50

const clean = (s: string, max: number, multi: boolean) => {
  const t = normalize(filterInvisible(s).texto)
  return cut(multi ? t : t.replace(/\s*\n\s*/g, ' ').replace(/[<>]/g, ''), max)
}

/** An instant of the protocol (seconds since 1970) or an ISO text, between 2023 and 2100, as ISO; null when it is not one. */
export function instantOrNull(x: unknown): string | null {
  let ms: number
  if (typeof x === 'number' && Number.isFinite(x)) ms = x > 1e11 ? x : x * 1000
  else if (typeof x === 'string' && Number.isFinite(Date.parse(x))) ms = Date.parse(x)
  else return null
  if (ms < Date.UTC(2023, 0, 1) || ms >= Date.UTC(2100, 0, 1)) return null
  return new Date(ms).toISOString()
}

/** The content of one version, cleaned and cut to the limits of the target; null when the shape is wrong. Never throws. */
export function readContent(x: unknown, target: EditTarget): EditContent | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const lim = EDIT_LIMITS[target]
  if (typeof o.texto !== 'string') return null
  const text = clean(o.texto, lim.texto, true)
  if (!text) return null
  const title = lim.titulo && typeof o.titulo === 'string' ? clean(o.titulo, lim.titulo.max, false) || null : null
  const tags = lim.tags > 0 && Array.isArray(o.tags) ? [...new Set(o.tags.filter((t): t is string => typeof t === 'string' && TOPIC_RE.test(t)))].slice(0, lim.tags) : []
  return { titulo: title, texto: text, tags, adulto: target === 'postagem' && o.adulto === true }
}

/**
 * The `edicao` field of an item: the mark and what the publication says now. Null when absent or crooked (then the screen shows the
 * original). Never throws.
 */
export function readEdit(x: unknown, target: EditTarget): { mark: EditMark; content: EditContent } | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const at = instantOrNull(o.em)
  const content = readContent(o, target)
  if (typeof o.id !== 'string' || !isObjectId(o.id) || at === null || content === null) return null
  const versions = typeof o.versoes === 'number' && Number.isInteger(o.versoes) && o.versoes >= 2 && o.versoes <= 1000 ? o.versoes : 2
  return { mark: { id: o.id, em: at, versoes: versions }, content }
}

/** Two contents say the same thing (the relay refuses such an edit with `ja_existe`). */
export function sameContent(a: EditContent, b: EditContent): boolean {
  return a.titulo === b.titulo && a.texto === b.texto && a.adulto === b.adulto && a.tags.length === b.tags.length && a.tags.every((t, i) => t === b.tags[i])
}

/** Why a draft cannot be saved yet, or null. The relay checks again. */
export function draftProblem(target: EditTarget, title: string, text: string): 'empty' | 'long' | 'title' | null {
  const lim = EDIT_LIMITS[target]
  const t = text.trim()
  if (!t) return 'empty'
  if (count(t) > lim.texto) return 'long'
  if (lim.titulo) {
    const n = count(title.trim())
    if ((lim.titulo.required && n === 0) || (n > 0 && n < lim.titulo.min) || n > lim.titulo.max) return 'title'
  }
  return null
}

/**
 * The body of an `edicao`: always the WHOLE new content (never a patch). A reply and a forum reply have no title and no tags; only a
 * post carries the 18+ mark, and only when it is on.
 */
export function editBody(editTarget: string, target: EditTarget, c: EditContent): Record<string, unknown> {
  const lim = EDIT_LIMITS[target]
  const title = lim.titulo ? c.titulo?.trim() || null : null
  return {
    alvo: editTarget,
    titulo: title,
    texto: c.texto.trim(),
    tags: lim.tags > 0 ? c.tags.slice(0, lim.tags) : [],
    ...(target === 'postagem' && c.adulto ? { adulto: true } : {}),
  }
}
