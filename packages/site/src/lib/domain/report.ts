// Reporting without identifying anyone. What leaves the client has only the target and the reason (as in the protocol). This site creates no
// visitor identifier (no cookie, no address fingerprint): whoever reports is not counted, nor repeated, nor
// tracked. The brake against mass reporting is GLOBAL (all visitors together) and per target, never per person.
// On the real network, whoever reports is a rover, and the relay keeps only a pseudonym of it (protocol, report section).

import { REPORT_REASON_LIST, type ReportEntry, type ReportMotive } from '../types'
import { isObjectId } from './ids'

export interface ValidReport {
  alvo: string
  motivo: ReportMotive
}

export type ReportResult = { ok: true; denuncia: ValidReport } | { ok: false; erro: 'alvo' | 'motivo' }

export function validateReport(e: ReportEntry): ReportResult {
  if (!isObjectId(e.alvo)) return { ok: false, erro: 'alvo' }
  if (!(REPORT_REASON_LIST as readonly string[]).includes(e.motivo)) return { ok: false, erro: 'motivo' }
  return { ok: true, denuncia: { alvo: e.alvo, motivo: e.motivo } }
}

/** The body that travels to the relay: only these two fields, never anything about who sent it. */
export function reportBody(d: ValidReport): { alvo: string; motivo: ReportMotive } {
  return { alvo: d.alvo, motivo: d.motivo }
}

export interface ReportRecord extends ValidReport {
  em: string
}

/** How many reports the ledger accepts per hour, summing all visitors (against mass reporting, without knowing who is who). */
export const GLOBAL_CAP_PER_HOUR = 120
/** How many reports a single target receives in the ledger; past that, moderation already has what it needs to look. */
export const CAP_PER_TARGET = 25

export class ReportLedger {
  private readonly perTarget = new Map<string, ReportRecord[]>()
  private horas: number[] = []

  /** `nova` or `limite`. No data about who sent it arrives here, so there is no `repetida`. */
  receive(d: ValidReport, now: Date): 'nova' | 'limite' {
    this.horas = this.horas.filter((t) => now.getTime() - t < 3_600_000)
    const ofTarget = this.perTarget.get(d.alvo) ?? []
    if (this.horas.length >= GLOBAL_CAP_PER_HOUR || ofTarget.length >= CAP_PER_TARGET) return 'limite'
    this.perTarget.set(d.alvo, [...ofTarget, { ...d, em: now.toISOString() }])
    this.horas.push(now.getTime())
    return 'nova'
  }

  total(target: string): number {
    return this.perTarget.get(target)?.length ?? 0
  }

  /** For moderation: the content of the reports, with no clue of who made them (no clue is stored). */
  forModeration(target: string): ReportRecord[] {
    return [...(this.perTarget.get(target) ?? [])]
  }
}
