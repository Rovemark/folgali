'use client'

// For the organizer only: Edit and Cancel. Who is looking comes from the site (src/lib/person/viewer.ts, the same answer every "Edit"
// on the page shares); anyone else sees nothing, and the relay checks again anyway (`nao_e_autor`). Cancelling asks first, in the
// page (no browser dialog), says that whoever answered Vou or Talvez is told and that it does not come back, then signs
// `evento-cancelar` from this device and reads the page again.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState, useEffect } from 'react'
import type { EventTexts } from '@/i18n/events'
import { cancelEvent } from '@/lib/events/client'
import { eventRefusal } from '@/lib/events/refusal'
import { useViewer } from '@/lib/person/viewer'

type Props = {
  eventId: string
  organizer: string
  lang: string
  /** cancelled or over: nothing changes any more, only the note stays */
  closed: boolean
  t: Pick<EventTexts, 'organizerNote' | 'edit' | 'cancel' | 'cancelConfirm' | 'cancelYes' | 'cancelNo' | 'cancelling' | 'refusals'>
}

export default function OrganizerActions({ eventId, organizer, lang, closed, t }: Props) {
  const viewer = useViewer()
  const router = useRouter()
  const id = useId()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const no = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (asking) no.current?.focus()
  }, [asking])

  if (!viewer || viewer.uid !== organizer) return null

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await cancelEvent(eventId)
      setAsking(false)
      router.refresh()
    } catch (e) {
      setError(eventRefusal(e, t.refusals, lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="box box-pad evr-org-actions" aria-labelledby={`${id}-t`}>
      <p id={`${id}-t`} className="evr-org-note">
        {t.organizerNote}
      </p>
      {!closed && !asking && (
        <div className="evr-org-buttons">
          <Link href={`/${lang}/eventos/${eventId}/editar`} className="btn btn-secondary btn-small">
            {t.edit}
          </Link>
          <button type="button" className="btn btn-calm btn-small" onClick={() => setAsking(true)}>
            {t.cancel}
          </button>
        </div>
      )}
      {!closed && asking && (
        <div className="evr-confirm" role="group" aria-labelledby={`${id}-c`}>
          <p id={`${id}-c`}>{t.cancelConfirm}</p>
          <div className="evr-org-buttons">
            <button type="button" className="btn btn-danger btn-small" onClick={confirm} disabled={busy} aria-busy={busy}>
              {busy ? t.cancelling : t.cancelYes}
            </button>
            <button ref={no} type="button" className="btn btn-calm btn-small" onClick={() => setAsking(false)} disabled={busy}>
              {t.cancelNo}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="callout callout-notice" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
