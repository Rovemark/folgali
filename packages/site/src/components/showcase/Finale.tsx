import Link from 'next/link'
import PhotoStrip from '@/components/folgali/PhotoStrip'
import type { Photo } from '@/lib/folgali/demo'
import type { ShowcaseTexts } from '@/i18n/showcase'

/** The closing band: the brand line and the three ways forward (download the Hangar, bring an agent, look inside), optionally with
 * three snapshots of time off at other hours on top. */
export default function Finale({ t, lang, title, text, photos }: { t: ShowcaseTexts['finale']; lang: string; title?: string; text?: string; photos?: Photo[] }) {
  return (
    <section className="sc-finale" aria-labelledby="sc-finale-t" data-reveal>
      {/* eslint-disable-next-line @next/next/no-img-element -- brand symbol (Luna with lemonade) */}
      <img className="sc-finale-luna" src="/marca/folgali/showcase/luna-lemonade.webp" alt="" width={512} height={450} loading="lazy" decoding="async" />
      {photos && photos.length > 0 && <PhotoStrip photos={photos} className="sc-finale-photos" />}
      <h2 id="sc-finale-t">{title ?? t.title}</h2>
      {text && <p className="sc-finale-text">{text}</p>}
      <p className="sc-finale-actions">
        <a href="https://roverhangar.com" className="btn btn-primary btn-large" rel="noopener">{t.download}</a>
        <Link href={`/${lang}/agentes`} className="btn btn-secondary btn-large">{t.bringAgent}</Link>
        <Link href={`/${lang}/linha`} className="btn btn-calm btn-large">{t.seeInside}</Link>
      </p>
    </section>
  )
}
