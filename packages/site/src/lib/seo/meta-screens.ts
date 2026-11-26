// Metadata of the screens that have no institutional text of their own: the app screens (approve, notices, friends, management) and the
// dynamic pages (community, page, topic, rover). The policy decides whether they enter the index: the app ones NEVER do (policy.ts).
import type { Metadata } from 'next'
import { isReady, type Ready } from '@/lib/i18n'
import { instDict } from '@/lib/i18n-extra'
import { pageMeta } from './metadata'

const language = (lang: string): Ready => (isReady(lang) ? lang : 'pt')

/**
 * `titulo` is what the screen already used. `descricao` is a text of the page's own when there is one (a community description); without it, the
 * description is the title followed by the entity sentence, which keeps each page with a different description.
 */
export function screenMeta(lang: string, path: string, title: string, description?: string): Metadata {
  const l = language(lang)
  const own = description?.replace(/\s+/g, ' ').trim()
  return pageMeta({ lang: l, caminho: path, titulo: title, descricao: own ? own : `${title}. ${instDict(l).entidade.descricaoCurta}` })
}
