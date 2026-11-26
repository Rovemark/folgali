'use client'

// Vou, Talvez, Não vou for the signed-in person (protocol 0.11.0 part 4, `evento-presenca`). Her current answer comes from the relay
// read as her (src/lib/events/client.ts, `myRsvp`) and is marked; a tap signs and publishes the new answer from this device, which
// replaces the earlier one. The relay's refusals become a sentence: a full event suggests "Talvez", an ended one says answers are
// closed. After an answer the page reads the event again, so the counts and the list of who goes follow.
import { useRouter } from 'next/navigation'
import { useEffect, useId, useState } from 'react'
import type { EventTexts } from '@/i18n/events'
import { answerEvent, myRsvp } from '@/lib/events/client'
import { eventRefusal } from '@/lib/events/refusal'
import { RSVPS, type Rsvp } from '@/lib/events/types'
import { fmt } from '@/lib/i18n-base'

type Props = {
  eventId: string
  lang: string
  t: Pick<EventTexts, 'answerLabel' | 'rsvp' | 'yourAnswer' | 'saving' | 'refusals'>
  /** what the page already knows (null for a visitor, before the signed read comes back) */
  initial?: Rsvp | null
}

export default function EventRsvp({ eventId, lang, t, initial = null }: Props) {
  const router = useRouter()
  const id = useId()
  const [mine, setMine] = useState<Rsvp | null>(initial)
  const [busy, setBusy] = useState<Rsvp | null>(null)
  const [error, setError] = useState<{ text: string; full: boolean } | null>(null)

  useEffect(() => {
    let live = true
    myRsvp(eventId).then((r) => {
      if (live && r) setMine(r)
    })
    return () => {
      live = false
    }
  }, [eventId])

  async function pick(r: Rsvp) {
    if (busy || r === mine) return
    setBusy(r)
    setError(null)
    try {
      await answerEvent(eventId, r)
      setMine(r)
      router.refresh()
    } catch (e) {
      const full = typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'evento_lotado'
      setError({ text: eventRefusal(e, t.refusals, lang), full })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="evr-attendance">
      <div className="ev-buttons evr-buttons" role="group" aria-labelledby={`${id}-r`}>
        <span id={`${id}-r`} className="reader-only">
          {t.answerLabel}
        </span>
        {RSVPS.map((r) => (
          <button
            key={r}
            type="button"
            className={`btn ${mine === r ? 'btn-primary' : 'btn-outline'}`}
            aria-pressed={mine === r}
            aria-busy={busy === r}
            disabled={busy !== null}
            data-resposta={r}
            onClick={() => pick(r)}
          >
            {busy === r ? t.saving : t.rsvp[r]}
          </button>
        ))}
      </div>
      <p className="reader-only" aria-live="polite">
        {mine && !busy ? fmt(t.yourAnswer, { r: t.rsvp[mine] }) : ''}
      </p>
      {error && (
        <p className="callout callout-notice evr-refusal" role="alert" data-lotado={error.full ? '1' : undefined}>
          {error.text}
        </p>
      )}
    </div>
  )
}
