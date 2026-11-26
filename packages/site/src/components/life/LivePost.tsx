'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { fmt, plural, type Plural } from '@/lib/i18n-base'
import ReactionIcon from './ReactionIcons'
import RollingNumber from './RollingNumber'
import { REACTIONS, type Reaction } from './texts'

type Base = Partial<Record<Reaction, number>>
type Ctx = { minha: Reaction | null; escolher: (r: Reaction | null) => void; base: Base }

const Context = createContext<Ctx | null>(null)

/** The reaction of whoever is looking, split between the button (below) and the count (above) of the same post. */
export function useLivePost(): Ctx | null {
  return useContext(Context)
}

/** Wraps a time-off post: keeps the reaction chosen on this screen (demonstration) so that the button and the count move together. */
export default function LivePost({ base, children }: { base: Base; children: ReactNode }) {
  const [mine, choose] = useState<Reaction | null>(null)
  const value = useMemo(() => ({ minha: mine, escolher: choose, base }), [mine, base])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

/**
 * The same context with the reaction kept by the caller (a post of the real relay): `escolher` writes, `minha` is the caller's state
 * and `base` holds the counts WITHOUT the viewer's own reaction (the count line adds it back).
 */
export function ControlledLivePost({ base, minha: mine, escolher: choose, children }: Ctx & { children: ReactNode }) {
  const value = useMemo(() => ({ minha: mine, escolher: choose, base }), [mine, choose, base])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

const BRAND = '\u0001'

/** The line "👍❤️ 128 likes": the most given faces and the total, which rolls when the person reacts. */
export function LiveCount({ rotulo: label, curtidas: likes }: { rotulo: string; curtidas: Plural }) {
  const ctx = useLivePost()
  const base = ctx?.base ?? {}
  const accounts = REACTIONS.map((r) => [r, (base[r] ?? 0) + (ctx?.minha === r ? 1 : 0)] as const)
  const total = accounts.reduce((s, [, n]) => s + n, 0)
  const types = accounts.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r)
  const [before, after] = plural(likes, total, { n: BRAND }).split(BRAND)
  return (
    <span className="fb-reactions life-count" role="img" aria-label={fmt(label, { n: total })}>
      <span className="life-count-faces" aria-hidden>
        {types.map((r) => (
          <span key={r} className="life-count-face" data-r={r}>
            <ReactionIcon r={r} tamanho={20} />
          </span>
        ))}
      </span>
      <span aria-hidden>
        {after === undefined ? before : <>{before}<RollingNumber valor={total} />{after}</>}
      </span>
    </span>
  )
}
