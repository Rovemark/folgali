// Cleaning what the relay says about events before any of it reaches a screen. Same rules as the rest of the social side
// (src/lib/social/sanitize-social.ts): the shape is checked, enums are closed, ids have the protocol's form, numbers become integers,
// text loses the invisible and is cut at the protocol's limit, lists have a ceiling, an unknown field is dropped. A list item with
// the wrong shape is left out instead of taking the whole list down. The relay's messages never come here.
import { galleryCover } from '@/lib/folgali/gallery'
import { isObjectId } from '../domain/ids'
import { obj, roverSummary, txt } from '../social/sanitize-social'
import { NetworkError } from '../types'
import { isZone } from './timezone'
import { DEFAULT_LIMITS, isRsvp, type Attendee, type EventCard, type EventDetail, type EventLimits, type EventPage } from './types'

const STRANGE = () => new NetworkError('indisponivel', 'resposta do relé fora do contrato')

/** Instants the protocol accepts (packages/protocol/src/events.js). */
const MIN_S = 1_700_000_000
const MAX_S = 4_102_444_800
const instant = (x: unknown): number => {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < MIN_S || x > MAX_S) throw STRANGE()
  return x
}
const instantOrNull = (x: unknown): number | null => (x === null || x === undefined ? null : instant(x))
const optionalInstant = (x: unknown): number | undefined => (typeof x === 'number' && Number.isInteger(x) && x >= MIN_S && x <= MAX_S ? x : undefined)
const count = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(Math.floor(x), 10_000_000) : 0)
const countOrNull = (x: unknown): number | null => (x === null || x === undefined ? null : typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(Math.floor(x), 10_000_000) : null)
const id = (x: unknown): string => {
  if (!isObjectId(x)) throw STRANGE()
  return x as string
}
/** One line, no page markup signs. */
const line = (x: unknown, max: number): string => txt(x, max).replace(/[<>]/g, '')

/** The card of one event (`Cartao`). Throws when the shape is not the contract's. */
export function eventCard(x: unknown): EventCard {
  const o = obj(x)
  const using = o.comunidade === null || o.comunidade === undefined ? null : obj(o.comunidade)
  const cover = o.capa === null || o.capa === undefined ? null : obj(o.capa)
  const c = o.contagens === undefined || o.contagens === null ? {} : obj(o.contagens)
  const online = o.online === true
  const place = o.lugar === null || o.lugar === undefined ? null : line(o.lugar, DEFAULT_LIMITS.lugarCaracteres)
  const home = instant(o.inicio)
  const end = instantOrNull(o.fim)
  const state = o.estado === 'cancelado' ? 'cancelado' : o.estado === 'ativo' ? 'ativo' : null
  if (!state) throw STRANGE()
  const editedAt = optionalInstant(o.editadoEm)
  const cancelledAt = optionalInstant(o.canceladoEm)
  return {
    id: id(o.id),
    organizador: roverSummary(o.organizador),
    comunidade: using ? { id: id(using.id), nome: line(using.nome, 80) } : null,
    titulo: line(o.titulo, DEFAULT_LIMITS.tituloCaracteres),
    descricao: o.descricao === undefined || o.descricao === null ? '' : txt(o.descricao, DEFAULT_LIMITS.descricaoCaracteres, true),
    inicio: home,
    fim: end !== null && end > home ? end : null,
    fuso: isZone(o.fuso) ? o.fuso : 'UTC',
    online,
    lugar: place || null,
    capa: cover && galleryCover(cover.galeria) ? (cover.galeria as string) : null,
    vagas: countOrNull(o.vagas),
    vagasRestantes: countOrNull(o.vagasRestantes),
    estado: state,
    encerrado: o.encerrado === true || state === 'cancelado',
    criadoEm: optionalInstant(o.criadoEm) ?? home,
    editado: o.editado === true,
    ...(editedAt !== undefined ? { editadoEm: editedAt } : {}),
    ...(cancelledAt !== undefined ? { canceladoEm: cancelledAt } : {}),
    ...(o.adulto === true ? { adulto: true as const } : {}),
    contagens: { vou: count(c.vou), talvez: count(c.talvez), naoVou: count(c.naoVou) },
    minhaPresenca: isRsvp(o.minhaPresenca) ? o.minhaPresenca : null,
  }
}

/** One event with its number of versions (`GET /v1/eventos/:id`). The signed envelope is not kept: the screen shows the card. */
export function eventDetail(x: unknown): EventDetail {
  const o = obj(x)
  return { ...eventCard(o), versoes: Math.max(1, count(o.versoes)) }
}

const next = (x: unknown): string | undefined => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? String(x) : typeof x === 'string' && /^\d{1,16}$/.test(x) ? x : undefined)

/** A page of `{ itens, proximo }`: at most `ceiling` items, the ones with the wrong shape left out. */
function page<T>(x: unknown, item: (v: unknown) => T, ceiling: number): EventPage<T> {
  const o = obj(x)
  if (!Array.isArray(o.itens)) throw STRANGE()
  const items: T[] = []
  for (const v of o.itens.slice(0, ceiling)) {
    try {
      items.push(item(v))
    } catch {
      // a broken item is left out; the rest of the list stays
    }
  }
  const p = next(o.proximo)
  return p === undefined ? { itens: items } : { itens: items, proximo: p }
}

export const eventList = (x: unknown): EventPage<EventCard> => page(x, eventCard, 50)

/** Who answered (`GET /v1/eventos/:id/presencas`). */
export function attendee(x: unknown): Attendee {
  const o = obj(x)
  return { rover: roverSummary(o), em: instant(o.em) }
}
export const attendeeList = (x: unknown): EventPage<Attendee> => page(x, attendee, 100)

/** `info.eventos` and whether `recursos` includes `eventos`, from GET /v1/info. Anything odd falls back to the protocol's limits. */
export function eventsInfo(x: unknown): { on: boolean; limits: EventLimits } {
  const o = typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
  const on = Array.isArray(o.recursos) && o.recursos.includes('eventos')
  const e = typeof o.eventos === 'object' && o.eventos !== null ? (o.eventos as Record<string, unknown>) : {}
  const limits = { ...DEFAULT_LIMITS }
  for (const k of Object.keys(DEFAULT_LIMITS) as (keyof EventLimits)[]) {
    const v = e[k]
    // the relay may say less than the protocol, never more
    if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= DEFAULT_LIMITS[k]) limits[k] = v
  }
  return { on, limits }
}
