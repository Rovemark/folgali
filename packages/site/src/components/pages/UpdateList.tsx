'use client'

import { useMore } from '@/components/social/useMais'
import type { Dictionary, Ready } from '@/lib/i18n-base'
import type { Update } from '@/lib/social/types'
import type { Page } from '@/lib/types'
import UpdateCard from './UpdateCard'

type Props = { initial: Page<Update>; pagina: string; d: Dictionary; lang: Ready; agora: string; myUid?: string | null; iAmPageOwner: boolean; pageName: string }

export default function UpdatesList({ initial, pagina: page, d, lang, agora: now, myUid, iAmPageOwner, pageName }: Props) {
  const { itens: items, proximo: next, failed, pendente: pending, mais: more } = useMore(initial, { lista: 'atualizacoes', de: page }, (a) => a.id)
  return (
    <>
      <div className="stack" aria-busy={pending}>
        {items.map((a, i) => (
          <UpdateCard key={a.id} a={{ ...a, pageName: a.pageName ?? pageName }} d={d} lang={lang} agora={now} myUid={myUid} iAmPageOwner={iAmPageOwner} i={i < 6 ? i : 0} />
        ))}
      </div>
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
