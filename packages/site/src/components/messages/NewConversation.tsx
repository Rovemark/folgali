'use client'

// Starting a conversation: pick a friend (conversations exist only between friends) and write the request, one sentence of up to 280
// characters with no link. The screen says it plainly: the relay keeps this sentence IN CLEAR while the request is pending.
import { useEffect, useMemo, useState } from 'react'
import type { MessagesTexts } from '@/i18n/messages'
import { fmt } from '@/lib/i18n-base'
import { LeakNotice, type Leak } from '@/components/person/LeakNotice'
import { askConversation, listFriends, MESSAGE_LIMITS, prepareText, type Friend } from '@/lib/person/messages'
import { Avatar, displayName, refusalText } from './shared'

export default function NewConversation({ me, t, leak, lang, busy, onBack, onSent }: { me: string; t: MessagesTexts; leak: Leak; lang: string; busy: Set<string>; onBack: () => void; onSent: (id: string) => void }) {
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [to, setTo] = useState<Friend | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    listFriends(me).then((f) => live && setFriends(f)).catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [me])

  const prepared = useMemo(() => prepareText(text, MESSAGE_LIMITS.requestMax, 0), [text])
  const problem = !text.trim() ? null : prepared.ok ? null : prepared.problem
  const send = async () => {
    if (!to || !prepared.ok || sending) return
    setSending(true)
    setError(null)
    try {
      const r = await askConversation(to.uid, prepared.text)
      onSent(r.objeto.id)
    } catch (e) {
      setError(refusalText(e, t, lang).text)
      setSending(false)
    }
  }

  return (
    <div className="cv-new">
      <header className="cv-head cv-head-chat">
        <button type="button" className="btn btn-calm btn-small cv-back" onClick={onBack}>{t.back}</button>
        <h2>{t.newConversation}</h2>
      </header>
      <div className="cv-new-body">
        {!to ? (
          <>
            <p className="cv-question">{t.pickFriend}</p>
            {failed ? (
              <p className="cv-error" role="alert">{t.failed}</p>
            ) : friends === null ? (
              <p className="soft" role="status">{t.loading}</p>
            ) : friends.length === 0 ? (
              <p className="soft">{t.noFriends}</p>
            ) : (
              <ul className="cv-friends">
                {friends.map((f) => (
                  <li key={f.uid}>
                    <button type="button" className="cv-friend" disabled={busy.has(f.uid)} onClick={() => setTo(f)}>
                      <Avatar who={f} size={36} />
                      <span className="cv-conversation-who">
                        <strong>{displayName(f)}</strong>
                        {f.handle && <span><bdi dir="ltr">@{f.handle}</bdi></span>}
                      </span>
                      {busy.has(f.uid) && <span className="soft">{t.alreadyTalking}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <form className="cv-request" onSubmit={(e) => { e.preventDefault(); void send() }}>
            <div className="cv-request-to">
              <Avatar who={to} size={36} />
              <strong>{displayName(to)}</strong>
              <button type="button" className="btn btn-calm btn-small" onClick={() => setTo(null)}>{t.cancel}</button>
            </div>
            <label htmlFor="cv-pedido-texto">{t.requestTitle}</label>
            <p className="cv-notice-clear" role="note">{t.requestClear}</p>
            <textarea id="cv-pedido-texto" rows={3} value={text} maxLength={MESSAGE_LIMITS.requestMax * 2} placeholder={t.requestPlaceholder} onChange={(e) => setText(e.target.value)} dir="auto" />
            <LeakNotice text={text} leak={leak} field="cv-pedido-texto" />
            {problem && problem !== 'leak' && (
              <p className="cv-error" role="alert">{problem === 'links' ? t.requestNoLinks : fmt(t.problems[problem], { max: MESSAGE_LIMITS.requestMax, n: 0 })}</p>
            )}
            <div className="cv-write-foot">
              <small className="soft">{fmt(t.counter, { n: [...text.trim()].length, max: MESSAGE_LIMITS.requestMax })}</small>
              <button type="submit" className="btn btn-primary" disabled={!prepared.ok || sending}>{t.requestSend}</button>
            </div>
            {error && <p className="cv-error" role="alert">{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
