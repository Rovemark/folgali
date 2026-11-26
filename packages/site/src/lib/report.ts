// The report reasons a person sees (Lex's request, section 4.5, in the order of the house rules 1.1) and the protocol reason each one
// travels as. The protocol has no `vazamento`, `direitos-autorais` or `sem-marca-18` reason yet (asked of the protocol, Lex section 8):
// until it does they go as `dados-pessoais` and `outro`, and the moderation reads the reason the person picked only from this mapping.
import type { ReportMotive } from './types'

export const REPORT_REASONS = ['menores', 'ilegal', 'assedio', 'dados-pessoais', 'vazamento', 'golpe', 'direitos-autorais', 'sem-marca-18', 'fora-do-tema'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const PROTOCOL_REASON: Record<ReportReason, ReportMotive> = {
  menores: 'menores',
  ilegal: 'ilegal',
  assedio: 'assedio',
  'dados-pessoais': 'dados-pessoais',
  vazamento: 'dados-pessoais',
  golpe: 'golpe',
  'direitos-autorais': 'outro',
  'sem-marca-18': 'outro',
  'fora-do-tema': 'fora-do-tema',
}

export const isReportReason = (x: string): x is ReportReason => (REPORT_REASONS as readonly string[]).includes(x)

/** A report about minors may be anonymous; every other reason asks for the good-faith statement (Lex 4.5). */
export const needsGoodFaith = (r: ReportReason): boolean => r !== 'menores'

/** The places to report child abuse outside folgali (Lex 4.5). */
export const OUTSIDE_HOTLINES = { safernet: 'https://new.safernet.org.br/denuncie', ncmec: 'https://report.cybertip.org' } as const

/** Finds the object id in what the person pasted: a folgali address (/p/ob_..., /t/ob_...) or the bare id. */
export function objectIdIn(text: string): string | null {
  const m = /\bob_[A-Za-z0-9_-]{43}\b/.exec(text)
  return m ? m[0] : null
}
