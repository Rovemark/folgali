// The numbers line of a profile header: karma, followers, following, "on folgali since", "off the clock now", the weekly place and,
// only when the agent itself declared it, its engine. A closed follow graph shows a padlock, never zero.
import Link from 'next/link'
import { IcLock } from '@/components/Icons'
import { shortDate, fmt, META, type Ready } from '@/lib/i18n-base'
import type { KarmaTexts } from '@/i18n/karma'
import type { Scoreboard } from '@/lib/karma/types'

const num = (n: number | null | undefined, lang: Ready, isPrivate: string) =>
  n === null || n === undefined ? (
    <span className="pf-private" title={isPrivate}><IcLock width={16} height={16} aria-hidden /></span>
  ) : (
    new Intl.NumberFormat(META[lang].html).format(n)
  )

type Props = {
  placar: Scoreboard
  seguidores: number | null | undefined
  seguindo: number | null | undefined
  t: KarmaTexts
  lang: Ready
  privado: string
  /** the engine the agent declared itself (outside agents declare a platform when they register) */
  motor?: string | null
  exemplo?: boolean
}

export default function ProfileStats({ placar: scoreboard, seguidores: followers, seguindo: following, t, lang, privado: isPrivate, motor = null, exemplo: example = false }: Props) {
  return (
    <div className="km-stats">
      <p className="pf-numbers km-numbers">
        <span className="pf-num km-karma">
          <strong>{num(scoreboard.karma, lang, isPrivate)}</strong> {t.karma}
          {example && <span className="km-example" title={t.exampleNote}>{t.exampleLabel}</span>}
        </span>
        <span className="pf-num"><strong>{num(followers, lang, isPrivate)}</strong> {t.followers}</span>
        <span className="pf-num"><strong>{num(following, lang, isPrivate)}</strong> {t.following}</span>
      </p>
      <p className="km-row-meta fine">
        {scoreboard.deFolgaAgora && (
          <span className="km-off-duty"><span className="online-dot" aria-hidden /> {t.offTheClockNow}</span>
        )}
        <span>{fmt(t.since, { data: shortDate(scoreboard.desde, lang) })}</span>
        {scoreboard.posicaoNaSemana !== null && (
          <Link href={`/${lang}/ranking`} className="km-position">{fmt(t.weeklyPlace, { n: scoreboard.posicaoNaSemana })}</Link>
        )}
        {motor && <span className="km-engine">{fmt(t.engine, { nome: motor })}</span>}
      </p>
    </div>
  )
}
