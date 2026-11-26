'use client'

// The relation buttons of a profile for a PERSON on folgali (since 0.7.0 a person signs in with Rovemark and follows, asks for
// friendship and leaves notes). Each gesture is an object signed on the device and carried to the relay (src/lib/person/client.ts).
// A visitor without an account gets a short invite to sign in; the owner of the profile gets "Edit profile".
import Link from 'next/link'
import { useState } from 'react'
import { PersonError, publish } from '@/lib/person/client'
import type { ProfileTexts } from '@/i18n/profile'
import { usePersonView } from './usePersonView'

type Props = {
  uid: string
  nome: string
  lang: string
  t: ProfileTexts
  /** where "Sign in" goes (null when the Rovemark login is not configured here) */
  signIn: string | null
  /** whether this wall takes notes from the reader at all (`recados` is not `ninguem`) */
  notesOpen: boolean
}

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '')

export default function PersonActions({ uid, nome: name, lang, t, signIn, notesOpen }: Props) {
  const view = usePersonView(uid)
  const [follows, setFollows] = useState<boolean | null>(null)
  const [friend, setFriend] = useState<'none' | 'sent' | 'received' | 'friends' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  if (view.s === 'loading') return <div className="pf-relationship pf-relationship-waiting" aria-hidden />
  if (view.s === 'off') return null
  if (view.s === 'own') {
    return (
      <div className="pf-relationship">
        <Link href={`/${lang}/configuracoes/perfil`} className="btn btn-secondary">{t.editProfile}</Link>
      </div>
    )
  }
  if (view.s === 'out' || view.s === 'consent' || view.s === 'noprofile') {
    const [text, href, label] =
      view.s === 'out' ? [t.invite, signIn, t.signIn] : view.s === 'consent' ? [t.needConsent, `/${lang}/entrar`, t.acceptTerms] : [t.needProfile, `/${lang}/linha`, t.createProfile]
    return (
      <div className="pf-join">
        <p>{fill(text, { nome: name })}</p>
        {href && <a href={href} className="btn btn-primary btn-small">{label}</a>}
      </div>
    )
  }

  const r = view.relation
  const isFollowing = follows ?? view.following
  const state = friend ?? (r.amigo ? 'friends' : r.pedidoRecebido ? 'received' : r.pedidoEnviado ? 'sent' : 'none')

  async function act(run: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      await run()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  const toggleFollow = () =>
    act(async () => {
      try {
        await publish(isFollowing ? 'deixar-de-seguir' : 'seguir', { alvo: uid })
      } catch (e) {
        // already in the state asked for: the relay says so, and the button just catches up
        if (!(e instanceof PersonError && (e.code === 'ja_segue' || e.code === 'nao_segue'))) throw e
      }
      setFollows(!isFollowing)
    })
  const friendship = (action: 'pedir' | 'aceitar' | 'desfazer', next: 'sent' | 'friends' | 'none') =>
    act(async () => {
      try {
        await publish('amizade', { alvo: uid, acao: action })
      } catch (e) {
        if (!(e instanceof PersonError && e.code === 'ja_existe')) throw e
      }
      setFriend(next)
    })

  if (r.euBloqueei) return null
  return (
    <div className="pf-relationship">
      <div className="pf-relationship-row">
        <button type="button" className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}`} aria-pressed={isFollowing} disabled={busy} onClick={toggleFollow} title={isFollowing ? t.unfollow : undefined}>
          {isFollowing ? t.following : t.follow}
        </button>
        {state === 'friends' ? (
          <span className="pill" data-tom="ok">{t.friends}</span>
        ) : state === 'received' ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => friendship('aceitar', 'friends')}>{t.acceptFriend}</button>
        ) : state === 'sent' ? (
          <>
            <span className="pill" data-tom="acao">{t.requestSent}</span>
            <button type="button" className="btn btn-calm btn-small" disabled={busy} onClick={() => friendship('desfazer', 'none')}>{t.cancelRequest}</button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => friendship('pedir', 'sent')}>{t.askFriend}</button>
        )}
        {notesOpen && <a href="#recado" className="btn btn-calm">{t.leaveNote}</a>}
      </div>
      {error && <p className="fine" role="alert">{t.failed}</p>}
    </div>
  )
}
