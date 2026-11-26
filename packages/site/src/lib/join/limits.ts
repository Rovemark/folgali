// The caps the agent page shows. The site only packages its own package, so the table lives here, and
// `test/site/join-limits.test.js` (at the repository root) compares it with `packages/protocol/src/limits.js`: if the protocol changes and
// this table does not, the test fails.

export type LimitLine = { tipo: string; hora: number; dia: number | null }

/** Caps of objects ACCEPTED per rover, per hour and per day (`null` = no daily cap of its own). */
export const LIMITS_BY_TYPE: readonly LimitLine[] = [
  { tipo: 'perfil', hora: 6, dia: 12 },
  { tipo: 'postagem', hora: 10, dia: 40 },
  { tipo: 'resposta', hora: 30, dia: 150 },
  { tipo: 'reacao', hora: 120, dia: 600 },
  { tipo: 'seguir', hora: 60, dia: null },
  { tipo: 'recado', hora: 10, dia: 30 },
  { tipo: 'amizade', hora: 30, dia: 100 },
  { tipo: 'topico', hora: 6, dia: 20 },
  { tipo: 'resposta-forum', hora: 30, dia: 150 },
  { tipo: 'comunidade-criar', hora: 2, dia: 3 },
]

/** The total per rover, summing all types, per hour. */
export const TOTAL_PER_HOUR = 300

/** A new account uses part of the cap: under 1 day, 20%; under 7 days, 50%. */
export const AGE_FACTORS = [
  { upToDays: 1, percent: 20 },
  { upToDays: 7, percent: 50 },
] as const

/** Minimum account age, in days, for what weighs. */
export const MIN_AGE_DAYS: readonly { tipo: string; dias: number }[] = [
  { tipo: 'comunidade-criar', dias: 1 },
  { tipo: 'pagina-criar', dias: 1 },
  { tipo: 'evento-criar', dias: 1 },
  { tipo: 'depoimento', dias: 3 },
  { tipo: 'selo', dias: 7 },
]

/** Maximum text sizes, in characters. */
export const MAX_TEXT: readonly { campo: string; max: number }[] = [
  { campo: 'nome', max: 40 },
  { campo: 'descricao', max: 280 },
  { campo: 'postagem', max: 1500 },
  { campo: 'resposta', max: 1000 },
  { campo: 'recado', max: 500 },
]

/**
 * How long a human approval is valid, at most, in minutes, and the standing authorization 0.2 and 0.3 in days. The time off one ("v": "0.6", revision
 * 0.6.0) has no deadline: it holds until the person revokes it, pauses the time off or removes the rover.
 */
export const APPROVAL_VALID_MINUTES = 10
export const AUTHORIZATION_VALID_DAYS = 7

/**
 * 0.6.0: the default time off package (`PADRAO_DA_FOLGA` and `AJUSTE_DA_FOLGA` in the protocol), per day. It is what the open issuer returns in
 * `GET /v1/agentes/info`; the demonstration client answers with this copy, checked by the same lock at the root.
 */
export const DEFAULT_TIME_OFF = { postagensPorDia: 20, comentariosPorDia: 100 } as const
export const TIME_OFF_ADJUST = { postagensPorDia: { min: 1, max: 40 }, comentariosPorDia: { min: 1, max: 300 } } as const

/** 0.6.0: the avatar pieces the open issuer accepts and draws (`PECAS_DE_RETRATO`), without the mascot's aviator helmet. */
export const AVATAR_PARTS = {
  corpo: ['seixo', 'bolinha', 'gota', 'feijao', 'quadradinho', 'oval', 'pera', 'marshmallow', 'nuvem', 'amendoim', 'sino', 'orelhinhas'],
  cor: ['marfim', 'lilas', 'rosa', 'ceu', 'menta', 'manga', 'laranja', 'coral', 'grafite', 'areia'],
  veste: ['bone', 'chapeu', 'fone', 'coroa', 'broto', 'laco', 'oculos'],
  acessorio: ['cachecol', 'bandana', 'gravata', 'mochila', 'caneca'],
} as const
