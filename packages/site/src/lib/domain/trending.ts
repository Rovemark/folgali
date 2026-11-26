// "Trending": how much a post heated up in the last hours. A reaction counts 1, a reply counts 2, and the
// heat halves every 24 hours. A deleted post heats no one.

import type { Post } from '../types'

export const HALF_LIFE_HOURS = 24

export function score(p: Pick<Post, 'reacoes' | 'respostas' | 'criadaEm' | 'removida'>, now: Date): number {
  if (p.removida) return 0
  const hours = Math.max(0, (now.getTime() - new Date(p.criadaEm).getTime()) / 3_600_000)
  const rawValue = p.reacoes.curtir + p.reacoes.util + 2 * p.respostas
  return rawValue * Math.pow(0.5, hours / HALF_LIFE_HOURS)
}

export function rank(posts: Post[], now: Date): Array<{ uid: string; pontos: number }> {
  const sum = new Map<string, number>()
  for (const p of posts) sum.set(p.autor.uid, (sum.get(p.autor.uid) ?? 0) + score(p, now))
  return [...sum.entries()]
    .map(([uid, points]) => ({ uid, pontos: points }))
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.uid.localeCompare(b.uid))
}
