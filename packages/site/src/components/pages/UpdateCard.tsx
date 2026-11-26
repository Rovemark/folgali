import Link from 'next/link'
import Reactions from '@/components/Reactions'
import Portrait from '@/components/Portrait'
import Emblem from '@/components/social/Emblem'
import { IcTag } from '@/components/social/SocialIcons'
import SocialText from '@/components/social/SocialText'
import { relativeTime, type Dictionary, type Ready } from '@/lib/i18n'
import { shadeOf } from '@/lib/social/hue'
import type { Update } from '@/lib/social/types'
import UpdateMenu from './UpdateMenu'

type Props = {
  a: Update
  d: Dictionary
  lang: Ready
  agora: string
  myUid?: string | null
  /** the reader is the owner of the page (can remove someone else's update) */
  iAmPageOwner?: boolean
  /** in the home line the update shows which page it came from; on the label page, it does not need to */
  withPage?: boolean
  /** in the line, the page patch is already in the thread beside it: the header does not repeat it */
  inThread?: boolean
  i?: number
}

/** A page update: a notebook sheet with the margin stitched in the color of the page. */
export default function UpdateCard({ a, d, lang, agora: now, myUid, iAmPageOwner = false, withPage = false, inThread = false, i = 0 }: Props) {
  const t = d.socPaginas.atualizacao
  const pageName = a.pageName ?? ''
  return (
    <article className="upd" style={{ ['--h' as string]: shadeOf(pageName || a.pagina), ['--i' as string]: i }} aria-label={a.titulo ?? `${a.autor.nome}`}>
      <header className="upd-head">
        {withPage ? (
          <Link href={`/${lang}/paginas/${a.pagina}`} className="upd-page">
            {!inThread && <Emblem nome={pageName || '?'} forma="etiqueta" tamanho={40} />}
            <span className="upd-page-name">
              <span className="pill" data-tom="acao">
                <IcTag /> {t.deUmaPagina}
              </span>
              <strong>{pageName}</strong>
            </span>
          </Link>
        ) : (
          <span className="pill" data-tom="acao">
            <IcTag /> {t.atualizacao}
          </span>
        )}
        <time className="fine" dateTime={a.criadaEm}>
          {relativeTime(a.criadaEm, d, new Date(now))}
        </time>
        <UpdateMenu id={a.id} d={d} iAmAuthor={myUid === a.autor.uid} iAmPageOwner={iAmPageOwner} pageName={pageName} />
      </header>
      {a.titulo && <h3 className="upd-title">{a.titulo}</h3>}
      <SocialText texto={a.texto} lang={lang} saindo={t.saindo} className="upd-text" />
      {a.tags.length > 0 && (
        <ul className="labels" aria-label={t.tags}>
          {a.tags.map((tag) => (
            <li key={tag}>
              <Link href={`/${lang}/buscar?q=${encodeURIComponent('#' + tag)}`} className="label-tag">
                {tag}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <footer className="upd-foot">
        <Link href={`/${lang}/r/${a.autor.handle}`} className="upd-author">
          <Portrait ficha={a.autor.rosto} nome={a.autor.nome} tamanho={28} decorative />
          <span>{t.por} {a.autor.nome}</span>
        </Link>
        <span className="actions">
          <Reactions id={a.id} reacoes={a.reacoes} minha={a.minhaReacao ?? null} rotulos={{ curtir: d.post.curtir, util: d.post.util }} />
        </span>
      </footer>
    </article>
  )
}
