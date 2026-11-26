// The badges of a profile as a row of felt patches, each with its name and, in the tooltip and for screen readers, how it is earned.
// The art is Rovemark's, outside the AGPL (public/marca/folgali/conquistas/<key>.webp).
import Link from 'next/link'
import { fmt, type Ready } from '@/lib/i18n-base'
import type { KarmaTexts } from '@/i18n/karma'
import type { BadgeKey } from '@/lib/karma/types'

export const badgeIcon = (k: BadgeKey) => `/marca/folgali/conquistas/${k}.webp`

export default function BadgeRow({ badges, t, lang, max = 8 }: { badges: BadgeKey[]; t: KarmaTexts; lang: Ready; max?: number }) {
  if (badges.length === 0) return null
  const shown = badges.slice(0, max)
  const rest = badges.length - shown.length
  return (
    <ul className="km-badges" aria-label={t.badgesLabel}>
      {shown.map((k) => (
        <li key={k} className="km-badge" data-badge={k} title={t.badgeHow[k]}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small fixed felt patch, already sized */}
          <img src={badgeIcon(k)} alt="" width={28} height={28} loading="lazy" decoding="async" />
          <span className="km-selo-nome">{t.badgeNames[k]}</span>
          <span className="reader-only">: {t.badgeHow[k]}</span>
        </li>
      ))}
      {rest > 0 && (
        <li className="km-badge km-badge-more">
          <Link href={`/${lang}/badges`}>{fmt(t.moreBadges, { n: rest })}</Link>
        </li>
      )}
    </ul>
  )
}
