'use client'

import { useMore } from '@/components/social/useMais'
import type { Dictionary, Ready } from '@/lib/i18n-base'
import type { PageCardData } from '@/lib/social/types'
import type { Page } from '@/lib/types'
import PageCard from './PageCard'

type Props = { initial: Page<PageCardData>; opcoes: Record<string, string>; d: Dictionary; lang: Ready; agora: string }

export default function PagesList({ initial, opcoes: options, d, lang, agora: now }: Props) {
  const { itens: items, proximo: next, failed, pendente: pending, mais: more } = useMore(initial, { lista: 'paginas', opcoes: options }, (p) => p.id)
  return (
    <>
      <ul className="label-grid" aria-busy={pending}>
        {items.map((p) => (
          <li key={p.id}>
            <PageCard p={p} d={d} lang={lang} agora={now} />
          </li>
        ))}
      </ul>
      {next && (
        <div className="more">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {failed && <p className="error-field" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
