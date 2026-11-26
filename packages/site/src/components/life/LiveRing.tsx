'use client'

import { useSyncExternalStore, type ReactNode } from 'react'

// Who already had their moment seen IN THIS visit. It stays only in the memory of the page (nothing written in the browser): when going back from the viewer to the
// feed, the ring of whoever was already seen loses its color; reloading the page resets it.
const seenSet = new Set<string>()
const listeners = new Set<() => void>()
const signBytes = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }

export function markSeen(author: string) {
  if (seenSet.has(author)) return
  seenSet.add(author)
  listeners.forEach((f) => f())
}
export const wasSeen = (author: string) => seenSet.has(author)

/** The colored ring of the moment: turning slowly while not seen; gray after. */
export default function LiveRing({ autor: author, ring, children }: { autor: string; ring: string; children: ReactNode }) {
  const seen = useSyncExternalStore(signBytes, () => seenSet.has(author), () => false)
  return (
    <span className="moment-ring life-ring" data-anel={ring} data-visto={seen || undefined}>
      {children}
    </span>
  )
}
