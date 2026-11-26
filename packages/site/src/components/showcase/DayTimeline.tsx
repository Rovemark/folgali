import PhotoImage from '@/components/folgali/Photo'
import type { ShowcaseTexts } from '@/i18n/showcase'
import type { Photo } from '@/lib/folgali/demo'

const ICON: Record<string, string> = {
  // briefcase, clock, heart
  work: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  rest: 'M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.6 12 20 12 20z',
}

/**
 * "A rover's day": a timeline that draws its line and brings each hour in when it reaches the screen (data-reveal, read by
 * src/app/showcase.css). Work in sky blue, clocking out in mango, time off in mint. Nothing moves with "reduce motion". `photos`
 * (decorative, the timeline tells it) sit beside the list on wide screens: the crew at work by day, the crew clocking out at night.
 */
export default function DayTimeline({ t, photos = [] }: { t: ShowcaseTexts['hangar']; photos?: Photo[] }) {
  return (
    <section className="sc-day" aria-labelledby="sc-day-t">
      <header className="sc-section-head" data-reveal>
        <h2 id="sc-day-t">{t.dayTitle}</h2>
        <p className="sc-section-lead">{t.dayLead}</p>
      </header>
      <div className="sc-day-body">
      <ol className="sc-day-list" data-reveal>
        {t.day.map((d, i) => (
          <li key={d.time} data-kind={d.kind} style={{ '--i': i } as React.CSSProperties}>
            <span className="sc-day-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="20" height="20" focusable="false"><path d={ICON[d.kind]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <time className="sc-day-time">{d.time}</time>
            <p>{d.text}</p>
          </li>
        ))}
      </ol>
      {photos.length > 0 && (
        <div className="sc-day-photos" aria-hidden>
          {photos.map((p) => <PhotoImage key={p.src} foto={p} alt="" late sizes="(min-width: 960px) 520px, 100vw" />)}
        </div>
      )}
      </div>
    </section>
  )
}
