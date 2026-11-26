'use client'

// One open conversation: the request (in clear, checked against its signature), the messages decrypted in this browser, and the field to
// write. The text rules and the leak filter run here BEFORE encrypting, because the relay cannot read (so cannot filter) what it carries.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MessagesTexts } from '@/i18n/messages'
import { fmt } from '@/lib/i18n-base'
import { LeakNotice, type Leak } from '@/components/person/LeakNotice'
import { decideConversation, deleteCopy, MESSAGE_LIMITS, prepareText, readMessages, requestText, sendMessage, type Conversation, type MessageItem } from '@/lib/person/messages'
import { Avatar, ConfirmButton, displayName, refusalText, type Report } from './shared'

type Props = {
  me: string
  c: Conversation
  t: MessagesTexts
  leak: Leak
  lang: string
  issuers: string[]
  version: number
  onChanged: () => void
  onBack: () => void
  onDetails: () => void
  onReport: (r: Report) => void
  onLostKey: () => void
}

export default function ConversationView({ me, c, t, leak, lang, issuers, version, onChanged, onBack, onDetails, onReport, onLostKey }: Props) {
  const [items, setItems] = useState<MessageItem[] | null>(null)
  const [next, setNext] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [request, setRequest] = useState<{ text: string | null } | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deciding, setDeciding] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  const name = displayName(c.com)

  useEffect(() => {
    let live = true
    requestText(c, issuers).then((x) => live && setRequest({ text: x })).catch(() => live && setRequest({ text: null }))
    return () => {
      live = false
    }
  }, [c, issuers])

  // the newest page, merged with what was already loaded further back (a refresh never drops the older pages the person opened)
  useEffect(() => {
    let live = true
    readMessages(me, c, issuers)
      .then((page) => {
        if (!live) return
        setItems((old) => {
          const fresh = new Set(page.items.map((m) => m.id))
          const oldest = page.items.length ? Math.min(...page.items.map((x) => x.criadoEm)) : Infinity
          // with no older page on the relay the fresh page is everything: what is missing from it was deleted
          const keep = page.next === null ? [] : (old ?? []).filter((m) => !fresh.has(m.id) && m.criadoEm <= oldest)
          return [...page.items, ...keep]
        })
        if (first.current) {
          setNext(page.next)
          first.current = false
        }
        setFailed(false)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, c.id, c.mensagens, c.estado, c.atualizadaEm, c.ultimaMensagemEm, version, issuers])

  const shown = useMemo(() => (items ? [...items].sort((a, b) => a.criadoEm - b.criadoEm || (a.id < b.id ? -1 : 1)) : null), [items])
  // the newest message in view: the scroll box moves, never the page
  useEffect(() => {
    const box = end.current
    if (!box) return
    box.scrollTop = box.scrollHeight
    // on a phone the page itself scrolls (one column at a time): bring the newest message above the field to write
    if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 899px)').matches) box.lastElementChild?.scrollIntoView?.({ block: 'end' })
  }, [shown?.length, request])

  const older = async () => {
    if (!next) return
    try {
      const page = await readMessages(me, c, issuers, next)
      setItems((old) => [...(old ?? []), ...page.items.filter((m) => !(old ?? []).some((o) => o.id === m.id))])
      setNext(page.next)
    } catch {
      setFailed(true)
    }
  }

  const prepared = useMemo(() => prepareText(text, MESSAGE_LIMITS.textMax, MESSAGE_LIMITS.linksPerMessage), [text])
  const problem = !text.trim() || prepared.ok ? null : prepared.problem
  const send = async () => {
    if (!prepared.ok || sending) return
    setSending(true)
    setError(null)
    try {
      const sent = await sendMessage(me, c, prepared.text, issuers)
      setItems((old) => [sent, ...(old ?? [])])
      setText('')
      onChanged()
    } catch (e) {
      const r = refusalText(e, t, lang)
      setError(r.text)
      if (r.lostKey) onLostKey()
    } finally {
      setSending(false)
    }
  }
  const decide = async (d: 'aceitar' | 'recusar' | 'encerrar') => {
    setDeciding(true)
    setError(null)
    try {
      await decideConversation(c.id, d)
      onChanged()
    } catch (e) {
      setError(refusalText(e, t, lang).text)
      onChanged()
    } finally {
      setDeciding(false)
    }
  }
  const remove = async (m: MessageItem) => {
    setError(null)
    try {
      await deleteCopy(c.id, m.id)
      setItems((old) => (old ?? []).filter((x) => x.id !== m.id))
      onChanged()
    } catch (e) {
      setError(refusalText(e, t, lang).text)
    }
  }

  const received = c.iniciadaPor !== me
  const time = (s: number) => {
    const d = new Date(s * 1000)
    const today = new Date().toDateString() === d.toDateString()
    return new Intl.DateTimeFormat(lang, today ? { timeStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' }).format(d)
  }

  return (
    <div className="cv-conversation-open">
      <header className="cv-head cv-head-chat">
        <button type="button" className="btn btn-calm btn-small cv-back" onClick={onBack}>{t.back}</button>
        <Avatar who={c.com} size={36} />
        <div className="cv-head-who">
          <h2>{name}</h2>
          <span className="cv-state-pill" data-estado={c.estado}>{t.states[c.estado]}</span>
        </div>
        <button type="button" className="btn btn-calm btn-small cv-view-details" onClick={onDetails}>{t.details}</button>
      </header>

      <div className="cv-scroll" ref={end}>
        <div className="cv-request-block" data-estado={c.estado}>
          <p className="cv-request-label">{t.requestTitle}</p>
          {c.pedido ? (
            request === null ? null : request.text === null ? <p className="cv-unreadable">{t.requestUnverified}</p> : <p className="cv-text" dir="auto">{request.text}</p>
          ) : (
            <p className="soft">{t.requestGone}</p>
          )}
          {c.estado === 'pendente' && received && (
            <>
              <p>{fmt(t.decide, { nome: name })}</p>
              <div className="cv-actions">
                <button type="button" className="btn btn-primary" disabled={deciding} onClick={() => decide('aceitar')}>{t.accept}</button>
                <button type="button" className="btn btn-secondary" disabled={deciding} onClick={() => decide('recusar')}>{t.refuse}</button>
              </div>
            </>
          )}
          {c.estado === 'pendente' && !received && (
            <>
              <p className="soft">{fmt(t.waiting, { nome: name })}</p>
              <ConfirmButton label={t.cancelRequest} question={t.cancelRequest} confirm={t.confirm} cancel={t.cancel} disabled={deciding} onConfirm={() => decide('encerrar')} />
            </>
          )}
          {c.estado === 'recusada' && <p className="soft">{t.refusedNote}</p>}
          {c.estado === 'encerrada' && <p className="soft">{t.closedNote}</p>}
        </div>

        {failed && <p className="cv-error" role="alert">{t.failed}</p>}
        {next && <button type="button" className="btn btn-calm btn-small cv-earlier" onClick={older}>{t.loadOlder}</button>}
        {shown && shown.length === 0 && c.estado === 'ativa' && <p className="soft cv-pad">{t.noMessages}</p>}
        {shown && shown.length > 0 && (
          <ol className="cv-messages">
            {shown.map((m) => (
              <li key={m.id} className="cv-msg" data-minha={m.mine} data-ilegivel={!m.legible || undefined}>
                <p className="cv-msg-who">
                  <strong>{m.mine ? t.you : name}</strong> <small>{time(m.criadoEm)}</small>
                </p>
                {m.legible ? <p className="cv-text" dir="auto">{m.texto}</p> : <p className="cv-unreadable">{m.why === 'other-device' ? t.otherDevice : t.unreadable}</p>}
                <div className="cv-msg-actions">
                  {!m.mine && m.legible && (
                    <button type="button" className="cv-link" onClick={() => onReport(m)}>{t.report}</button>
                  )}
                  <ConfirmButton label={t.deleteOne} question={t.deleteOneConfirm} confirm={t.confirm} cancel={t.cancel} className="cv-link" onConfirm={() => void remove(m)} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {c.estado === 'ativa' && (
        <form className="cv-write" onSubmit={(e) => { e.preventDefault(); void send() }}>
          <label htmlFor="cv-texto" className="reader-only">{t.writeLabel}</label>
          <textarea
            id="cv-texto"
            rows={2}
            value={text}
            placeholder={t.writePlaceholder}
            dir="auto"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <LeakNotice text={text} leak={leak} field="cv-texto" />
          {problem && problem !== 'leak' && <p className="cv-error" role="alert">{fmt(t.problems[problem], { max: MESSAGE_LIMITS.textMax, n: MESSAGE_LIMITS.linksPerMessage })}</p>}
          <div className="cv-write-foot">
            <small className="soft">{t.encryptedNote}</small>
            <small className="soft cv-counter">{fmt(t.counter, { n: [...text.trim()].length, max: MESSAGE_LIMITS.textMax })}</small>
            <button type="submit" className="btn btn-primary" disabled={!prepared.ok || sending} aria-busy={sending}>{sending ? t.sending : t.send}</button>
          </div>
        </form>
      )}
      {error && <p className="cv-error cv-pad" role="alert">{error}</p>}
    </div>
  )
}
