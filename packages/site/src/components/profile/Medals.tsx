'use client'

import ActionButton from '@/components/social/ActButton'
import { IcMedal } from '@/components/social/SocialIcons'
import { shortDate, plural, type Dictionary, type Ready } from '@/lib/i18n-base'
import { BADGES, type BadgeCounts, type BadgeType } from '@/lib/social/types'

/** Who can give a badge: a friend of 7 days or more. The reasons for "no" say nothing about blocking. */
export type CanGiveBadge = 'sim' | 'nao-amigo' | 'sem-tempo' | 'ninguem'

const HUE: Record<BadgeType, number> = { confiavel: 255, caprichoso: 48, rapido: 155, divertido: 345 }

type Props = {
  selos: BadgeCounts
  targetUid: string
  can: CanGiveBadge
  d: Dictionary
  /** 0.3.1 (`voce.selosQueDei`): the badges the reader already gave; their 'Give' button stays disabled. Empty on relay 0.3. */
  jaDeu?: readonly BadgeType[]
  /** 0.3.1: when the reader becomes able to give a badge (ISO), to say the date instead of just "not yet". */
  podeEm?: string | null
  lang?: Ready
}

/** The four badges as embroidered medals. The count is of distinct friends; who gave never appears. */
export default function Medals({ selos: badges, targetUid, can, d, jaDeu: alreadyGave = [], podeEm: canAt = null, lang = 'pt' }: Props) {
  const s = d.socPerfil.selos
  const total = BADGES.reduce((n, k) => n + badges[k], 0)
  return (
    <section className="pf-badge-list" aria-labelledby="pf-selos-t">
      <div className="pf-badges-head">
        <h2 id="pf-selos-t" className="overline">
          {s.titulo}
        </h2>
        <p className="fine">{s.legenda}</p>
      </div>
      <ul className="pf-medals">
        {BADGES.map((k) => {
          const n = badges[k]
          const name = d.socComum.selos[k].nome
          return (
            <li key={k} className="pf-medal" data-vazia={n === 0} style={{ ['--h' as string]: HUE[k] }}>
              <span className="pf-medal-disc" aria-hidden>
                <IcMedal />
                {/* the count is said in words just below; the disc only carries it as a small badge when there is one */}
                {n > 0 && <b className="pf-medal-num">{n}</b>}
              </span>
              <strong>{name}</strong>
              <small>
                <span className="reader-only">{d.socComum.selos[k].texto} </span>
                {plural(s.contagem, n)}
              </small>
              {can === 'sim' && alreadyGave.includes(k) && (
                <span className="fine pf-ja-deu" title={s.jaDeu}>
                  <span className="reader-only">{s.jaDeu}: {name}</span>
                  <span aria-hidden>{s.dadoCurto}</span>
                </span>
              )}
              {can === 'sim' && !alreadyGave.includes(k) && (
                <ActionButton ato={{ tipo: 'selo', alvo: targetUid, selo: k }} d={d} className="btn btn-calm btn-small">
                  <span className="reader-only">{s.dar.replace('{selo}', name)}</span>
                  <span aria-hidden>+ {s.darCurto}</span>
                </ActionButton>
              )}
            </li>
          )
        })}
      </ul>
      {total === 0 && can === 'ninguem' && <p className="fine">{s.nenhumTexto}</p>}
      {can === 'nao-amigo' && <p className="fine pf-reason">{s.semAmizade}</p>}
      {can === 'sem-tempo' && <p className="fine pf-reason">{canAt ? s.podeEm.replace('{data}', shortDate(canAt, lang)) : s.semPermissao}</p>}
    </section>
  )
}
