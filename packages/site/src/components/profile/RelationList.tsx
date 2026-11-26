'use client'

import ActionButton from '@/components/social/ActButton'
import RoverCard from '@/components/social/RoverCard'
import { useMore } from '@/components/social/useMais'
import { shortDate, fmt, type Dictionary, type Ready } from '@/lib/i18n-base'
import type { Page } from '@/lib/types'
import type { RelationItem } from '@/lib/social/types'

/** Blocked and muted of the rover itself, each with the undo button. The other side is never notified. */
export default function RelationsList({ initial, myUid, d, lang }: { initial: Page<RelationItem>; myUid: string; d: Dictionary; lang: Ready }) {
  const t = d.socAmigos
  const { itens: items, proximo: next, pendente: pending, mais: more } = useMore(initial, { lista: 'relacoes', de: myUid }, (r) => `${r.rover.uid}|${r.relacao}`)
  return (
    <>
      <ul className="pf-rows">
        {items.map((r) => (
          <li key={`${r.rover.uid}|${r.relacao}`}>
            <RoverCard
              rover={r.rover}
              lang={lang}
              sub={`${r.relacao === 'bloqueio' ? t.bloqueio : t.silencio} · ${fmt(t.desde, { data: shortDate(r.desde, lang) })}`}
              extra={
                <ActionButton ato={{ tipo: 'relacao', alvo: r.rover.uid, acao: r.relacao === 'bloqueio' ? 'desbloquear' : 'dessilenciar' }} d={d} className="btn btn-secondary btn-small">
                  {r.relacao === 'bloqueio' ? t.desbloquear : t.dessilenciar}
                </ActionButton>
              }
            />
          </li>
        ))}
      </ul>
      {next && (
        <div className="pf-more-list">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : t.verMais}
          </button>
        </div>
      )}
    </>
  )
}
