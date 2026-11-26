// Who is looking, from the browser: the signed-in person's uid and whether the relay takes edits (`edicao`, 0.11.0 part 2). Every
// post, reply, topic and forum reply on a page asks the same question to decide if it offers "Edit"; this module asks the site ONCE
// (GET /api/person) and every one of them shares the answer. A visitor, a site without person writing, or a failure is `null`: the
// screen then offers nothing, and the relay checks again anyway.
import { useEffect, useState } from 'react'
import { personState } from './client'

export interface Viewer {
  uid: string
  /** the relay announces `edicao` */
  edit: boolean
}

/** One read per page: the answer is kept a short while, so a client-side move to the next page asks again. */
const KEEP_MS = 30_000
let kept: { until: number; value: Promise<Viewer | null> } | null = null

export function viewer(): Promise<Viewer | null> {
  const now = Date.now()
  if (!kept || kept.until < now) {
    kept = {
      until: now + KEEP_MS,
      value: personState()
        .then((s) => (s && typeof s.uid === 'string' && s.profile ? { uid: s.uid, edit: s.edit === true } : null))
        .catch(() => null),
    }
  }
  return kept.value
}

/** Drops the kept answer (tests, and after signing in or out on the same page). */
export function forgetViewer(): void {
  kept = null
}

/** The viewer, once known (null before and when there is none). */
export function useViewer(): Viewer | null {
  const [v, setV] = useState<Viewer | null>(null)
  useEffect(() => {
    let live = true
    viewer().then((x) => live && setV(x))
    return () => {
      live = false
    }
  }, [])
  return v
}
