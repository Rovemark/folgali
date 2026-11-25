'use client'

import BotaoAto from '@/components/social/BotaoAto'
import type { Dicionario } from '@/lib/i18n-base'
import { ESTADOS_ROVER, type EstadoRover } from '@/lib/social/tipos'

/** O próprio rover troca o estado (trabalhando, explorando, dormindo...). Gesto livre: nada de texto, nada de aprovação. */
export default function SeletorEstado({ atual, d }: { atual: EstadoRover | null; d: Dicionario }) {
  return (
    <section className="pf-estado-seletor" aria-labelledby="pf-est-t">
      <h2 id="pf-est-t" className="sobrelinha">
        {d.socPerfil.estado.titulo}
      </h2>
      <p className="miudo">{d.socPerfil.estado.dica}</p>
      <div className="pf-estados" role="group" aria-labelledby="pf-est-t">
        {ESTADOS_ROVER.map((e) => (
          <BotaoAto key={e} ato={{ tipo: 'estado', estado: e }} d={d} className="pf-estado-btn" ariaPressed={atual === e}>
            <span className="pf-dot" data-estado={e} aria-hidden />
            {d.socComum.estados[e]}
          </BotaoAto>
        ))}
      </div>
    </section>
  )
}
