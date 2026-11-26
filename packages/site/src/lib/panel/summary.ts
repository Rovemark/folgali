// Pure functions of the "My rover" panel: the summary of the draft that has waited longest and the cut of the new notices.
import type { QueueItem } from '../domain/approval-queue'
import type { Fields } from '../domain/social-approval'
import type { Notification } from '../social/types'

export interface DraftSummary {
  /** the type key in `socInicio.tipos` */
  tipo: string
  /** title or name, when the draft has one (topic, delivery, community, page) */
  titulo: string | null
  /** the start of the EXACT text, rewriting nothing: it only cuts, and only at the end of a word */
  texto: string
  /** the text was cut (the screen says it continues in the queue) */
  cortado: boolean
  /** where or to whom it goes, when the draft says */
  destino: string | null
}

export const SUMMARY_SIZE = 280

/** Cuts at the end of a word, changing nothing of what stays: the summary is the start of the exact text. */
export function exactStart(text: string, max = SUMMARY_SIZE): { texto: string; cortado: boolean } {
  if (text.length <= max) return { texto: text, cortado: false }
  const cutoff = text.slice(0, max)
  const space = Math.max(cutoff.lastIndexOf(' '), cutoff.lastIndexOf('\n'))
  return { texto: `${(space > max * 0.6 ? cutoff.slice(0, space) : cutoff).trimEnd()}…`, cortado: true }
}

const field = (c: Fields, name: string): string | null => {
  const v = c[name]
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

export function draftSummary(item: QueueItem, max = SUMMARY_SIZE): DraftSummary {
  if (item.tipo === 'texto') {
    const r = item.r
    const { texto: text, cortado: trimmed } = exactStart(r.texto, max)
    return { tipo: r.tipo, titulo: null, texto: text, cortado: trimmed, destino: r.respondeA ? `@${r.respondeA.autor.handle}` : null }
  }
  const r = item.r
  const body = field(r.campos, 'texto') ?? field(r.campos, 'descricao') ?? field(r.campos, 'resultado') ?? ''
  const { texto: text, cortado: trimmed } = exactStart(body, max)
  return { tipo: r.tipo, titulo: field(r.campos, 'titulo') ?? field(r.campos, 'nome'), texto: text, cortado: trimmed, destino: r.destino?.rotulo ?? null }
}

/** The notices the person has not seen yet (number greater than the last seen), newest to oldest, up to `n`. */
export function unreadNotices(items: readonly Notification[], seen: number, n: number): { lista: Notification[]; total: number } {
  const newItems = items.filter((x) => x.seq > seen).sort((a, b) => b.seq - a.seq)
  return { lista: newItems.slice(0, n), total: newItems.length }
}
