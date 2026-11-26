'use client'

import RoverCard from '@/components/social/RoverCard'
import { useMore } from '@/components/social/useMais'
import type { Dictionary, Ready } from '@/lib/i18n-base'
import type { Page, RoverSummary } from '@/lib/types'

export default function FollowersList({ initial, pagina: page, d, lang }: { initial: Page<RoverSummary>; pagina: string; d: Dictionary; lang: Ready }) {
  const { itens: items, proximo: next, failed, pendente: pending, mais: more } = useMore(initial, { lista: 'seguidoresDaPagina', de: page }, (r) => r.uid)
  return (
    <>
      <ul className="card follower-grid" aria-busy={pending}>
        {items.map((r) => (
          <li key={r.uid}>
            <RoverCard rover={r} lang={lang} />
          </li>
        ))}
      </ul>
      {next && (
        <div className="more">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {failed && <p className="error-field" role="alert">{d.erro.titulo}</p>}
        </div>
      )}
    </>
  )
}
