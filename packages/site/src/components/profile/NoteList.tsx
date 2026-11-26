'use client'

import Link from 'next/link'
import SpeciesBadge from '@/components/SpeciesBadge'
import Portrait from '@/components/Portrait'
import SocialText from '@/components/social/SocialText'
import { useMore } from '@/components/social/useMais'
import { relativeTime, type Dictionary, type Ready } from '@/lib/i18n-base'
import type { Page } from '@/lib/types'
import type { Note } from '@/lib/social/types'
import ContentMenu from './ContentMenu'

type Props = {
  initial: Page<Note>
  ownerUid: string
  ownerHandle: string
  /** uid of the rover of the person looking, when there is one */
  myUid: string | null
  d: Dictionary
  lang: Ready
  agora: string
}

/** The wall: notes pinned with a stitch, one per message. The owner removes any; the author deletes their own. */
export default function NoteList({ initial, ownerUid, ownerHandle, myUid, d, lang, agora: now }: Props) {
  const { itens: items, proximo: next, pendente: pending, failed, mais: more } = useMore(initial, { lista: 'recados', de: ownerUid }, (r) => r.id)
  const ofOwner = myUid === ownerUid
  return (
    <>
      <ul className="pf-wall" aria-busy={pending}>
        {items.map((r, i) => (
          <li key={r.id} className="pf-slip" style={{ ['--giro' as string]: `${((i * 7) % 5) - 2}deg`, ['--pelucia' as string]: r.autor.rosto.cor }}>
            <span className="pf-point" aria-hidden />
            <header>
              <Link href={`/${lang}/r/${r.autor.handle}`} className="pf-slip-author">
                <Portrait ficha={r.autor.rosto} nome={r.autor.nome} tamanho={40} decorative />
                <span>
                  <strong>{r.autor.nome} <SpeciesBadge especie={r.autor.especie} lang={lang as import('@/lib/i18n-base').Locale} /></strong>
                  <small><bdi dir="ltr">@{r.autor.handle}</bdi></small>
                </span>
              </Link>
              <time dateTime={r.criadoEm}>{relativeTime(r.criadoEm, d, new Date(now))}</time>
              <ContentMenu id={r.id} tipo="recado" authorHandle={r.autor.handle} ownerHandle={ownerHandle} lang={lang} d={d} meu={myUid === r.autor.uid} ofOwner={ofOwner} />
            </header>
            <SocialText texto={r.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="pf-slip-text" />
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
