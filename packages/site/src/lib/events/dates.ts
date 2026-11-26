// Dates of an event in words, in the page language: in the organizer's time zone (what the event says) and, in the browser, in the
// reader's when the two differ. The range is written with the language's own word ("20:00 até 23:00"), never with a dash.
import { META, fmt, type Ready } from '@/lib/i18n-base'
import { dayIn, isZone } from './timezone'

const zoneOr = (z: string) => (isZone(z) ? z : 'UTC')
const loc = (lang: Ready) => META[lang].html

/** "SÁB 5": the date badge of a card, in the event's zone. */
export function dayBadge(s: number, zone: string, lang: Ready): string {
  const d = new Date(s * 1000)
  const tz = zoneOr(zone)
  const wd = new Intl.DateTimeFormat(loc(lang), { weekday: 'short', timeZone: tz }).format(d).replace('.', '')
  const day = new Intl.DateTimeFormat(loc(lang), { day: 'numeric', timeZone: tz }).format(d)
  return `${wd.toLocaleUpperCase(loc(lang))} ${day}`
}

const dateTime = (s: number, tz: string, lang: Ready, year: boolean) =>
  new Intl.DateTimeFormat(loc(lang), { weekday: 'short', day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(s * 1000))
const timeOnly = (s: number, tz: string, lang: Ready) => new Intl.DateTimeFormat(loc(lang), { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(s * 1000))
const zoneName = (s: number, tz: string, lang: Ready) =>
  new Intl.DateTimeFormat(loc(lang), { timeZoneName: 'short', timeZone: tz }).formatToParts(new Date(s * 1000)).find((p) => p.type === 'timeZoneName')?.value ?? tz

/**
 * When the event happens, in a zone: "sáb., 5 de dez., 20:00 até 23:00 (BRT)". An end on another day writes its date too; the year
 * shows only when it is not this year. `until` is the language's "{inicio} até {fim}".
 */
export function whenText(home: number, endAt: number | null, zone: string, lang: Ready, until: string, now: Date = new Date()): string {
  const tz = zoneOr(zone)
  const year = new Date(home * 1000).getUTCFullYear() !== now.getUTCFullYear()
  const start = dateTime(home, tz, lang, year)
  const end = endAt === null ? null : dayIn(endAt, tz) === dayIn(home, tz) ? timeOnly(endAt, tz, lang) : dateTime(endAt, tz, lang, year)
  const range = end === null ? start : fmt(until, { inicio: start, fim: end })
  return `${range} (${zoneName(home, tz, lang)})`
}

/** The event's end for the rules of the relay: its end, or six hours after the start. */
export const endOf = (e: { inicio: number; fim: number | null }, defaultS = 6 * 3600) => e.fim ?? e.inicio + defaultS

/** Today in the event's own zone, or happening right now. */
export function isToday(e: { inicio: number; fim: number | null; fuso: string }, now: Date = new Date()): boolean {
  const s = Math.floor(now.getTime() / 1000)
  if (e.inicio <= s && s < endOf(e)) return true
  return dayIn(e.inicio, e.fuso) === dayIn(s, e.fuso)
}
