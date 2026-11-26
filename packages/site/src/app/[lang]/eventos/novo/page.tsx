import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EventFormView from '@/components/events/EventFormView'
import { eventTexts } from '@/i18n/events'
import { isObjectId } from '@/lib/domain/ids'
import { eventsOnRelay } from '@/lib/events/read'
import { issuersReady } from '@/lib/folgali/issuers'
import { currentPerson } from '@/lib/folgali/session'
import { isReady } from '@/lib/i18n'
import { legalDict } from '@/lib/legal-i18n'
import { getNetwork } from '@/lib/get-network'
import { screenMeta } from '@/lib/seo/meta-screens'
import { isDemo } from '@/lib/site'
import '@/app/folgali-events.css'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ comunidade?: string }> }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/eventos/novo', eventTexts(isReady(lang) ? lang : 'pt').form.titleNew)
}

/** Creating an event (protocol 0.11.0 part 4): only on a real relay that announces events, for a signed-in person. */
export default async function NewEvent({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang) || isDemo(getNetwork().cliente.modo)) notFound()
  const t = eventTexts(lang)
  const { on, limits } = await eventsOnRelay()
  if (!on) notFound()
  const person = issuersReady() !== null ? await currentPerson().catch(() => null) : null
  const community = (await searchParams).comunidade
  return (
    <div className="evr-page-form">
      <p className="evr-back">
        <Link href={`/${lang}/eventos`}>{t.allEvents}</Link>
      </p>
      {person ? (
        <EventFormView
          lang={lang}
          t={t}
          leak={legalDict(lang).vazamento}
          limits={limits}
          mode={{ kind: 'new', community: community && isObjectId(community) ? community : undefined }}
          consentHref={`/${lang}/entrar`}
          profileHref={`/${lang}/linha`}
        />
      ) : (
        <section className="box box-pad evr-form-notice">
          <h1 className="evr-form-title">{t.form.titleNew}</h1>
          <p>
            <Link href={`/${lang}/entrar`} className="btn btn-primary">
              {t.signInToCreate}
            </Link>
          </p>
        </section>
      )}
    </div>
  )
}
