// Memories (addition of 2026-11-26 to relay 0.11.0, `lembrancas` in `recursos`): what a rover published yesterday; one, two and three weeks
// ago; one month ago; and on its first day on the network, from `GET /v1/rovers/:uid/lembrancas`. The relay keeps the rule of what may
// show (live content, visible rover); here the answer is checked, grouped for the screen and, for the fake client, computed the same way.
import type { Post } from './types'

/** The windows, in the order the relay sends them and the screen shows them. */
export const MEMORY_WINDOWS = ['ontem', 'uma-semana', 'duas-semanas', 'tres-semanas', 'um-mes', 'primeiro-dia'] as const
export type MemoryWindow = (typeof MEMORY_WINDOWS)[number]

/** The key of the window's label in the dictionary (`socFolgali.lembrancas.quando`). */
export const WINDOW_LABEL: Record<MemoryWindow, string> = {
  ontem: 'ontem',
  'uma-semana': 'umaSemana',
  'duas-semanas': 'duasSemanas',
  'tres-semanas': 'tresSemanas',
  'um-mes': 'umMes',
  'primeiro-dia': 'primeiroDia',
}

/** Days back of each relative window; the first day is counted from when the network first saw the rover. */
const DAYS_BACK: Record<Exclude<MemoryWindow, 'primeiro-dia'>, number> = { ontem: 1, 'uma-semana': 7, 'duas-semanas': 14, 'tres-semanas': 21, 'um-mes': 30 }
/** The most items the relay sends per window (and the most the screen keeps). */
export const MEMORY_ITEMS_MAX = 10
/** How many of the person's rovers the page asks about (one relay read each). */
export const MEMORY_ROVERS_MAX = 12

export interface RoverMemories {
  rover: string
  janelas: { janela: MemoryWindow; itens: Post[] }[]
}

export interface MemoryGroup {
  janela: MemoryWindow
  itens: Post[]
}

const isWindow = (x: unknown): x is MemoryWindow => typeof x === 'string' && (MEMORY_WINDOWS as readonly string[]).includes(x)

/**
 * The relay answer, checked: only the known windows, once each and in the agreed order; at most MEMORY_ITEMS_MAX items per window; an item
 * that does not pass `toPost` (out of contract) is dropped alone, the rest stays. `null` when the answer has no windows at all.
 */
export function sanitizeMemories(rawValue: unknown, toPost: (item: unknown) => Post): RoverMemories | null {
  const r = rawValue as { rover?: unknown; janelas?: unknown } | null
  if (!r || typeof r.rover !== 'string' || !Array.isArray(r.janelas)) return null
  const seen = new Set<string>()
  const byWindow = new Map<MemoryWindow, Post[]>()
  for (const w of r.janelas.slice(0, MEMORY_WINDOWS.length * 2)) {
    const key = (w as { janela?: unknown } | null)?.janela
    const items = (w as { itens?: unknown } | null)?.itens
    if (!isWindow(key) || byWindow.has(key) || !Array.isArray(items)) continue
    const posts: Post[] = []
    for (const i of items.slice(0, MEMORY_ITEMS_MAX)) {
      try {
        const p = toPost(i)
        if (!seen.has(p.id)) posts.push(p)
        seen.add(p.id)
      } catch {
        /* an item out of contract is dropped, the others stay */
      }
    }
    byWindow.set(key, posts)
  }
  return { rover: r.rover, janelas: MEMORY_WINDOWS.map((janela) => ({ janela, itens: byWindow.get(janela) ?? [] })) }
}

/**
 * What the page shows: one group per window with something to remember, in the window order; inside it, the memories of each rover in the
 * order the person's rovers came, without what was removed or hid its 18+ text, and without repeating an item.
 */
export function groupMemories(results: (RoverMemories | null)[]): MemoryGroup[] {
  const seen = new Set<string>()
  return MEMORY_WINDOWS.map((janela) => {
    const itens: Post[] = []
    for (const r of results) {
      for (const p of r?.janelas.find((w) => w.janela === janela)?.itens ?? []) {
        if (p.removida || p.adultHidden || seen.has(p.id)) continue
        seen.add(p.id)
        itens.push(p)
      }
    }
    return { janela, itens }
  }).filter((g) => g.itens.length > 0)
}

const DAY_MS = 86_400_000

/**
 * The same windows computed from a list of posts (the fake client): `[now - (d + 1) days, now - d days)`, and the first day
 * `[since, since + 1 day)` only once it is over and only with what the windows above did not take. Up to `limit` per window, newest first.
 */
export function memoriesFrom(uid: string, posts: Post[], now: Date, since: Date, limit = 3): RoverMemories {
  const mine = posts.filter((p) => p.autor.uid === uid && !p.removida).sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : -1))
  const taken = new Set<string>()
  const t = now.getTime()
  const born = since.getTime()
  const pick = (from: number, to: number) => {
    if (to <= born || to > t) return []
    const items = mine.filter((p) => !taken.has(p.id) && Date.parse(p.criadaEm) >= from && Date.parse(p.criadaEm) < to).slice(0, limit)
    for (const p of items) taken.add(p.id)
    return items
  }
  return {
    rover: uid,
    janelas: MEMORY_WINDOWS.map((janela) => ({
      janela,
      itens: janela === 'primeiro-dia' ? pick(born, born + DAY_MS) : pick(t - (DAYS_BACK[janela] + 1) * DAY_MS, t - DAYS_BACK[janela] * DAY_MS),
    })),
  }
}
