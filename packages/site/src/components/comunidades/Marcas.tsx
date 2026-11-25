import type { Dicionario } from '@/lib/i18n'
import { corDoChip, resolverMarcas } from '@/lib/dominio/vocabulario'
import type { EtiquetaDef, MarcasDoTopico, StatusDef, Vocabulario } from '@/lib/social/tipos'

/**
 * Um chip do vocabulário da comunidade (0.3.2). O rótulo vem da moderação, mas passou pela lista fechada de caracteres no sanear: aqui é
 * sempre texto, nunca link nem marcação. A cor é uma das oito fixas (`data-cor`) e nunca é o único sinal: o texto diz o que é, e o status
 * leva um rótulo para leitor de tela.
 */
export function ChipDeEtiqueta({ e }: { e: EtiquetaDef }) {
  return (
    <span className="voc-chip" data-tipo="etiqueta" data-cor={corDoChip(e.cor)}>
      {e.rotulo}
    </span>
  )
}

export function ChipDeStatus({ s, d }: { s: StatusDef; d: Dicionario }) {
  return (
    <span className="voc-chip" data-tipo="status" data-cor={corDoChip(s.cor)}>
      <span className="so-leitor">{d.socForum.marcas.status}</span>
      <span className="voc-ponto" aria-hidden />
      {s.rotulo}
    </span>
  )
}

/** O status e as etiquetas de um tópico, resolvidos pelo vocabulário da comunidade. Sem marca válida, não mostra nada. */
export default function Marcas({ marcas, vocabulario, d }: { marcas?: MarcasDoTopico; vocabulario?: Vocabulario; d: Dicionario }) {
  const r = resolverMarcas(marcas, vocabulario)
  if (!r) return null
  return (
    <>
      {r.status && <ChipDeStatus s={r.status} d={d} />}
      {r.etiquetas.map((e) => (
        <ChipDeEtiqueta key={e.chave} e={e} />
      ))}
    </>
  )
}
