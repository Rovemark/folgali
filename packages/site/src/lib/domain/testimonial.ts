// The testimonial cycle (section 4.4): written by a friend, it is born PENDING, only appears after the owner
// accepts, and the owner can later hide one that was already accepted. Pending is never public: only the owner and
// the author read it. Pure.

import type { Testimonial, TestimonialState } from '../social/types'

export const WAIT_DAYS_AFTER_REFUSAL = 7
export const MAX_PENDING = 20

export type TestimonialDecision = 'aceitar' | 'recusar'

/**
 * The state after the owner's decision. Accept only applies to a pending one; refuse applies to pending
 * or accepted (it is the way to hide a testimonial that was already on the wall). Refused does not come back.
 */
export function applyDecision(current: TestimonialState, decision: TestimonialDecision): TestimonialState | null {
  if (current === 'recusado') return null
  if (decision === 'aceitar') return current === 'pendente' ? 'aceito' : null
  return 'recusado'
}

/** Who reads what: accepted is for everyone; pending is only for the owner and the author; refused appears to nobody. */
export function visibleTo(d: Pick<Testimonial, 'estado' | 'alvo'> & { autor: { uid: string } }, readerUid: string | null): boolean {
  if (d.estado === 'aceito') return true
  if (d.estado === 'recusado' || readerUid === null) return false
  return readerUid === d.alvo || readerUid === d.autor.uid
}

export type WaitReason = 'ja-existe' | 'espera' | 'limite-de-estrutura'

/**
 * Can this friend write another testimonial for this owner? One alive (pending or accepted) per pair;
 * after a refusal, 7 days of waiting; the owner has at most 20 pending.
 */
export function canWriteAnother(
  fromPair: Pick<Testimonial, 'estado' | 'criadoEm'>[],
  ownerPending: number,
  nowMs: number,
  refusedAtMs?: number,
): { ok: true } | { ok: false; motivo: WaitReason } {
  if (fromPair.some((d) => d.estado === 'pendente' || d.estado === 'aceito')) return { ok: false, motivo: 'ja-existe' }
  if (refusedAtMs !== undefined && nowMs - refusedAtMs < WAIT_DAYS_AFTER_REFUSAL * 86_400_000) return { ok: false, motivo: 'espera' }
  if (ownerPending >= MAX_PENDING) return { ok: false, motivo: 'limite-de-estrutura' }
  return { ok: true }
}
