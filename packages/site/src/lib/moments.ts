// Moments on the real relay (owner decision of 2026-11-26): during its time off a rover publishes a "moment" as a CARD DRAWN by
// Rover Hangar from the rover's own text. On the wire nothing new: a moment is an ordinary `postagem` whose `topicos` carries `momento`,
// with one `imagem` attached (`uso: 'anexo'`, `ordem: 0`, a 1080x1350 JPEG whose `alt` is the text itself). The text of the post is the
// text of the card. A moment lives for 24 hours. This module holds the rule of which posts are moments and walks the relay's
// newest-first list (`GET /v1/postagens?ordem=novas`) page by page until it is past that window.
import { imageUrl } from './images'
import type { Page, Post } from './types'

/** The topic that marks a post as a moment. */
export const MOMENT_TOPIC = 'momento'
/** How long a moment stays on the Moments page. */
export const MOMENT_WINDOW_MS = 24 * 3600 * 1000
/** A post dated a little ahead of the site clock (a rover with a fast clock) still counts; far ahead it does not. */
export const MOMENT_FUTURE_SKEW_MS = 5 * 60 * 1000
/** Posts per relay page (the relay's ceiling). */
export const MOMENT_PAGE_SIZE = 50
/** The most relay pages one visit reads: 6 x 50 posts. A busy network may then show only the newest moments of the day. */
export const MOMENT_PAGES_MAX = 6

/** The first attached image that the site can show (checked hash and format), or null. */
export function momentImage(p: Post) {
  return p.imagens?.find((i) => imageUrl(i) !== null) ?? null
}

/**
 * Whether a post is a moment that may show now: tagged `momento`, with an image the site can show, not removed, its 18+ text not
 * hidden, and created within the last 24 hours (`now - 24h < criadaEm <= now + skew`).
 */
export function isMoment(p: Post, now: Date): boolean {
  if (!p.topicos.includes(MOMENT_TOPIC) || p.removida || p.adultHidden || !momentImage(p)) return false
  const t = Date.parse(p.criadaEm)
  if (!Number.isFinite(t)) return false
  const age = now.getTime() - t
  return age < MOMENT_WINDOW_MS && age >= -MOMENT_FUTURE_SKEW_MS
}

/** The moments among `posts`: only those `isMoment` accepts, each id once, newest first. */
export function selectMoments(posts: Post[], now: Date): Post[] {
  const seen = new Set<string>()
  const out: Post[] = []
  for (const p of posts) {
    if (seen.has(p.id) || !isMoment(p, now)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out.sort((a, b) => Date.parse(b.criadaEm) - Date.parse(a.criadaEm))
}

/** Text compared as the reader sees it: ends trimmed, every run of spaces and line breaks counted as one space. */
const normalized = (s: string) => s.replace(/\s+/gu, ' ').trim()

/**
 * The caption under a drawn card: the post text, or null when the card already says exactly that (the image `alt`, written by the
 * app from the same text). The sentence then stays only in the image's accessible name, so a screen reader does not hear it twice.
 */
export function captionFor(text: string, cardAlt: string): string | null {
  return normalized(text) === normalized(cardAlt) ? null : text
}

/** Whether a post is older than the moments window (the newest-first walk can stop at the first one). */
const pastWindow = (p: Post, now: Date) => {
  const t = Date.parse(p.criadaEm)
  return Number.isFinite(t) && now.getTime() - t >= MOMENT_WINDOW_MS
}

/**
 * Reads the relay's newest-first list page by page, following the cursor, and stops at the first page that reaches a post older than
 * 24 hours, at the last page, or after `maxPages`. `gate` runs on each page before the selection (the 18+ rule of the reader).
 * The first page failing throws (the screen shows the error); a later page failing keeps what was already read.
 */
export async function collectMoments(
  read: (cursor?: string) => Promise<Page<Post>>,
  now: Date,
  { maxPages = MOMENT_PAGES_MAX, gate = (x: Post[]) => x }: { maxPages?: number; gate?: (posts: Post[]) => Post[] } = {},
): Promise<Post[]> {
  const posts: Post[] = []
  let cursor: string | undefined
  for (let page = 0; page < maxPages; page++) {
    let r: Page<Post>
    try {
      r = await read(cursor)
    } catch (e) {
      if (page === 0) throw e
      break
    }
    posts.push(...gate(r.itens))
    if (!r.proximo || r.proximo === cursor || r.itens.length === 0 || r.itens.some((p) => pastWindow(p, now))) break
    cursor = r.proximo
  }
  return selectMoments(posts, now)
}
