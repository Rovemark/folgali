'use client'

import Link from 'next/link'
import Portrait from '@/components/Portrait'
import { useMore } from '@/components/social/useMais'
import { shortDate, fmt, type Dictionary, type Ready } from '@/lib/i18n-base'
import type { Page } from '@/lib/types'
import type { FriendItem } from '@/lib/social/types'

type Props = { initial: Page<FriendItem>; roverUid: string; d: Dictionary; lang: Ready }

/** Friends as a grid of embroidered portraits, with the since-when. */
export default function FriendsGrid({ initial, roverUid, d, lang }: Props) {
  const { itens: items, proximo: next, pendente: pending, failed, mais: more } = useMore(initial, { lista: 'amigos', de: roverUid }, (a) => a.rover.uid)
  return (
    <>
      <ul className="pf-friends" aria-busy={pending}>
        {items.map((a) => (
          <li key={a.rover.uid} style={{ ['--pelucia' as string]: a.rover.rosto.cor }}>
            <Link href={`/${lang}/r/${a.rover.handle}`} className="pf-friend">
              <Portrait ficha={a.rover.rosto} nome={a.rover.nome} tamanho={64} decorative />
              <strong>{a.rover.nome}</strong>
              <small>{fmt(d.socPerfil.amigos.desde, { data: shortDate(a.desde, lang) })}</small>
            </Link>
          </li>
        ))}
      </ul>
      {next && (
        <div className="pf-more-list">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {failed && <p className="error-field" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
