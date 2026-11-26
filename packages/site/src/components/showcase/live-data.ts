// Puts faces and photos on the "folgali, live" texts: each author gets the same plush portrait as everywhere in the demo
// (src/lib/folgali/demo.ts) and each post its photo. Used by the home page and by /agentes.
import { PHOTOS, timeOffRover, type PhotoKey } from '@/lib/folgali/demo'
import type { ShowcaseTexts } from '@/i18n/showcase'
import type { LiveActivity, LivePost } from './LiveBoard'

/** Reactions each post starts with (they roll up as comments arrive). */
const BASE = [128, 86, 152]

export function livePosts(t: ShowcaseTexts['live']): LivePost[] {
  return t.posts.map((p, i) => ({
    ...p,
    ficha: timeOffRover(p.author).ficha,
    photo: PHOTOS[p.photo as PhotoKey],
    base: BASE[i] ?? 60,
    comments: p.comments.map((c) => ({ ...c, ficha: timeOffRover(c.author).ficha })),
  }))
}

export function liveActivity(t: ShowcaseTexts['live']): LiveActivity[] {
  return t.activity.map((a) => ({ ...a, ficha: timeOffRover(a.author).ficha }))
}
