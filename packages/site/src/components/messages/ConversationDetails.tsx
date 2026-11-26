'use client'

// The details panel of a conversation: who the other side is, the state and the dates, what the relay sees, and the actions (end the
// conversation, delete this side's copy) plus the report of one received message, which reveals its text to the relay operator.
import { useState } from 'react'
import type { MessagesTexts } from '@/i18n/messages'
import { fmt, plural } from '@/lib/i18n-base'
import { decideConversation, deleteCopy, REPORT_REASONS, reportMessage, type Conversation, type ReportReason } from '@/lib/person/messages'
import { Avatar, ConfirmButton, displayName, refusalText, type Report } from './shared'

type Props = {
  me: string
  c: Conversation
  t: MessagesTexts
  lang: string
  report: Report | null
  onReportDone: () => void
  onChanged: () => void
  onBack: () => void
}

export default function ConversationDetails({ me, c, t, lang, report, onReportDone, onChanged, onBack }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = displayName(c.com)
  const date = (s: number) => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s * 1000))
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError(refusalText(e, t, lang).text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cv-det">
      <header className="cv-head cv-head-chat cv-head-det">
        <button type="button" className="btn btn-calm btn-small cv-back" onClick={onBack}>{t.back}</button>
        <h2 id="cv-det-t">{t.aboutTitle}</h2>
      </header>
      <div className="cv-det-body">
        {report && <ReportForm item={report} t={t} lang={lang} onDone={onReportDone} />}
        <div className="cv-det-who">
          <Avatar who={c.com} size={64} />
          <strong>{name}</strong>
          {c.com.handle && <span className="soft"><bdi dir="ltr">@{c.com.handle}</bdi></span>}
          {c.com.especie && <span className="cv-species">{t.kinds[c.com.especie]}</span>}
          {c.com.handle && <a className="btn btn-secondary btn-small" href={`/${lang}/r/${c.com.handle}`}>{t.profile}</a>}
        </div>

        <ul className="cv-det-list">
          <li><span className="cv-state-pill" data-estado={c.estado}>{t.states[c.estado]}</span></li>
          <li>{c.iniciadaPor === me ? fmt(t.startedByYou, { data: date(c.criadaEm) }) : fmt(t.startedByThem, { data: date(c.criadaEm), nome: name })}</li>
          {c.ultimaMensagemEm && <li>{fmt(t.lastActivity, { data: date(c.ultimaMensagemEm) })}</li>}
          <li>{plural(t.messagesN, c.mensagens)}</li>
        </ul>

        {!report && (
          <div className="cv-det-actions">
            {c.estado === 'ativa' && (
              <ConfirmButton label={t.endConversation} question={t.endConfirm} confirm={t.confirm} cancel={t.cancel} disabled={busy} className="btn btn-secondary btn-small" onConfirm={() => void run(() => decideConversation(c.id, 'encerrar'))} />
            )}
            {c.mensagens > 0 && (
              <ConfirmButton label={t.deleteAll} question={t.deleteAllConfirm} confirm={t.confirm} cancel={t.cancel} disabled={busy} className="btn btn-secondary btn-small" onConfirm={() => void run(() => deleteCopy(c.id, null))} />
            )}
          </div>
        )}
        {error && <p className="cv-error" role="alert">{error}</p>}
        <p className="cv-det-note soft">{t.privacy}</p>
      </div>
    </div>
  )
}

function ReportForm({ item, t, lang, onDone }: { item: Report; t: MessagesTexts; lang: string; onDone: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const send = async () => {
    if (!reason) return
    setState('busy')
    setError(null)
    try {
      await reportMessage(item, reason)
      setState('done')
    } catch (e) {
      setError(refusalText(e, t, lang).text)
      setState('idle')
    }
  }
  if (state === 'done') {
    return (
      <div className="cv-report" role="status">
        <p>{t.reported}</p>
        <button type="button" className="btn btn-calm btn-small" onClick={onDone}>{t.back}</button>
      </div>
    )
  }
  return (
    <form className="cv-report" onSubmit={(e) => { e.preventDefault(); void send() }} aria-labelledby="cv-den-t">
      <h3 id="cv-den-t">{t.reportTitle}</h3>
      <blockquote className="cv-text" dir="auto">{item.texto}</blockquote>
      <p className="cv-notice-clear" role="note">{t.reportWarning}</p>
      <fieldset>
        <legend>{t.reportReason}</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r} className="cv-reason">
            <input type="radio" name="cv-motivo" value={r} checked={reason === r} onChange={() => setReason(r)} /> {t.reasons[r]}
          </label>
        ))}
      </fieldset>
      <div className="cv-actions">
        <button type="submit" className="btn btn-danger btn-small" disabled={!reason || state === 'busy'}>{t.reportSend}</button>
        <button type="button" className="btn btn-calm btn-small" onClick={onDone}>{t.cancel}</button>
      </div>
      {error && <p className="cv-error" role="alert">{error}</p>}
    </form>
  )
}
