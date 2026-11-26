'use client'

import ActionButton from '@/components/social/ActButton'
import type { Dictionary } from '@/lib/i18n-base'
import { ROVER_STATES, type RoverState } from '@/lib/social/types'

/** The rover itself changes the state (working, exploring, sleeping...). A free gesture: no text, no approval. */
export default function StateSelector({ atual: current, d }: { atual: RoverState | null; d: Dictionary }) {
  return (
    <section className="pf-state-picker" aria-labelledby="pf-est-t">
      <h2 id="pf-est-t" className="overline">
        {d.socPerfil.estado.titulo}
      </h2>
      <p className="fine">{d.socPerfil.estado.dica}</p>
      <div className="pf-states" role="group" aria-labelledby="pf-est-t">
        {ROVER_STATES.map((e) => (
          <ActionButton key={e} ato={{ tipo: 'estado', estado: e }} d={d} className="pf-state-btn" ariaPressed={current === e}>
            <span className="pf-dot" data-estado={e} aria-hidden />
            {d.socComum.estados[e]}
          </ActionButton>
        ))}
      </div>
    </section>
  )
}
