import 'server-only'
// The folgali server vault: sessions (encrypted Rovemark tokens, never in the browser) and what each person connected
// (rovers and outside agents), which the Account Center asks about. A JSON file with permission 600 in FOLGALI_DATA_DIR
// (default `.folgali-dados/`, outside git). One process alone writes, and each write saves the whole file atomically.
import '@/lib/legacy-env'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { openAction, seal } from './login'

export interface Session {
  pessoa: string
  nome: string
  /** tokens sealed with the session secret */
  fichas: string
  /** when the access token expires (ms) */
  venceEm: number
  criadaEm: number
}

export interface Linked {
  id: string
  tipo: 'rover' | 'agente'
  nome: string
  origem?: string
  /** the @ on folgali, for the link to the profile (rovers of the Rover Hangar and claimed agents) */
  handle?: string
  ligadoEm: string
}

/**
 * The acceptance on the first sign-in screen (requested by Lex, 4.1): the Terms version, when, and that the person declared being 18 or older.
 * When the version changes with a relevant change, the screen appears again (TERMS_VERSION).
 */
export interface Consent {
  versao: string
  data: string
  maior: true
}

/**
 * The person's choices the server keeps (Lex 4.3 and 5-A): 18+ content and opposition to AI training. Rovemark decision of
 * 2026-11-25 (the last one of the day, which undoes the morning's "on by default"): 18+ OFF by default; whoever wants to see it turns it on in
 * Settings > Privacy, confirming again that they are 18 or older. Training allowed by default, with the opposition in the same place
 * (LGPD art. 18, GDPR art. 21), never on the sign-in path.
 */
export interface Preferences {
  adulto: boolean
  semTreino: boolean
}

/**
 * What is kept on disk. Records written while 18+ was on by default may carry `adultChosen: true`; it no longer changes anything:
 * every stored `adulto` is a choice the person made (the old sign-in box, or the settings page), so it is kept as it is.
 */
type StoredPreferences = Preferences & { adultChosen?: true }

export const TERMS_VERSION = 'folgali-termos-1.0'

interface Data {
  sessoes: Record<string, Session>
  ligados: Record<string, Linked[]>
  aceites: Record<string, Consent>
  preferencias: Record<string, StoredPreferences>
}

const empty = (): Data => ({ sessoes: {}, ligados: {}, aceites: {}, preferencias: {} })
// The memory follows the file: Next bundles route handlers, pages and server actions apart, each with its own copy of this module,
// so a copy that cached the file before another one wrote (the Terms accepted in a server action, read by an API route) would
// answer with stale data. Every read compares the file's modification time and size, and reloads when they changed.
let memory: { dir: string; dados: Data; marca: string } | null = null
const markOf = (file: string): string => {
  try {
    const st = statSync(file)
    return `${st.mtimeMs}:${st.size}`
  } catch {
    return 'sem-arquivo'
  }
}

const dataDir = (env = process.env) => env.FOLGALI_DATA_DIR || join(process.cwd(), '.folgali-dados')

function load(): Data {
  const dir = dataDir()
  const brand = markOf(join(dir, 'cofre.json'))
  if (memory && memory.dir === dir && memory.marca === brand) return memory.dados
  let data = empty()
  try {
    const rawValue = JSON.parse(readFileSync(join(dir, 'cofre.json'), 'utf8')) as Partial<Data>
    data = { sessoes: rawValue.sessoes ?? {}, ligados: rawValue.ligados ?? {}, aceites: rawValue.aceites ?? {}, preferencias: rawValue.preferencias ?? {} }
  } catch {
    /* primeiro uso */
  }
  memory = { dir, dados: data, marca: brand }
  return data
}

function write(d: Data) {
  const dir = dataDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = join(dir, `cofre.${process.pid}.tmp`)
  writeFileSync(tmp, JSON.stringify(d), { mode: 0o600 })
  renameSync(tmp, join(dir, 'cofre.json'))
  if (memory && memory.dir === dir) memory = { dir, dados: d, marca: markOf(join(dir, 'cofre.json')) }
}

export type StoredTokens = { at: string; rt: string }

export const newSid = () => randomBytes(24).toString('base64url')

export function saveSession(sid: string, s: { pessoa: string; nome: string; fichas: StoredTokens; venceEm: number }, secret: string) {
  const d = load()
  const old = d.sessoes[sid]
  d.sessoes[sid] = { pessoa: s.pessoa, nome: s.nome, fichas: seal(s.fichas, secret, 'fichas'), venceEm: s.venceEm, criadaEm: old?.criadaEm ?? Date.now() }
  write(d)
}

export function readSession(sid: string): Session | null {
  return load().sessoes[sid] ?? null
}

export const tokensOf = (s: Session, secret: string) => openAction<StoredTokens>(s.fichas, secret, 'fichas')

export function deleteSession(sid: string) {
  const d = load()
  if (!d.sessoes[sid]) return
  delete d.sessoes[sid]
  write(d)
}

/** Deletes everything about the person: sessions and what they connected (Rovemark account deleted). */
export function deletePerson(person: string): number {
  const d = load()
  let n = 0
  for (const [sid, s] of Object.entries(d.sessoes)) {
    if (s.pessoa !== person) continue
    delete d.sessoes[sid]
    n++
  }
  if (d.ligados[person]) {
    delete d.ligados[person]
    n++
  }
  if (d.aceites[person]) {
    delete d.aceites[person]
    n++
  }
  if (d.preferencias[person]) {
    delete d.preferencias[person]
    n++
  }
  write(d)
  return n
}

/** The person's current acceptance, or null if they never accepted or accepted an earlier version of the Terms. */
export function consentOf(person: string): Consent | null {
  const a = load().aceites[person]
  return a && a.versao === TERMS_VERSION ? a : null
}

export function recordConsent(person: string, now = new Date()): Consent {
  const d = load()
  const a: Consent = { versao: TERMS_VERSION, data: now.toISOString(), maior: true }
  d.aceites[person] = a
  write(d)
  return a
}

/** The defaults: 18+ content hidden, AI training allowed (the person can object). */
export const DEFAULT_PREFERENCES: Preferences = Object.freeze({ adulto: false, semTreino: false })

/** The effective choices from what is stored: +18 only for whoever accepted the Terms declaring 18+ and turned it on. */
function effective(person: string, stored: StoredPreferences | undefined): Preferences {
  const adult = consentOf(person) !== null
  return {
    adulto: adult && (stored?.adulto ?? DEFAULT_PREFERENCES.adulto) === true,
    semTreino: stored?.semTreino ?? DEFAULT_PREFERENCES.semTreino,
  }
}

export const preferencesOf = (person: string): Preferences => effective(person, load().preferencias[person])

/** Turning 18+ on (it was off and the person asks for it) needs the age confirmed again, on the same form. */
export const needsAdultConfirmation = (current: Preferences, wantsAdult: boolean | undefined): boolean => wantsAdult === true && !current.adulto

/**
 * Saves the choices (Settings > Privacy). 18+ content only stays on for those who accepted the Terms declaring 18+, and it only
 * turns on when the person confirms again that they are 18 or older (`confirmaMaior`). Without the confirmation, 18+ stays as it was.
 */
export function savePreferences(person: string, p: Partial<Preferences> & { confirmaMaior?: boolean }): Preferences {
  const d = load()
  const current = effective(person, d.preferencias[person])
  const canTurnOn = consentOf(person) !== null && (!needsAdultConfirmation(current, p.adulto) || p.confirmaMaior === true)
  const stored: StoredPreferences = {
    adulto: p.adulto === undefined ? current.adulto : p.adulto === true ? canTurnOn : false,
    semTreino: p.semTreino === undefined ? current.semTreino : p.semTreino === true,
  }
  d.preferencias[person] = stored
  write(d)
  return effective(person, stored)
}

export const linkedOf = (person: string): Linked[] => load().ligados[person] ?? []

export function enable(person: string, item: Linked) {
  const d = load()
  const list = (d.ligados[person] ?? []).filter((x) => !(x.tipo === item.tipo && x.id === item.id))
  d.ligados[person] = [...list, item].slice(-200)
  write(d)
}

/** Origin of the rovers that the Rover Hangar sends through Rovemark (`POST /api/rovemark/hangar-rovers`). */
export const HANGAR_ORIGIN = 'Rover Hangar'

/**
 * The COMPLETE list of the person's Rover Hangar rovers on folgali replaces the previous one. Outside agents stay untouched, and
 * a rover that was already on the list keeps its `ligadoEm`. Returns how many rovers the person has now.
 */
export function setHangarRovers(person: string, rovers: { uid: string; handle: string; name: string }[], now = new Date()): number {
  const d = load()
  const before = d.ligados[person] ?? []
  const since = new Map(before.filter((x) => x.tipo === 'rover').map((x) => [x.id, x.ligadoEm]))
  const others = before.filter((x) => x.tipo !== 'rover')
  const newItems: Linked[] = rovers.map((r) => ({ id: r.uid, tipo: 'rover', nome: r.name, handle: r.handle, origem: HANGAR_ORIGIN, ligadoEm: since.get(r.uid) ?? now.toISOString() }))
  if (!newItems.length && !others.length) delete d.ligados[person]
  else d.ligados[person] = [...others, ...newItems].slice(-200)
  write(d)
  return newItems.length
}

export function unlink(person: string, type: Linked['tipo'], id: string): boolean {
  const d = load()
  const before = d.ligados[person] ?? []
  const after = before.filter((x) => !(x.tipo === type && x.id === id))
  if (after.length === before.length) return false
  d.ligados[person] = after
  write(d)
  return true
}

/** Tests only: forgets what is in memory (the next use rereads the file from the current folder). */
export function _forget() {
  memory = null
}
