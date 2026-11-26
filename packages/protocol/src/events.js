// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.11.0 (proposal 0013): events. Four object types, all in `"v": "0.3"`:
//
//   evento-criar     the organizer creates: title, description, when (start, optional end, time zone), where (a text, or online),
//                    optional cover from the house gallery, optional capacity, inside a community or on its own
//   evento-editar    the organizer rewrites everything but the community (the whole new content, like `edicao`)
//   evento-cancelar  the organizer calls it off; it does not come back
//   evento-presenca  anyone who can read the event answers: vou, talvez, nao-vou (the new answer replaces the earlier one)
//
// Times are instants (seconds, UTC). `fuso` is the IANA time zone the organizer thinks the event in ("America/Sao_Paulo"): it changes
// nothing in the instants, it only tells a client how to write "sábado, 15h" the way the organizer meant it.
// The place is a line of free text the organizer writes; the network does not check it, map it nor verify the event.
import { COVER_IDS } from './gallery.js'
import { boolean, failure, integer, literal, closedObject, optional, or_null, defaultValue, text, one_of } from './schema.js'

const ID_RE = /^ob_[A-Za-z0-9_-]{43}$/
const id = defaultValue(ID_RE, 'um id de objeto (ob_ e 43 caracteres)')
const instant = integer({ min: 1_700_000_000, max: 4_102_444_800 })
const ADULT = optional(literal(true))

export const FEATURE_EVENTS = 'eventos'
export const EVENT_TYPES = Object.freeze(['evento-criar', 'evento-editar', 'evento-cancelar', 'evento-presenca'])
export const RSVP_ANSWERS = Object.freeze(['vou', 'talvez', 'nao-vou'])
export const EVENT_STATES = Object.freeze(['ativo', 'cancelado'])
export const EVENT_WHENS = Object.freeze(['proximos', 'semana', 'passados'])
export const EVENT_LIMITS = Object.freeze({
  titulo: Object.freeze({ min: 3, max: 100 }),
  descricao: Object.freeze({ min: 0, max: 2000 }),
  lugar: Object.freeze({ min: 2, max: 160 }),
  vagas: Object.freeze({ min: 1, max: 100000 }),
  // how far ahead an event may be set, and how long it may last
  antecedenciaMaxS: 2 * 365 * 86400,
  duracaoMaxS: 30 * 86400,
  // an event without an end counts as over this long after it starts (answers close, it leaves "próximos")
  duracaoPadraoS: 6 * 3600,
  // events not yet over that one organizer may have at the same time
  abertosPorOrganizador: 30,
  edicoesPorEvento: 20
})

const TIMEZONE_RE = /^(?:UTC|[A-Za-z][A-Za-z0-9_+-]{1,13}(?:\/[A-Za-z][A-Za-z0-9_+-]{1,13}){1,2})$/
/** An IANA time zone this runtime knows ("America/Sao_Paulo", "UTC"). The shape is checked first, so nothing odd reaches Intl. */
export function isTimezone(v) {
  if (typeof v !== 'string' || !TIMEZONE_RE.test(v)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v })
    return true
  } catch {
    return false
  }
}
const timezone = (v, path) => (isTimezone(v) ? null : failure(path, 'precisa ser um fuso horário IANA, como America/Sao_Paulo ou UTC'))

const CONTENT = {
  titulo: text({ ...EVENT_LIMITS.titulo, multilinha: false, v3: true }),
  descricao: text({ ...EVENT_LIMITS.descricao, multilinha: true, urls: 2, v3: true }),
  inicio: instant,
  fim: or_null(instant),
  fuso: timezone,
  online: boolean,
  // one link at most: the address of the call of an online event
  lugar: or_null(text({ ...EVENT_LIMITS.lugar, multilinha: false, urls: 1, v3: true })),
  capa: or_null(closedObject({ galeria: one_of(COVER_IDS) })),
  vagas: or_null(integer(EVENT_LIMITS.vagas)),
  adulto: ADULT
}

export const EVENT_BODIES = Object.freeze({
  'evento-criar': closedObject({ comunidade: or_null(id), ...CONTENT }),
  'evento-editar': closedObject({ evento: id, ...CONTENT }),
  'evento-cancelar': closedObject({ evento: id }),
  'evento-presenca': closedObject({ evento: id, resposta: one_of(RSVP_ANSWERS) })
})

/**
 * Cross-field rules of the event types: the end comes after the start and not too long after, an event in a place says the place,
 * and a new event starts in the future, not too far.
 * @returns {{ caminho: string, mensagem: string } | null}
 */
export function eventRules({ tipo: type, criadoEm: createdAt, corpo: body }) {
  if (type !== 'evento-criar' && type !== 'evento-editar') return null
  if (body.fim !== null) {
    if (body.fim <= body.inicio) return failure('objeto.corpo.fim', 'o fim vem depois do começo')
    if (body.fim - body.inicio > EVENT_LIMITS.duracaoMaxS) return failure('objeto.corpo.fim', `um evento dura no máximo ${EVENT_LIMITS.duracaoMaxS / 86400} dias`)
  }
  if (!body.online && body.lugar === null) return failure('objeto.corpo.lugar', 'um evento que não é online diz o lugar')
  if (body.inicio > createdAt + EVENT_LIMITS.antecedenciaMaxS) return failure('objeto.corpo.inicio', 'o evento começa em no máximo 2 anos')
  // (an edit may keep a start that already passed; the relay checks it against the event as it was)
  if (type === 'evento-criar' && body.inicio < createdAt) return failure('objeto.corpo.inicio', 'um evento novo começa no futuro')
  return null
}

/** When the event is over: its end, or the default duration after the start. */
export const eventEnd = ({ inicio: home, fim: end }) => end ?? home + EVENT_LIMITS.duracaoPadraoS
