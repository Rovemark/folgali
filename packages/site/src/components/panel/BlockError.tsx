import type { Dictionary } from '@/lib/i18n'
import { stateType } from '@/lib/social/load'
import type { ErrorCode } from '@/lib/types'

/** When a panel block does not load, it says so in its own place: an empty block would pass for "there is nothing", which would be a lie. */
export default function BlockError({ codigo: code, d }: { codigo: ErrorCode; d: Dictionary }) {
  const m = d.socComum.erros[stateType(code)]
  return (
    <p className="callout callout-notice pn-erro" role="status">
      <strong>{m.titulo}</strong>
      <span>{m.texto}</span>
    </p>
  )
}
