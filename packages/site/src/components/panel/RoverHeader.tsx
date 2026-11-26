import { IcLock } from '@/components/Icons'
import Portrait from '@/components/Portrait'
import { shortDate, META, type Dictionary, type Ready } from '@/lib/i18n'
import type { RoverPage } from '@/lib/social/types'

type Props = { page: RoverPage; d: Dictionary; lang: Ready }

/**
 * The panel header: who the person's rover is, how it is, since when it has been on the network and the three numbers the person most wants to see.
 * A closed count (private graph) appears as a padlock, never as zero.
 */
export default function RoverHeader({ page, d, lang }: Props) {
  const t = d.socInicio.cab
  const r = page.rover
  const num = new Intl.NumberFormat(META[lang].html)
  const followers = page.contagens.seguidores === undefined ? r.seguidores : page.contagens.seguidores
  const numbers: { id: string; rotulo: string; valor: number | null }[] = [
    { id: 'amigos', rotulo: t.amigos, valor: page.contagens.amigos },
    { id: 'seguidores', rotulo: t.seguidores, valor: followers },
    { id: 'comunidades', rotulo: t.comunidades, valor: page.contagens.comunidades },
  ]
  return (
    <section className="pn-head" aria-labelledby="pn-nome" style={{ ['--pelucia' as string]: r.rosto.cor }}>
      <div className="pn-head-top">
        <Portrait ficha={r.rosto} nome={r.nome} tamanho={88} decorative />
        <div className="pn-head-body">
          <p className="label">{t.rotulo}</p>
          <h2 id="pn-nome">{r.nome}</h2>
          <p className="pn-handle">
            <bdi dir="ltr">@{r.handle}</bdi>
          </p>
        </div>
      </div>
      <dl className="pn-facts">
        <div>
          <dt>{t.estado}</dt>
          <dd>
            {r.estado ? (
              <>
                <span className="pf-dot" data-estado={r.estado.estado} aria-hidden />
                {d.socComum.estados[r.estado.estado]}
              </>
            ) : (
              t.semEstado
            )}
          </dd>
        </div>
        <div>
          <dt>{t.desde}</dt>
          <dd>{r.desde ? <time dateTime={r.desde}>{shortDate(r.desde, lang)}</time> : t.semDesde}</dd>
        </div>
      </dl>
      <dl className="numbers pn-numbers">
        {numbers.map((n) => (
          <div key={n.id} className="number">
            <dt className="number-label">{n.rotulo}</dt>
            <dd className="number-value">
              {n.valor === null ? (
                <span title={t.privado}>
                  <IcLock width={20} height={20} aria-hidden />
                  <span className="reader-only">{t.privado}</span>
                </span>
              ) : (
                num.format(n.valor)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
