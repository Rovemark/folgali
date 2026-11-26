import Link from 'next/link'
import EmptyState from '@/components/EmptyState'
import { IcMod } from '@/components/social/SocialIcons'
import { faceByUid } from '@/lib/domain/expression'
import { fmt, relativeTime, type Dictionary, type Ready } from '@/lib/i18n'
import type { Removed } from '@/lib/social/types'

type Props = { itens: Removed[]; d: Dictionary; lang: Ready; agora: string }

/**
 * What the people who look after a space hid from what the rover wrote (0.3.1, `removidos`): what, when, for which reason and by which role (never by which person),
 * and, in a community, the way to appeal. Only the rover itself sees this list. The excerpt comes from what the relay still retains; after the deadline it disappears and the screen says so.
 */
export default function RemovedList({ itens: items, d, lang, agora: now }: Props) {
  const t = d.socAvisos.removidos
  const today = new Date(now)
  return (
    <section className="pf-removidos stack" aria-labelledby="pf-rem-t" style={{ marginTop: 28 }}>
      <div>
        <h2 id="pf-rem-t" className="mod-title">
          <IcMod /> {t.titulo}
        </h2>
        <p className="soft">{t.sub}</p>
      </div>
      {items.length === 0 ? (
        <EmptyState titulo={t.titulo} texto={t.vazio} ficha={faceByUid('rvr_removidos_vazio_0000')} estado="feliz" altura={110} />
      ) : (
        <ul className="stack">
          {items.map((x) => {
            const canAppeal = x.escopo === 'comunidade' && x.contexto !== null && x.apelacao === null
            const targetType = x.alvoTipo ? ((d.socModeracao.registro.tipos as Record<string, string>)[x.alvoTipo] ?? x.alvoTipo) : null
            return (
              <li key={x.id} className="card pf-removido" data-escopo={x.escopo}>
                <p className="flex-row">
                  <span className="pill" data-tom="aviso">
                    {t.escopo[x.escopo]}
                  </span>
                  {targetType && <span className="pill">{targetType}</span>}
                  <span className="fine">
                    {fmt(t.em, { quando: relativeTime(x.em, d, today) })} · {fmt(t.por, { papel: t.papeis[x.por] })}
                  </span>
                </p>
                <p className="fine">{d.socComum.motivosModeracao[x.motivo]}</p>
                {x.trecho ? (
                  <blockquote className="target-report">
                    <span className="overline">{t.trecho}</span>
                    <q>{x.trecho}</q>
                  </blockquote>
                ) : (
                  <p className="fine">{t.semTrecho}</p>
                )}
                <div className="flex-row">
                  {x.apelacao !== null && (
                    <span className="pill" data-tom={x.apelacao === 'revertida' ? 'ok' : x.apelacao === 'aberta' ? 'aviso' : undefined}>
                      {t.apelacao[x.apelacao]}
                    </span>
                  )}
                  {canAppeal && (
                    <Link href={`/${lang}/comunidades/${x.contexto}/apelar?alvo=${x.alvo}`} className="btn btn-secondary btn-small">
                      {t.apelar}
                    </Link>
                  )}
                  {x.apelacao === null && !canAppeal && <span className="fine">{t.semApelo}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
