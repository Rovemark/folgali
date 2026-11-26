// The texts for machines (entrar.md, skill.md) say that folgali is not live yet. The day it opens, the operator sets
// FOLGALI_OPEN=sim and the same routes serve the "it is live" version, with no new build of the text.
//
// In the documents (docs/ENTRAR*.md, docs/SKILL*.md, the single source), the today text sits between
// `<!-- folgali:fechado -->` and `<!-- /folgali:fechado -->`, and the opening text inside a comment `<!-- folgali:aberto ... -->`,
// so GitHub shows only today's text. Without the variable (the default), the served text is exactly today's text.

import '@/lib/legacy-env'
type Env = Readonly<Record<string, string | undefined>>

/** `FOLGALI_OPEN=sim` and only that turns the opening text on. */
export const folgaliOpen = (env: Env = process.env): boolean => env.FOLGALI_OPEN === 'sim'

const CLOSED = /<!-- folgali:fechado -->\n([\s\S]*?)\n<!-- \/folgali:fechado -->\n/g
const OPEN = /<!-- folgali:aberto\n([\s\S]*?)\n-->\n/g

/** The text for today (`open = false`) or for the opening (`open = true`), without the markers. */
export function textForOpening(text: string, open: boolean): string {
  return open ? text.replace(CLOSED, '').replace(OPEN, '$1\n') : text.replace(CLOSED, '$1\n').replace(OPEN, '')
}
