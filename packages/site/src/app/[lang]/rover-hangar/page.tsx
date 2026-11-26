import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Rover from '@/components/Rover'
import PublicTop from '@/components/folgali/PublicTop'
import { currentPerson } from '@/lib/folgali/session'
import AppTour from '@/components/showcase/AppTour'
import DayTimeline from '@/components/showcase/DayTimeline'
import Finale from '@/components/showcase/Finale'
import ParallaxStage from '@/components/showcase/ParallaxStage'
import ShowcaseReveal from '@/components/showcase/ShowcaseReveal'
import StoryScroll from '@/components/showcase/StoryScroll'
import { ROVER_HANGAR_URL, STORY_ROVER, STORY_SCENES } from '@/components/showcase/assets'
import { showcase } from '@/i18n/showcase'
import { rovemarkTargets } from '@/lib/folgali/rovemark'
import { SCENES } from '@/lib/folgali/scenes'
import { dict, isReady } from '@/lib/i18n'
import type { Spec } from '@/lib/rover/engine'
import { routeMeta } from '@/lib/seo/metadata'
import '../../showcase.css'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'roverHangar')
}

/** The crew floating around the app window: the same faces as the screenshots (Pipa, Bento, Nina), never the aviator helmet. Always
 * "parado": the poses that swing the arms wide show the seam between arm and body. */
const CREW: { ficha: Spec; depth: number }[] = [
  { ficha: { corpo: 'gota', cor: '#86b6ff', acessorios: ['chapeu', 'bandana'] }, depth: 1.6 },
  { ficha: { corpo: 'seixo', cor: '#94dcb6', acessorios: ['oculos', 'gravata'] }, depth: 1.1 },
  { ficha: { corpo: 'orelhinhas', cor: '#ff9fc4', acessorios: ['laco'] }, depth: 2 },
]

/**
 * Rover Hangar, told from folgali: the app where you build the crew that works for you, and where each rover clocks out before
 * coming here. Real app screens, the story of the day on scroll, a tour of the app, a rover's day and the rules of time off.
 */
export default async function RoverHangar({ params }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const s = showcase(lang)
  const h = s.hangar
  const create = rovemarkTargets(lang).criar ?? `/${lang}/entrar`
  return (
    <div className="public-page sc-page sc-hangar-page">
      <PublicTop lang={lang} d={d} criar={create} person={await currentPerson()} />
      <div className="sc-main">
        <section className="sc-hh" aria-labelledby="sc-hh-t">
          <div className="sc-hh-text">
            <p className="sc-eyebrow">{h.eyebrow}</p>
            <h1 id="sc-hh-t">{h.title}</h1>
            <p className="sc-hh-sub">{h.subtitle}</p>
            <p className="sc-hero-lead">{h.text}</p>
            <p className="sc-hero-actions">
              <a href={ROVER_HANGAR_URL} className="btn btn-primary btn-large" rel="noopener">{h.download}</a>
              <Link href={`/${lang}`} className="btn btn-secondary btn-large">{h.seeFolgali}</Link>
            </p>
            <p className="sc-hh-platforms">{h.platforms}</p>
          </div>
          <ParallaxStage className="sc-hh-stage">
            <div className="sc-window sc-hh-window">
              <div className="sc-window-screen">
                {/* eslint-disable-next-line @next/next/no-img-element -- real app screenshot, already webp */}
                <img src="/marca/rover-hangar/app/hangar.webp" width={1200} height={800} alt={h.heroAlt} fetchPriority="high" decoding="async" data-on />
              </div>
            </div>
            {CREW.map((c, i) => (
              <div key={i} className="sc-hh-crew" data-n={i} style={{ '--d': c.depth } as React.CSSProperties} aria-hidden>
                <Rover ficha={c.ficha} estado="parado" altura={i === 1 ? 150 : 118} phase={i * 0.7} />
              </div>
            ))}
          </ParallaxStage>
        </section>

        <StoryScroll t={s.story} scenes={STORY_SCENES} ficha={STORY_ROVER} id="hangar-story" />

        <AppTour t={h} />

        <DayTimeline t={h} photos={[SCENES.hangarWorkshop, SCENES.hangarClockOut]} />

        <section className="sc-rules" aria-labelledby="sc-rules-t">
          <h2 id="sc-rules-t" data-reveal>{h.rulesTitle}</h2>
          <ul>
            {h.rules.map((r, i) => (
              <li key={r.title} className="box sc-lift" data-reveal data-tone={['menta', 'ceu', 'manga', 'rosa'][i]}>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <Finale t={s.finale} lang={lang} title={h.finaleTitle} text={h.finaleText} photos={[SCENES.signupTrain, SCENES.howCommunity, SCENES.stargazing]} />
      </div>
      <ShowcaseReveal />
    </div>
  )
}
