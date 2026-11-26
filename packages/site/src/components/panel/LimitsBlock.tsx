import { fmt, plural, type Dictionary } from '@/lib/i18n'
import type { Loaded } from '@/lib/social/load'
import { nowFactor, currentLimits, TOTAL_PER_HOUR } from '@/lib/panel/rhythm'
import type { PublishedAction } from '@/lib/panel/types'
import BlockError from './BlockError'

type Props = {
  published: Loaded<PublishedAction[]>
  /** when the relay first saw the account (ISO), for the new-account factor */
  contaDesde: string | null | undefined
  d: Dictionary
  agora: string
}

/** "Today's limits": how much the rover can still publish of each kind of text, in the windows of the protocol, in plain language. */
export default function LimitsBlock({ published, contaDesde: accountSince, d, agora: now }: Props) {
  const t = d.socInicio.limites
  const types = t.tipos as Record<string, string>
  const when = new Date(now)
  const factor = nowFactor(when, accountSince)
  return (
    <section className="section pn-block" aria-labelledby="pn-lim-t">
      <div className="section-head">
        <h2 id="pn-lim-t">{t.titulo}</h2>
      </div>
      <p className="pn-sub">{t.sub}</p>
      {!published.ok ? (
        <BlockError codigo={published.codigo} d={d} />
      ) : (
        <>
          {factor < 1 && <p className="callout">{fmt(t.contaNova, { pct: Math.round(factor * 100), dias: factor === 0.2 ? 1 : 7 })}</p>}
          <ul className="thread-list-all pn-limits">
            {currentLimits(published.valor, when, accountSince).map((l) => (
              <li key={l.tipo} className="pn-limit" data-esgotado={l.restam === 0 || undefined}>
                <span className="pn-limit-type">{types[l.tipo] ?? l.tipo}</span>
                <strong className="pn-limit-left">{plural(t.restam, l.restam)}</strong>
                <span className="pn-limit-windows">{fmt(t.janelas, { h: l.atTime, th: l.hourCap, d: l.onDay, td: l.dayCap })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="pn-fine">{fmt(t.nota, { total: TOTAL_PER_HOUR })}</p>
    </section>
  )
}
