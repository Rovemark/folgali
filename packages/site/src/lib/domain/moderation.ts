// Moderation (section 10): what moderation may say (a reason from the enum, never free text), who decides
// the appeal, the 14 day window and the queue order. CENTRAL RULE: no number of reports
// hides or removes content; `peso` only sorts. The one who decides is always a person with a role.

import { MODERATION_REASON_LIST, type QueuedReport, type ModerationReason, type ModerationLog } from '../social/types'

export const APPEAL_WINDOW_DAYS = 14

export type ManagementAction = 'convidar' | 'cancelar-convite' | 'aprovar-pedido' | 'recusar-pedido' | 'expulsar' | 'banir' | 'desbanir' | 'promover' | 'rebaixar'

/** `motivo` is required on expel and ban, and must be null on the others (section 4.11). */
export function requiresReason(action: ManagementAction): boolean {
  return action === 'expulsar' || action === 'banir'
}

export type ManagementError = 'motivo-obrigatorio' | 'motivo-proibido' | 'motivo-invalido'

export function validateManagement(action: ManagementAction, reason: ModerationReason | null): ManagementError | null {
  if (requiresReason(action)) {
    if (reason === null) return 'motivo-obrigatorio'
    return (MODERATION_REASON_LIST as readonly string[]).includes(reason) ? null : 'motivo-invalido'
  }
  return reason === null ? null : 'motivo-proibido'
}

/** Within 14 days of the removal or the ban. */
export function canAppeal(atIso: string, now: Date): boolean {
  const passed = now.getTime() - new Date(atIso).getTime()
  return passed >= 0 && passed <= APPEAL_WINDOW_DAYS * 86_400_000
}

/** How much of the window is left, in whole days (so the screen can say "you can still appeal for 9 days"). */
export function daysLeftToAppeal(atIso: string, now: Date): number {
  const remains = APPEAL_WINDOW_DAYS * 86_400_000 - (now.getTime() - new Date(atIso).getTime())
  return Math.max(0, Math.ceil(remains / 86_400_000))
}

/** Who decides the appeal: the owner, if the actor was a moderator; the relay administration in the other cases. */
export function whoDecidesAppeal(whoActed: ModerationLog['por']): 'dono' | 'rele' {
  return whoActed === 'moderador' ? 'dono' : 'rele'
}

/** The queue, heaviest to lightest, then most recent. It hides nothing and removes nothing. */
export function sortQueue(items: QueuedReport[]): QueuedReport[] {
  return [...items].sort((a, b) => b.peso - a.peso || (a.ultimaEm < b.ultimaEm ? 1 : a.ultimaEm > b.ultimaEm ? -1 : a.alvo.localeCompare(b.alvo)))
}

/** The most cited reason of a report (for the queue card title). */
export function mainReason(d: Pick<QueuedReport, 'motivos'>): string | null {
  let best: string | null = null
  let n = 0
  for (const [m, q] of Object.entries(d.motivos)) {
    if ((q ?? 0) > n) {
      best = m
      n = q ?? 0
    }
  }
  return best
}
