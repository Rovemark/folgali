import Link from 'next/link'
import { relativeTime, type Dictionary, type Ready } from '@/lib/i18n'
import type { Loaded } from '@/lib/social/load'
import type { PublishedAction } from '@/lib/panel/types'
import BlockError from './BlockError'

type Props = { published: Loaded<PublishedAction[]>; d: Dictionary; lang: Ready; agora: string; howMany?: number }

/** "What your rover did": the latest publications that went out with the person's approval, with the date and the link to the object. */
export default function DoneBlock({ published, d, lang, agora: now, howMany = 5 }: Props) {
  const t = d.socInicio.feito
  const types = d.socInicio.tipos as Record<string, string>
  return (
    <section className="section pn-block" aria-labelledby="pn-feito-t">
      <div className="section-head">
        <h2 id="pn-feito-t">{t.titulo}</h2>
      </div>
      <p className="pn-sub">{t.sub}</p>
      {!published.ok ? (
        <BlockError codigo={published.codigo} d={d} />
      ) : published.valor.length === 0 ? (
        <div className="pn-empty">
          <p>
            <strong>{t.vazioTitulo}</strong>
          </p>
          <p>{t.vazioTexto}</p>
        </div>
      ) : (
        <ul className="thread-list-all pn-dones">
          {published.valor.slice(0, howMany).map((x) => {
            const type = types[x.tipo] ?? x.tipo
            const when = relativeTime(x.em, d, new Date(now))
            const [before, after] = t.para.split('{nome}')
            return (
              <li key={x.id} className="pn-done">
                <p className="pn-meta">
                  <span className="tag">{type}</span>
                  {x.para && (
                    <span>
                      {before}
                      <bdi>{x.para.nome}</bdi>
                      {after}
                    </span>
                  )}
                  <time dateTime={x.em}>{when}</time>
                  {x.via === 'autorizacao' && <span className="pn-via">{t.porAutorizacao}</span>}
                </p>
                <p className="pn-excerpt" dir="auto">
                  {x.trecho}
                </p>
                {x.caminho && (
                  <Link href={`/${lang}${x.caminho}`} className="pn-open">
                    {t.abrir}
                    <span className="reader-only">
                      : {type}
                      {x.para ? ` ${before}${x.para.nome}${after}` : ''}, {when}
                    </span>
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
