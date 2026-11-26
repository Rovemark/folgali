// The body a person signs to create or edit an event (protocol 0.11.0 part 4, `evento-criar` and `evento-editar`), built from the
// form and checked with the same rules as the relay before anything is signed: title on one line, description, start in the future
// (an edit may keep a start that already passed), end after the start and within the longest duration, a place for an event that
// is not online, at most one link, capacity in range. The relay checks it all again. Light on purpose: it runs in the browser.
import { findLeaks } from '@/lib/leak-detector'
import { parseLinks } from '../domain/social-text'
import { zonedToInstant, isZone } from './timezone'
import { DEFAULT_LIMITS, PLACE_MIN, TITLE_MIN, type EventLimits } from './types'

export interface EventForm {
  titulo: string
  descricao: string
  /** "2026-12-05" and "20:00", in `fuso` */
  inicioData: string
  inicioHora: string
  /** both empty: no end */
  fimData: string
  fimHora: string
  fuso: string
  online: boolean
  /** the place, or the call link of an online event (optional there) */
  lugar: string
  /** a gallery cover id, or '' */
  capa: string
  /** '' is no limit */
  vagas: string
  /** a community id, or '' */
  comunidade: string
  adulto: boolean
}

export type FormProblem =
  | 'titleLength'
  | 'titleLink'
  | 'descLong'
  | 'descLinks'
  | 'markup'
  | 'startMissing'
  | 'startPast'
  | 'startFar'
  | 'endIncomplete'
  | 'endBefore'
  | 'endLong'
  | 'placeMissing'
  | 'placeLength'
  | 'linkBad'
  | 'spotsBad'
  | 'zoneBad'
  | 'leak'

export type FormField = 'titulo' | 'descricao' | 'inicio' | 'fim' | 'lugar' | 'vagas' | 'fuso'
export const FIELD_OF: Record<FormProblem, FormField> = {
  titleLength: 'titulo', titleLink: 'titulo', descLong: 'descricao', descLinks: 'descricao', markup: 'descricao', startMissing: 'inicio', startPast: 'inicio', startFar: 'inicio', endIncomplete: 'fim', endBefore: 'fim',
  endLong: 'fim', placeMissing: 'lugar', placeLength: 'lugar', linkBad: 'lugar', spotsBad: 'vagas', zoneBad: 'fuso', leak: 'descricao',
}

const len = (s: string) => [...s].length
/** NFC, Windows line ends and tabs as the protocol takes them, no spaces at the ends. */
const clean = (s: string) => s.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/\n{4,}/g, '\n\n\n').trim()
/** HTML the protocol refuses in any text (`TAG_HTML`). */
const MARKUP = /<\s*[\/!?a-zA-Z]|&#|&[a-zA-Z]{2,10};/
/** At most `max` links, each one https, with a real domain and no tracker (the same checks as the relay). */
const linksOk = (s: string, max: number) => {
  const a = parseLinks(s, max)
  return !a.rest && a.achados.length === 0
}

/** The content both types carry (everything but `comunidade` / `evento`). */
export type EventContent = {
  titulo: string
  descricao: string
  inicio: number
  fim: number | null
  fuso: string
  online: boolean
  lugar: string | null
  capa: { galeria: string } | null
  vagas: number | null
  adulto?: true
}

export type Checked = { ok: true; content: EventContent } | { ok: false; problems: FormProblem[] }

/**
 * Checks the form and builds the content. `editing` keeps a start that already passed (the relay refuses moving an event into the past,
 * not keeping its start); `keptStart` is the start the event has now.
 */
export function checkForm(f: EventForm, nowS: number, opts: { limits?: EventLimits; keptStart?: number } = {}): Checked {
  const L = opts.limits ?? DEFAULT_LIMITS
  const problems: FormProblem[] = []
  const title = clean(f.titulo)
  const description = clean(f.descricao)
  const placeRaw = clean(f.lugar)
  if (len(title) < TITLE_MIN || len(title) > L.tituloCaracteres || /\n/.test(title)) problems.push('titleLength')
  else if (!linksOk(title, 0)) problems.push('titleLink')
  if (len(description) > L.descricaoCaracteres) problems.push('descLong')
  else if (!linksOk(description, 2)) problems.push('descLinks')
  if (MARKUP.test(`${title}\n${description}\n${placeRaw}`)) problems.push('markup')
  const zoneOk = isZone(f.fuso)
  if (!zoneOk) problems.push('zoneBad')
  const home = zoneOk ? zonedToInstant(f.inicioData, f.inicioHora, f.fuso) : null
  if (home === null) {
    if (zoneOk) problems.push('startMissing')
  } else if (home !== opts.keptStart) {
    if (home < nowS) problems.push('startPast')
    else if (home > nowS + L.antecedenciaMaxS) problems.push('startFar')
  }
  let end: number | null = null
  const anyEnd = f.fimData !== '' || f.fimHora !== ''
  if (anyEnd) {
    end = zoneOk ? zonedToInstant(f.fimData, f.fimHora, f.fuso) : null
    if (end === null) {
      if (zoneOk) problems.push('endIncomplete')
    } else if (home !== null) {
      if (end <= home) problems.push('endBefore')
      else if (end - home > L.duracaoMaxS) problems.push('endLong')
    }
  }
  let place: string | null = null
  if (f.online) {
    // an online event may say its call link (one, https) or nothing
    if (placeRaw !== '') {
      if (!/^https:\/\/\S+$/.test(placeRaw) || !linksOk(placeRaw, 1)) problems.push('linkBad')
      else if (len(placeRaw) > L.lugarCaracteres) problems.push('placeLength')
      place = placeRaw
    }
  } else if (placeRaw === '') {
    problems.push('placeMissing')
  } else {
    if (len(placeRaw) < PLACE_MIN || len(placeRaw) > L.lugarCaracteres || /\n/.test(placeRaw)) problems.push('placeLength')
    else if (!linksOk(placeRaw, 1)) problems.push('linkBad')
    place = placeRaw
  }
  let vagas: number | null = null
  if (f.vagas.trim() !== '') {
    const n = Number(f.vagas.trim())
    if (!Number.isInteger(n) || n < 1 || n > L.vagasMax) problems.push('spotsBad')
    else vagas = n
  }
  if (findLeaks(`${title}\n${description}\n${placeRaw}`).length > 0) problems.push('leak')
  if (problems.length || home === null) return { ok: false, problems: problems.length ? problems : ['startMissing'] }
  return {
    ok: true,
    content: {
      titulo: title,
      descricao: description,
      inicio: home,
      fim: end,
      fuso: f.fuso,
      online: f.online,
      lugar: place,
      capa: f.capa ? { galeria: f.capa } : null,
      vagas,
      ...(f.adulto ? { adulto: true as const } : {}),
    },
  }
}

/** The body of `evento-criar`. */
export const createBody = (c: EventContent, community: string | null) => ({ comunidade: community || null, ...c })
/** The body of `evento-editar`: the whole new content (the community does not change). */
export const editBody = (c: EventContent, event: string) => ({ evento: event, ...c })
