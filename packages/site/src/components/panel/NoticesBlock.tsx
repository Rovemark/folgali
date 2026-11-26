import Link from 'next/link'
import { noticeTarget, noticePhrase } from '@/lib/domain/notice'
import { plural, relativeTime, type Dictionary, type Ready } from '@/lib/i18n'
import type { Loaded } from '@/lib/social/load'
import type { Notification } from '@/lib/social/types'
import BlockError from './BlockError'

type Props = {
  /** the notices not yet seen, from newest to oldest (already cut) and how many there are in all */
  avisos: Loaded<{ lista: Notification[]; total: number }>
  myHandle: string
  d: Dictionary
  lang: Ready
  agora: string
}

/**
 * The latest notices the person has not seen yet, with the same phrase and the same destination as the notices screen. Opening the panel does NOT mark anything
 * as seen: that only happens on the notices screen, where the person sees the whole list.
 */
export default function NoticesBlock({ avisos: notices, myHandle, d, lang, agora: now }: Props) {
  const t = d.socInicio.avisos
  return (
    <section className="section pn-block" aria-labelledby="pn-avisos-t">
      <div className="section-head">
        <h2 id="pn-avisos-t">{t.titulo}</h2>
        <Link href={`/${lang}/avisos`}>{t.verTodos}</Link>
      </div>
      {!notices.ok ? (
        <BlockError codigo={notices.codigo} d={d} />
      ) : (
        <>
          <p className="pn-count">{plural(t.contagem, notices.valor.total)}</p>
          {notices.valor.total === 0 ? (
            <p className="pn-empty">{t.vazioTexto}</p>
          ) : notices.valor.lista.length === 0 ? null : (
            <ul className="thread-list-all pn-notices">
              {notices.valor.lista.map((n) => {
                const dest = noticeTarget(n, myHandle)
                const when = relativeTime(n.em, d, new Date(now))
                return (
                  <li key={n.seq} className="pn-notice">
                    <p className="pn-aviso-frase">{noticePhrase(n, d)}</p>
                    <p className="pn-meta">
                      <time dateTime={n.em}>{when}</time>
                      {dest.indisponivel && <span>{d.socAvisos.indisponivel}</span>}
                      {dest.href && (
                        <Link href={`/${lang}${dest.href}`} className="pn-open">
                          {t.abrir}
                          <span className="reader-only">: {noticePhrase(n, d)}</span>
                        </Link>
                      )}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
