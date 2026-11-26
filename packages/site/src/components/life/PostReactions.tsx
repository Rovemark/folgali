'use client'

// The five reactions of a post or a reply (revision 0.8.0, proposal 0010), stored for real:
//   - a signed-in person (Rovemark account, consent and a folgali profile) signs a `reacao` object with the device key and the site
//     carries it to the relay (src/lib/person/client.ts). Another reaction replaces the previous one on the relay;
//   - otherwise the server action (`reagirAcao`) answers: the demo client stores it, and on the real relay without a paired app it
//     refuses, so the reaction goes back and the person is told to sign in.
// After a reload the page is drawn from the relay without the person's credential, so `mine` comes empty: once on screen, the posts
// ask the relay AS the person, in one batch, with read credentials the device key signs (`myReactions`), and the button shows her
// reaction again. Nothing is written to browser storage (the privacy policy promises only the theme and the device key). Taking a reaction back
// removes it by id: the id is known while the page lives; when it is not (after a reload), a replacement reaction is published and
// that one is removed, which leaves the relay without a reaction of this person on the post.
// The counts are the per type counts the relay sends (curtir and util always, the four new ones when there is one).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { reactAction } from '@/app/actions'
import { fmt } from '@/lib/i18n-base'
import { PersonError, myReactions, personState, publish, type ReactionTarget } from '@/lib/person/client'
import { POST_REACTIONS, type PostReaction, type ReactionCounts } from '@/lib/types'
import { notify } from './notice'
import ReactionIcon from './ReactionIcons'
import { ControlledLivePost } from './LivePost'
import React from './ReactButton'
import { useLifeTexts } from './useLifeTexts'

/** The id of the person's live reaction per post, while this page lives (memory only). */
const liveIds = new Map<string, string>()

/** Whether this browser has a person who can sign (one request per page): signed in, consent given and a folgali profile. */
let personOnce: Promise<boolean> | null = null
function canSign(): Promise<boolean> {
  personOnce ??= personState()
    .then((s) => s.consent && s.profile)
    .catch(() => false)
  return personOnce
}

/**
 * The posts on screen ask for the person's reactions together: every PostReactions that mounts in the same tick joins one batch, and
 * one request answers all of them.
 */
let queue: { target: ReactionTarget; done: (r: string | null | undefined) => void }[] = []
function askMine(target: ReactionTarget): Promise<string | null | undefined> {
  return new Promise((done) => {
    queue.push({ target, done })
    if (queue.length > 1) return
    setTimeout(() => {
      const batch = queue
      queue = []
      myReactions(batch.map((b) => b.target))
        .catch(() => ({}) as Record<string, string | null>)
        .then((found) => { for (const b of batch) b.done(found[b.target.id]) })
    }, 0)
  })
}

class NeedsSignIn extends Error {}

const isPostReaction = (r: unknown): r is PostReaction => typeof r === 'string' && (POST_REACTIONS as readonly string[]).includes(r)

/** Signs and sends the person's change. Returns true when the relay already had exactly this reaction (`ja_reagiu`). */
export async function writeAsPerson(target: string, next: PostReaction | null, previous: PostReaction | null): Promise<boolean> {
  if (next === null) {
    let id = liveIds.get(target)
    if (!id) {
      // unknown id: replace with another reaction (the relay swaps it) and remove that one
      const other: PostReaction = previous === 'curtir' ? 'amei' : 'curtir'
      id = (await publish('reacao', { alvo: target, reacao: other })).id
    }
    await publish('remocao-pelo-autor', { alvo: id })
    liveIds.delete(target)
    return false
  }
  try {
    liveIds.set(target, (await publish('reacao', { alvo: target, reacao: next })).id)
    return false
  } catch (e) {
    if (e instanceof PersonError && e.code === 'ja_reagiu') return true
    throw e
  }
}

type Props = {
  id: string
  counts: ReactionCounts
  mine: string | null
  /** the word on the button when there is no reaction yet ("Curtir") */
  label: string
  /** for a reply, the post it answers (its reaction is read through that post's reply list) */
  parent?: string
}

export default function PostReactions({ id, counts, mine: fromServer, label, parent }: Props) {
  const tv = useLifeTexts()
  const initial = isPostReaction(fromServer) ? fromServer : null
  // the reaction already inside `counts` (the relay sent it as `minhaReacao`, or said `ja_reagiu`)
  const [counted, setCounted] = useState<PostReaction | null>(initial)
  const [mine, setMine] = useState<PostReaction | null>(initial)
  const busy = useRef(false)
  const touched = useRef(false)

  // the page came without the person's reaction: ask the relay as the person (nothing happens for a visitor or in the demo)
  useEffect(() => {
    if (initial !== null) return
    let live = true
    askMine({ id, parent }).then((r) => {
      if (!live || touched.current || !isPostReaction(r)) return
      setCounted(r)
      setMine(r)
    })
    return () => { live = false }
  }, [id, parent, initial])

  const base = useMemo(() => {
    const b: Partial<Record<PostReaction, number>> = {}
    for (const r of POST_REACTIONS) b[r] = Math.max(0, (counts[r] ?? 0) - (counted === r ? 1 : 0))
    return b
  }, [counts, counted])

  const choose = useCallback((next: PostReaction | null) => {
    if (busy.current) return
    touched.current = true
    const previous = mine
    busy.current = true
    setMine(next)
    const write = async () => {
      if (await canSign()) {
        if (await writeAsPerson(id, next, previous)) setCounted(next)
        return
      }
      // demo client (or a paired app): the server action toggles, so taking back sends the reaction being removed
      const r = await reactAction(id, next ?? previous!)
      if (!r.ok) throw new NeedsSignIn()
    }
    write()
      .catch((e: unknown) => {
        setMine(previous)
        notify(e instanceof NeedsSignIn ? tv.entrarParaReagir : tv.reacaoNaoGravou)
      })
      .finally(() => { busy.current = false })
  }, [id, mine, tv])

  const tally = POST_REACTIONS.map((r) => [r, (base[r] ?? 0) + (mine === r ? 1 : 0)] as const).filter(([, n]) => n > 0)
  const tallyLabel = tally.map(([r, n]) => `${tv.reacoes[r]} ${n}`).join(', ')

  return (
    <ControlledLivePost base={base} minha={mine} escolher={choose}>
      <div className="post-reactions">
        <React rotulo={label} />
        {tally.length > 0 && (
          <span className="post-reactions-types" role="img" aria-label={fmt(tv.porTipo, { lista: tallyLabel })}>
            {tally.map(([r, n]) => (
              <span key={r} className="post-reactions-type" data-r={r} aria-hidden>
                <ReactionIcon r={r} tamanho={18} />
                <span>{n}</span>
              </span>
            ))}
          </span>
        )}
      </div>
    </ControlledLivePost>
  )
}
