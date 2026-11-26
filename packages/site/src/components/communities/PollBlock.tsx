'use client'

import { useState } from 'react'
import ActionButton from '@/components/social/ActButton'
import { IcPoll, IcResolved } from '@/components/social/SocialIcons'
import { fmt, plural, relativeTime, type Dictionary } from '@/lib/i18n-base'
import type { Poll } from '@/lib/social/types'

/** "in 2 d", "in 5 h": the time until the poll ends (the site's relative time only looks to the past). */
export function inFuture(iso: string, d: Dictionary, now: Date): string {
  const min = Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 60000))
  const t = d.socForum.enquete.daqui
  if (min < 1) return t.agora
  if (min < 60) return fmt(t.min, { n: min })
  if (min < 1440) return fmt(t.h, { n: Math.floor(min / 60) })
  return fmt(t.d, { n: Math.floor(min / 1440) })
}

/**
 * The poll of a topic: bars with the count of each option. The vote is secret (the network only counts) and
 * is NOT changeable: after the first vote the buttons disappear. Once closed, only the result.
 */
export default function PollBlock({ topico: topic, e, canVote, d, agora: now }: { topico: string; e: Poll; canVote: boolean; d: Dictionary; agora: string }) {
  const t = d.socForum.enquete
  const [chosen, setChosen] = useState<number | null>(e.voce)
  const voted = chosen !== null
  const open = !e.encerrada
  const total = e.total + (e.voce === null && chosen !== null ? 1 : 0)
  const larger = Math.max(...e.opcoes.map((o, i) => o.votos + (i === chosen && e.voce === null ? 1 : 0)))
  return (
    <section className="poll" aria-labelledby={`enq-${topic.slice(-6)}`}>
      <div className="section-top">
        <h2 id={`enq-${topic.slice(-6)}`} className="poll-title">
          <IcPoll /> {t.titulo}
        </h2>
        <span className="fine">
          {open ? t.encerraEm.replace('{quando}', inFuture(e.encerraEm, d, new Date(now))) : t.encerrouEm.replace('{quando}', relativeTime(e.encerraEm, d, new Date(now)))}
        </span>
      </div>
      <ul className="poll-options">
        {e.opcoes.map((o, i) => {
          const votes = o.votos + (i === chosen && e.voce === null ? 1 : 0)
          const pct = total > 0 ? Math.round((votes / total) * 100) : 0
          const mine = i === chosen
          return (
            <li key={i} className="poll-option" data-minha={mine ? 'true' : undefined} data-lider={!open && votes === larger && larger > 0 ? 'true' : undefined}>
              <div className="poll-row">
                <span className="poll-text">
                  {mine && <IcResolved aria-hidden />} {o.texto}
                  {mine && <span className="reader-only"> ({t.seuVoto})</span>}
                </span>
                <span className="poll-num number">
                  {pct}% <span className="fine">· {plural(t.votos, votes)}</span>
                </span>
              </div>
              <div className="poll-bar" role="img" aria-label={`${pct}%`}>
                <span style={{ width: `${pct}%` }} />
              </div>
              {open && !voted && canVote && (
                <ActionButton ato={{ tipo: 'voto', topico: topic, opcao: i }} d={d} className="btn btn-secondary btn-small poll-vote" onDone={() => setChosen(i)}>
                  {t.votar}
                  <span className="reader-only">: {o.texto}</span>
                </ActionButton>
              )}
            </li>
          )
        })}
      </ul>
      <p className="fine">
        {plural(t.votos, total)} · {t.secreto}
        {open && !voted && !canVote && <> {t.soMembro}</>}
      </p>
    </section>
  )
}
