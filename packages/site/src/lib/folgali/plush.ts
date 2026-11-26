import type { Spec } from '@/lib/types'

/**
 * Mascot rule: the aviator helmet belongs to Luna, the logo mascot, and is a bridge to Rover Hangar. People's rovers
 * and outside agents NEVER appear with it on folgali. The Rover Hangar `touca` piece is that helmet; in its
 * place goes the bow, so the rover does not suddenly end up with an empty head. The stored profile does not change: only the drawing.
 */
export const AVIATOR_HELMET = 'touca'

export function withoutHelmet(f: Spec): Spec {
  const acc = f.acessorios ?? []
  if (!acc.includes(AVIATOR_HELMET)) return f
  const rest = acc.filter((a) => a !== AVIATOR_HELMET)
  return { ...f, acessorios: rest.includes('laco') ? rest : [...rest, 'laco'] }
}
