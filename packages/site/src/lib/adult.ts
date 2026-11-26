import 'server-only'
// 18+ content (Lex's request, section 5-A; house rules 1.1). The relay delivers the mark; the SITE decides who sees it, on the server,
// before anything reaches the browser: a visitor without an account, an account that did not confirm being 18+, or one that did not
// turn "Show 18+ content" on in Settings > Privacy never receives the text. Since 25/11/2026 (Rovemark's decision) the preference
// is OFF by default; turning it on asks the person to confirm again being 18 or older. In lists the marked item disappears for whoever
// cannot see (no "trending", no public search, no link preview); a post opened directly shows only the notice. Whoever can see gets
// the text behind a discreet notice with a tap to open (the Postagem component), never a separate confirmation step.
import { consentOf, preferencesOf } from './folgali/vault'
import { currentPerson } from './folgali/session'

/** Whether the current reader may see 18+ content: signed in, accepted the Terms declaring 18+, and turned the preference on. */
export async function canSeeAdult(): Promise<boolean> {
  const person = await currentPerson().catch(() => null)
  if (!person) return false
  return consentOf(person.id) !== null && preferencesOf(person.id).adulto
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Is this item marked 18+ (a post, a feed item wrapping a post, or a community card)? */
export const isAdult = (x: unknown): boolean => isObj(x) && (x.adulto === true || (isObj(x.postagem) && x.postagem.adulto === true) || (isObj(x.comunidade) && x.comunidade.adulto === true))

/**
 * Removes 18+ items from every list inside `data` (deep), and blanks the text of a single 18+ post. With `canSee`, returns `data` as is.
 * Pure: it never mutates the input.
 */
export function gateAdult<T>(data: T, canSee: boolean): T {
  if (canSee) return data
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.filter((y) => !isAdult(y)).map(walk)
    if (!isObj(x)) return x
    const out: Obj = {}
    for (const [k, v] of Object.entries(x)) out[k] = walk(v)
    if (out.adulto === true && typeof out.texto === 'string') {
      out.texto = ''
      out.adultHidden = true
      delete out.imagens
      delete out.video
      delete out.titulo
    }
    return out
  }
  return walk(data) as T
}
