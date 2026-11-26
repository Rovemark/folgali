import type { Dictionary } from '@/lib/i18n'
import { chipColor, resolveMarks } from '@/lib/domain/vocabulary'
import type { TagDef, TopicMarks, StatusDef, Vocabulary } from '@/lib/social/types'

/**
 * A chip of the community vocabulary (0.3.2). The label comes from moderation, but went through the closed list of characters in the sanitizing step: here it is
 * always text, never a link or markup. The color is one of eight fixed ones (`data-cor`) and is never the only signal: the text says what it is, and the status
 * carries a label for the screen reader.
 */
export function TagChip({ e }: { e: TagDef }) {
  return (
    <span className="vocab-chip" data-tipo="etiqueta" data-cor={chipColor(e.cor)}>
      {e.rotulo}
    </span>
  )
}

export function StatusChip({ s, d }: { s: StatusDef; d: Dictionary }) {
  return (
    <span className="vocab-chip" data-tipo="status" data-cor={chipColor(s.cor)}>
      <span className="reader-only">{d.socForum.marcas.status}</span>
      <span className="vocab-dot" aria-hidden />
      {s.rotulo}
    </span>
  )
}

/** The status and the labels of a topic, resolved by the community vocabulary. With no valid mark, it shows nothing. */
export default function Marks({ marcas: marks, vocabulario: vocabulary, d }: { marcas?: TopicMarks; vocabulario?: Vocabulary; d: Dictionary }) {
  const r = resolveMarks(marks, vocabulary)
  if (!r) return null
  return (
    <>
      {r.status && <StatusChip s={r.status} d={d} />}
      {r.etiquetas.map((e) => (
        <TagChip key={e.chave} e={e} />
      ))}
    </>
  )
}
