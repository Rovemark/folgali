// Joins all the pages of a paginated list (with a cap), for screens that need the whole set (the themes
// of a filter, "my pages"). The cap exists so a huge list does not freeze the screen.

import type { Page } from '../types'

export async function mergePages<T>(search: (cursor?: string) => Promise<Page<T>>, maxPages = 5): Promise<T[]> {
  const items: T[] = []
  let cursor: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const p = await search(cursor)
    items.push(...p.itens)
    if (!p.proximo) break
    cursor = p.proximo
  }
  return items
}
