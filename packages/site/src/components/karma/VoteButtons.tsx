'use client'

// The arrow vote of a post, reply or topic (revision 0.10.0, proposal 0012), next to the five reactions:
//   - a signed-in person (Rovemark account, consent and a folgali profile) signs a `seta` object with the device key and the site
//     carries it to the relay (src/lib/person/client.ts). Another direction replaces the vote; the same one again takes it back
//     (`nenhuma`);
//   - otherwise the server action answers: the demonstration keeps the vote on this screen, and the real relay without a signed-in
//     person refuses, so the arrow goes back and the person is told to sign in.
// The score shown is up minus down. Nothing is written to browser storage.
import { useCallback, useRef, useState } from 'react'
import { voteAction } from '@/app/actions'
import { fmt, plural } from '@/lib/i18n-base'
import { PersonError, personState, publish } from '@/lib/person/client'
import { notify } from '@/components/life/notice'
import { useKarmaTexts } from './useKarmaTexts'

type Dir = 'acima' | 'abaixo'

let personOnce: Promise<boolean> | null = null
function canSign(): Promise<boolean> {
  personOnce ??= personState().then((s) => s.consent && s.profile).catch(() => false)
  return personOnce
}

class NeedsSignIn extends Error {}

type Props = {
  id: string
  counts?: { acima: number; abaixo: number }
  mine?: Dir | null
  /** compact: a row, for replies and the sidebar */
  compact?: boolean
}

export default function VoteButtons({ id, counts, mine: fromServer = null, compact = false }: Props) {
  const t = useKarmaTexts()
  const [mine, setMine] = useState<Dir | null>(fromServer)
  const busy = useRef(false)
  // the server counts already include the reader's own vote: take it out, then add the live one back
  const base = (counts?.acima ?? 0) - (counts?.abaixo ?? 0) - (fromServer === 'acima' ? 1 : fromServer === 'abaixo' ? -1 : 0)
  const score = base + (mine === 'acima' ? 1 : mine === 'abaixo' ? -1 : 0)

  const choose = useCallback((pressed: Dir) => {
    if (busy.current) return
    const previous = mine
    const next = previous === pressed ? null : pressed
    busy.current = true
    setMine(next)
    const write = async () => {
      if (await canSign()) {
        try {
          await publish('seta', { alvo: id, direcao: next ?? 'nenhuma' })
        } catch (e) {
          // the relay already had exactly this (another tab): keep what the person sees
          if (e instanceof PersonError && (e.code === 'ja_existe' || e.code === 'nao_encontrado')) return
          throw e
        }
        return
      }
      const r = await voteAction(id, next ?? 'nenhuma')
      if (!r.ok) throw new NeedsSignIn()
    }
    write()
      .catch((e: unknown) => {
        setMine(previous)
        notify(e instanceof NeedsSignIn ? t.signInToVote : t.voteFailed)
      })
      .finally(() => { busy.current = false })
  }, [id, mine, t])

  const label = plural(t.score, Math.abs(score)).replace(/^(\d)/, score < 0 ? '-$1' : '$1')
  return (
    <div className={`km-arrows${compact ? ' km-arrows-compact' : ''}`} data-minha={mine ?? undefined} role="group" aria-label={label}>
      <button type="button" className="km-arrow km-arrow-up" aria-pressed={mine === 'acima'} aria-label={t.up} title={t.up} onClick={() => choose('acima')}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M12 4 4 13h5v7h6v-7h5z" fill="currentColor" /></svg>
      </button>
      <span className="km-scoreboard" aria-live="polite" title={label}>
        {fmt('{n}', { n: score })}
      </span>
      <button type="button" className="km-arrow km-arrow-down" aria-pressed={mine === 'abaixo'} aria-label={t.down} title={t.down} onClick={() => choose('abaixo')}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M12 20 4 11h5V4h6v7h5z" fill="currentColor" /></svg>
      </button>
    </div>
  )
}
