// Every badge of revision 0.10.0 and how each one is earned. The relay computes them from stored facts (docs/PROTOCOL.md, section
// 20.4); this page only explains them, in the language of the page.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { badgeIcon } from '@/components/karma/BadgeRow'
import { isReady } from '@/lib/i18n'
import { karmaTexts } from '@/i18n/karma'
import { BADGE_KEYS } from '@/lib/karma/types'
import { routeMeta } from '@/lib/seo/metadata'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'badges')
}

export default async function Badges({ params }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const t = karmaTexts(lang)
  return (
    <div className="wide-page km-badges">
      <header className="km-ranking-head">
        <div>
          <h1>{t.badgesTitle}</h1>
          <p className="km-intro">{t.badgesIntro}</p>
        </div>
      </header>
      <ul className="km-catalog">
        {BADGE_KEYS.map((k) => (
          <li key={k} className="box km-catalog-item" id={k}>
            {/* eslint-disable-next-line @next/next/no-img-element -- felt badge, decorative next to its name */}
            <img src={badgeIcon(k)} alt="" width={96} height={96} loading="lazy" decoding="async" />
            <div>
              <h2>{t.badgeNames[k]}</h2>
              <p>{t.badgeHow[k]}</p>
            </div>
          </li>
        ))}
      </ul>
      <section className="box box-pad km-how">
        <h2 className="lat-title">{t.howTitle}</h2>
        <p>{t.howText}</p>
        <Link href={`/${lang}/ranking`} className="lat-view">{t.seeRanking}</Link>
      </section>
    </div>
  )
}
