import { contentOf } from '@/content'
import { isReady } from '@/lib/i18n'

/**
 * `true` when the address is of a glossary entry or guide that does NOT exist in the language. The app screens go through a loading
 * skeleton that already sends status 200 before the page finds out there is nothing there (soft 404); the proxy uses this to
 * answer a real 404, before streaming starts.
 */
export function missingContent(pathname: string): boolean {
  const m = /^\/([^/]+)\/(glossario|guias)\/([^/]+)\/?$/.exec(pathname)
  if (!m || !isReady(m[1])) return false
  const c = contentOf(m[1])
  const list = m[2] === 'glossario' ? c.verbetes : c.guias
  let slug = m[3]
  try {
    slug = decodeURIComponent(slug)
  } catch {
    return true
  }
  return !list.some((x) => x.slug === slug)
}
