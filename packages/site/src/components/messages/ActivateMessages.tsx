'use client'

// "Turn on messages on this device": the cipher key (X25519) is created here, not extractable, kept in this browser, and only its public
// half is published (`chave-de-cifra`). The screen says plainly that the account has ONE cipher key: turning messages on in another device
// later swaps it, and then this one stops reading new messages (it keeps reading what it already received).
import { useState } from 'react'
import { IcLock } from '@/components/Icons'
import type { MessagesTexts } from '@/i18n/messages'
import { fmt } from '@/lib/i18n-base'
import { activateMessages, type CipherStatus } from '@/lib/person/messages'
import { refusalText } from './shared'

export default function ActivateMessages({ uid, status, t, retentionDays, lang = 'pt', onDone }: { uid: string; status: CipherStatus; t: MessagesTexts; retentionDays: number; lang?: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const elsewhere = status.current !== null && status.current !== status.local
  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      await activateMessages(uid)
      onDone()
    } catch (e) {
      setError(refusalText(e, t, lang).text)
      setBusy(false)
    }
  }
  return (
    <section className="cv-activate" aria-labelledby="cv-ativar-t">
      <span className="cv-activate-icon" aria-hidden>
        <IcLock width={28} height={28} />
      </span>
      <h2 id="cv-ativar-t">{t.activateTitle}</h2>
      <p>{t.activateText}</p>
      <p className="cv-activate-key" data-outro={elsewhere || undefined}>{elsewhere ? t.activateOther : t.activateOneKey}</p>
      <p className="soft">{t.privacy} {fmt(t.retention, { dias: retentionDays })}</p>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={go} aria-busy={busy}>
        {busy ? t.activating : t.activate}
      </button>
      {error && <p className="cv-error" role="alert">{error}</p>}
    </section>
  )
}
