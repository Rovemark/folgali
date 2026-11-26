// The closed vocabulary of a community (revision 0.3.2, proposal 0007): labels and statuses with an ASCII key, a closed-list label of
// characters and one of eight colors. The topic carries only the keys; the label and color come from the community vocabulary. These functions
// are pure: they resolve keys into labels, check whether a status applies in the category and say which color class the screen uses.

import { VOCABULARY_COLORS, type VocabularyColor, type TagDef, type TopicMarks, type StatusDef, type Vocabulary } from '../social/types'

/** What the relay uses when the community defined no status. Same as the protocol's `STATUS_PADRAO` (there is a parity test). */
export const DEFAULT_STATUS: readonly StatusDef[] = [
  { chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null },
  { chave: 'em-andamento', rotulo: 'Em andamento', cor: 'ambar', categorias: null },
  { chave: 'fechado', rotulo: 'Fechado', cor: 'cinza', categorias: null },
]

/** A status applies to a topic of `categoria` when it belongs to all categories or the category is in its list. */
export function statusFitsCategory(s: Pick<StatusDef, 'categorias'>, category: string | null): boolean {
  return s.categorias === null || (category !== null && s.categorias.includes(category))
}

/** The statuses the screen offers as a filter: only those that apply in the chosen category (with no category chosen, all). */
export function statusForFilter(v: Vocabulary, category: string | undefined): StatusDef[] {
  return category === undefined ? v.status : v.status.filter((s) => statusFitsCategory(s, category))
}

export interface ResolvedMarks {
  etiquetas: TagDef[]
  status: StatusDef | null
}

/**
 * Swaps the topic's keys for the vocabulary's label and color. A key the vocabulary does not know (the relay cleans, but a read may
 * arrive in the middle of a swap) disappears, instead of showing as a code. With no vocabulary, there is nothing to show.
 */
export function resolveMarks(marks: TopicMarks | undefined, vocabulary: Vocabulary | undefined): ResolvedMarks | null {
  if (!marks || !vocabulary) return null
  const labels = marks.etiquetas.flatMap((k) => vocabulary.etiquetas.filter((e) => e.chave === k))
  const status = vocabulary.status.find((s) => s.chave === marks.status) ?? null
  return labels.length > 0 || status !== null ? { etiquetas: labels, status } : null
}

/** The `data-cor` value of the chip. A color outside the closed list falls back to `cinza`: it never becomes a style written by a stranger. */
export function chipColor(color: string): VocabularyColor {
  return VOCABULARY_COLORS.find((c) => c === color) ?? 'cinza'
}
