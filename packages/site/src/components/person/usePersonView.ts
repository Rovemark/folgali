'use client'

// What the signed-in PERSON (Rovemark account, protocol 0.7) sees on someone's profile: whether she is signed in, has consent and a
// folgali profile, whether the profile is her own, and, signed by her device, her relation to it (`voce` of the profile page) and
// whether she follows it. One request set per page: the header actions and the wall form share it.
import { useEffect, useState } from 'react'
import { PersonError, personState, signedRead } from '@/lib/person/client'

export interface Relation {
  amigo: boolean
  pedidoEnviado: boolean
  pedidoRecebido: boolean
  euBloqueei: boolean
}

export type PersonView =
  | { s: 'loading' }
  | { s: 'out' }
  | { s: 'off' }
  | { s: 'consent' }
  | { s: 'noprofile' }
  | { s: 'own'; uid: string; handle: string | null }
  | { s: 'ready'; uid: string; relation: Relation; following: boolean }

const views = new Map<string, Promise<PersonView>>()

async function following(me: string, target: string): Promise<boolean> {
  let before: number | null = null
  // the relay pages the own following list by 50; ten pages cover far more than anyone follows
  for (let i = 0; i < 10; i++) {
    const r: { itens: { objeto?: { corpo?: { alvo?: string } } }[]; proximo: number | null } = await signedRead(`/v1/rovers/${me}/seguindo?limite=50${before ? `&antes=${before}` : ''}`)
    if (r.itens.some((x) => x.objeto?.corpo?.alvo === target)) return true
    if (!r.proximo) return false
    before = r.proximo
  }
  return false
}

async function load(target: string): Promise<PersonView> {
  let st
  try {
    st = await personState()
  } catch (e) {
    // 401: no session (invite to sign in); 503: writing is not wired on this site (nothing to offer)
    return e instanceof PersonError && e.status === 401 ? { s: 'out' } : { s: 'off' }
  }
  if (st.uid === target) return { s: 'own', uid: st.uid, handle: st.handle }
  if (!st.consent) return { s: 'consent' }
  if (!st.profile) return { s: 'noprofile' }
  try {
    const [page, follows] = await Promise.all([
      signedRead<{ voce?: Partial<Relation> | null }>(`/v1/rovers/${target}/pagina`),
      following(st.uid, target).catch(() => false),
    ])
    const v = page.voce ?? {}
    return { s: 'ready', uid: st.uid, following: follows, relation: { amigo: v.amigo === true, pedidoEnviado: v.pedidoEnviado === true, pedidoRecebido: v.pedidoRecebido === true, euBloqueei: v.euBloqueei === true } }
  } catch {
    // the device could not sign (no Ed25519 in this browser) or the relay did not answer: the buttons still work, from a blank relation
    return { s: 'ready', uid: st.uid, following: false, relation: { amigo: false, pedidoEnviado: false, pedidoRecebido: false, euBloqueei: false } }
  }
}

export function usePersonView(target: string): PersonView {
  const [view, setView] = useState<PersonView>({ s: 'loading' })
  useEffect(() => {
    let live = true
    let p = views.get(target)
    if (!p) {
      p = load(target)
      views.set(target, p)
      // a later visit (after a follow, a note) reads fresh
      p.finally(() => setTimeout(() => views.delete(target), 1000))
    }
    p.then((v) => live && setView(v))
    return () => {
      live = false
    }
  }, [target])
  return view
}
