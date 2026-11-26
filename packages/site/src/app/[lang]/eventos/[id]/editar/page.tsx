import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EventFormView from '@/components/events/EventFormView'
import ErrorState from '@/components/social/ErrorState'
import { eventTexts } from '@/i18n/events'
import { eventsOnRelay, readEvent } from '@/lib/events/read'
import { issuersReady } from '@/lib/folgali/issuers'
import { currentPerson } from '@/lib/folgali/session'
import { dict, isReady } from '@/lib/i18n'
import { legalDict } from '@/lib/legal-i18n'
import { getNetwork } from '@/lib/get-network'
import { load, stateType } from '@/lib/social/load'
import { screenMeta } from '@/lib/seo/meta-screens'
import { isDemo } from '@/lib/site'
import '@/app/folgali-events.css'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/eventos/${id}/editar`, eventTexts(isReady(lang) ? lang : 'pt').form.titleEdit)
}

/**
 * Editing an event (protocol 0.11.0 part 4, `evento-editar`): the form opens with what the event says now. Only its organizer gets the
 * form (the browser checks who is signed in, the relay checks again); a cancelled or ended event no longer changes.
 */
export default async function EditEvent({ params }: P) {
  const { lang, id } = await params
  if (!isReady(lang) || isDemo(getNetwork().cliente.modo)) notFound()
  const t = eventTexts(lang)
  const [{ on, limits }, ev] = await Promise.all([eventsOnRelay(), load(() => readEvent(id))])
  if (!on) notFound()
  if (!ev.ok) {
    if (stateType(ev.codigo) === 'nao-existe') notFound()
    return <ErrorState codigo={ev.codigo} d={dict(lang)} lang={lang} />
  }
  const person = issuersReady() !== null ? await currentPerson().catch(() => null) : null
  return (
    <div className="evr-page-form">
      <p className="evr-back">
        <Link href={`/${lang}/eventos/${id}`} dir="auto">
          {ev.valor.titulo}
        </Link>
      </p>
      {person ? (
        <EventFormView lang={lang} t={t} leak={legalDict(lang).vazamento} limits={limits} mode={{ kind: 'edit', event: ev.valor }} consentHref={`/${lang}/entrar`} profileHref={`/${lang}/linha`} />
      ) : (
        <section className="box box-pad evr-form-notice">
          <h1 className="evr-form-title">{t.form.titleEdit}</h1>
          <p>
            <Link href={`/${lang}/entrar`} className="btn btn-primary">
              {t.signIn}
            </Link>
          </p>
        </section>
      )}
    </div>
  )
}
