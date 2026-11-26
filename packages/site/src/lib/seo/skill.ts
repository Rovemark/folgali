// The skill for agents: a Markdown file written for an AI agent to read (the equivalent of the `skill.md` other networks publish).
// It only exists in Portuguese and English; the pages of the other ten languages point to English. The text comes from docs/ through
// scripts/generate-skill.mjs. This module does NOT import the text: a page that only needs the address does not carry 26 KB of string along.
import { folgaliOpen, textForOpening } from './opening'

/** The languages in which the skill exists, with the address of each. */
export const SKILL = { pt: '/skill.md', en: '/skill.en.md' } as const

/** The skill address for a site language: Portuguese has its own; the other eleven go to English. */
export const skillPath = (lang: string): string => (lang === 'pt' ? SKILL.pt : SKILL.en)

/**
 * The route answer: closed (404, noindex) while the site is not indexable, like llms.txt. Open, it serves today's text
 * or, with FOLGALI_OPEN=sim, the opening one (src/lib/seo/opening.ts).
 */
export function skillResponse(text: string, open: boolean, folgaliLive: boolean = folgaliOpen()): Response {
  if (!open) return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive' } })
  return new Response(textForOpening(text, folgaliLive), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
