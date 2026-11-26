'use client'

// The private messages of the signed-in PERSON (protocol 0.4.0) in the real mode: three columns on a wide screen (the conversations
// with their filter, the open conversation, the details panel with the other side and the actions) and one column at a time on a phone
// (list, conversation, details, each with Back). Everything secret happens in this browser (src/lib/person/messages.ts): the cipher key
// is created here and never leaves, texts are encrypted before they go and decrypted after they come. The site server carries signed
// envelopes and signed reads only.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MessagesTexts } from '@/i18n/messages'
import { fmt, plural } from '@/lib/i18n-base'
import { PersonError, personState } from '@/lib/person/client'
import { cipherStatus, isActive, listConversations, messagesSupported, type CipherStatus, type Conversation } from '@/lib/person/messages'
import type { ConversationFilter } from '@/lib/person/reads'
import type { Leak } from '@/components/person/LeakNotice'
import ActivateMessages from './ActivateMessages'
import ConversationView from './ConversationView'
import ConversationDetails from './ConversationDetails'
import NewConversation from './NewConversation'
import { Avatar, type Report } from './shared'

export type Props = {
  lang: string
  t: MessagesTexts
  leak: Leak
  /** the issuer keys the relay lists (GET /v1/info `emissores`): the attestation of the other side is checked against them here */
  issuers: string[]
  retentionDays: number
  signIn: string | null
  consentHref: string
  profileHref: string
  /** a conversation to open first (the /mensagens/<id> address) */
  initial?: string | null
}

type Boot =
  | { s: 'loading' }
  | { s: 'out' | 'off' | 'consent' | 'noprofile' | 'unsupported' | 'failed' }
  | { s: 'activate'; uid: string; status: CipherStatus }
  | { s: 'ready'; uid: string }

type Pane = 'list' | 'chat' | 'details'
const FILTERS: ConversationFilter[] = ['todas', 'pendentes', 'ativas']
const POLL_MS = 20_000

export default function PersonMessages(p: Props) {
  const { t, lang, issuers } = p
  const [boot, setBoot] = useState<Boot>({ s: 'loading' })
  const [tries, setTries] = useState(0)

  useEffect(() => {
    let live = true
    ;(async () => {
      let st
      try {
        st = await personState()
      } catch (e) {
        return live && setBoot({ s: e instanceof PersonError && e.status === 401 ? 'out' : 'off' })
      }
      if (!st.consent) return live && setBoot({ s: 'consent' })
      if (!st.profile) return live && setBoot({ s: 'noprofile' })
      if (!(await messagesSupported())) return live && setBoot({ s: 'unsupported' })
      try {
        const status = await cipherStatus(st.uid, issuers)
        if (live) setBoot(isActive(status) ? { s: 'ready', uid: st.uid } : { s: 'activate', uid: st.uid, status })
      } catch {
        if (live) setBoot({ s: 'failed' })
      }
    })()
    return () => {
      live = false
    }
  }, [issuers, tries])

  if (boot.s === 'loading') return <p className="cv-state" role="status">{t.loading}</p>
  if (boot.s === 'failed') {
    return (
      <div className="cv-state" role="alert">
        <p>{t.failed}</p>
        <button type="button" className="btn btn-secondary" onClick={() => { setBoot({ s: 'loading' }); setTries((n) => n + 1) }}>{t.retry}</button>
      </div>
    )
  }
  if (boot.s === 'out' || boot.s === 'off' || boot.s === 'consent' || boot.s === 'noprofile' || boot.s === 'unsupported') {
    const [text, href, label] =
      boot.s === 'out' ? [t.signedOut, p.signIn, t.signIn]
      : boot.s === 'consent' ? [t.needConsent, p.consentHref, t.acceptTerms]
      : boot.s === 'noprofile' ? [t.needProfile, p.profileHref, t.createProfile]
      : boot.s === 'unsupported' ? [t.unsupported, null, null]
      : [t.off, null, null]
    return (
      <div className="cv-state">
        <p>{text}</p>
        {href && label && <a href={href} className="btn btn-primary">{label}</a>}
      </div>
    )
  }
  if (boot.s === 'activate') {
    return <ActivateMessages lang={lang} uid={boot.uid} status={boot.status} t={t} retentionDays={p.retentionDays} onDone={() => setBoot({ s: 'ready', uid: boot.uid })} />
  }
  if (boot.s !== 'ready') return null
  return <Inbox {...p} me={boot.uid} onLostKey={(status) => setBoot({ s: 'activate', uid: boot.uid, status })} />
}

function Inbox({ t, lang, leak, issuers, retentionDays, initial, me, onLostKey }: Props & { me: string; onLostKey: (s: CipherStatus) => void }) {
  const [filter, setFilter] = useState<ConversationFilter>('todas')
  const [list, setList] = useState<Conversation[] | null>(null)
  const [listError, setListError] = useState(false)
  const [openId, setOpenId] = useState<string | null>(initial ?? null)
  const [creating, setCreating] = useState(false)
  const [pane, setPane] = useState<Pane>(initial ? 'chat' : 'list')
  const [report, setReport] = useState<Report | null>(null)
  // every change (a sent message, a decision, a deletion) bumps this: the list and the open conversation read again
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const [all, setAll] = useState<Conversation[]>([])

  useEffect(() => {
    let live = true
    const load = () =>
      Promise.all([listConversations(me, filter), filter === 'todas' ? null : listConversations(me, 'todas')])
        .then(([page, everything]) => {
          if (!live) return
          setList(page.items)
          setAll((everything ?? page).items)
          setListError(false)
        })
        .catch(() => live && setListError(true))
    load()
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [me, filter, version])

  const open = (id: string) => {
    setOpenId(id)
    setCreating(false)
    setReport(null)
    setPane('chat')
    try {
      window.history.replaceState(window.history.state, '', `/${lang}/mensagens/${id}`)
    } catch {
      /* the address is a convenience */
    }
  }
  const back = () => {
    setPane('list')
    try {
      window.history.replaceState(window.history.state, '', `/${lang}/mensagens`)
    } catch {
      /* idem */
    }
  }
  const current = useMemo(() => list?.find((c) => c.id === openId) ?? all.find((c) => c.id === openId) ?? null, [list, all, openId])
  const busy = useMemo(() => new Set(all.filter((c) => c.estado === 'pendente' || c.estado === 'ativa').map((c) => c.com.uid)), [all])

  const when = (s: number | null) => (s ? new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s * 1000)) : '')

  return (
    <div className="cv" data-pane={pane}>
      <p className="cv-privacy" role="note">{t.privacy} {fmt(t.retention, { dias: retentionDays })}</p>
      <div className="cv-grid">
        <section className="cv-col cv-list" aria-labelledby="cv-lista-t">
          <header className="cv-head">
            <h2 id="cv-lista-t">{t.conversations}</h2>
            <button type="button" className="btn btn-primary btn-small" onClick={() => { setCreating(true); setOpenId(null); setReport(null); setPane('chat') }}>
              {t.newConversation}
            </button>
          </header>
          <div className="cv-filters" role="group" aria-label={t.filtersLabel}>
            {FILTERS.map((f) => (
              <button key={f} type="button" className="cv-filter" aria-pressed={f === filter} onClick={() => setFilter(f)}>
                {t.filters[f]}
              </button>
            ))}
          </div>
          {listError && <p className="cv-error" role="alert">{t.failed}</p>}
          {list === null ? (
            <p className="soft cv-pad" role="status">{t.loading}</p>
          ) : list.length === 0 ? (
            <p className="soft cv-pad">{filter === 'todas' ? t.empty : t.emptyFilter}</p>
          ) : (
            <ul className="cv-conversations">
              {list.map((c) => {
                const received = c.estado === 'pendente' && c.iniciadaPor !== me
                const sub = c.estado === 'pendente' ? (received ? t.theyAsked : t.youAsked) : plural(t.messagesN, c.mensagens)
                return (
                  <li key={c.id}>
                    <button type="button" className="cv-conversation" aria-current={c.id === openId ? 'true' : undefined} data-estado={c.estado} data-pede={received || undefined} onClick={() => open(c.id)}>
                      <Avatar who={c.com} />
                      <span className="cv-conversation-who">
                        <strong>{c.com.nome ?? (c.com.handle ? `@${c.com.handle}` : c.com.uid)}</strong>
                        <span>{sub}</span>
                      </span>
                      <span className="cv-conversation-side">
                        <span className="cv-state-pill" data-estado={c.estado}>{t.states[c.estado]}</span>
                        <small>{when(c.ultimaMensagemEm ?? c.atualizadaEm)}</small>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="cv-col cv-chat" aria-label={current ? (current.com.nome ?? current.com.handle ?? '') : t.newConversation}>
          {creating ? (
            <NewConversation me={me} t={t} leak={leak} lang={lang} busy={busy} onBack={back} onSent={(id) => { bump(); open(id) }} />
          ) : current ? (
            <ConversationView
              key={current.id}
              me={me}
              c={current}
              t={t}
              leak={leak}
              lang={lang}
              issuers={issuers}
              version={version}
              onChanged={bump}
              onBack={back}
              onDetails={() => setPane('details')}
              onReport={(r) => { setReport(r); setPane('details') }}
              onLostKey={() => cipherStatus(me, issuers).then(onLostKey).catch(() => onLostKey({ local: null, current: null }))}
            />
          ) : (
            <div className="cv-empty">
              <p>{t.pickOne}</p>
            </div>
          )}
        </section>

        <aside className="cv-col cv-details" aria-labelledby="cv-det-t">
          {current && !creating ? (
            <ConversationDetails
              key={current.id}
              me={me}
              c={current}
              t={t}
              lang={lang}
              report={report}
              onReportDone={() => setReport(null)}
              onChanged={bump}
              onBack={() => setPane('chat')}
            />
          ) : (
            <h2 id="cv-det-t" className="reader-only">{t.details}</h2>
          )}
        </aside>
      </div>
    </div>
  )
}

