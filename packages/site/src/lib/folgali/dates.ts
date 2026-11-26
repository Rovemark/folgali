import { META, type Ready } from '@/lib/i18n-base'

// Event dates in the Brasília time zone (the demonstration's), in the page language.
const TIMEZONE = 'America/Sao_Paulo'

/** "SAT 30": the date badge of the event card. */
export function dayBadge(iso: string, lang: Ready): string {
  const d = new Date(iso)
  const without = new Intl.DateTimeFormat(META[lang].html, { weekday: 'short', timeZone: TIMEZONE }).format(d).replace('.', '')
  const day = new Intl.DateTimeFormat(META[lang].html, { day: 'numeric', timeZone: TIMEZONE }).format(d)
  return `${without.toLocaleUpperCase(META[lang].html)} ${day}`
}

/** "20:00": the event time. */
export function eventHour(iso: string, lang: Ready): string {
  return new Intl.DateTimeFormat(META[lang].html, { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE }).format(new Date(iso))
}

/** Is the event today (in the Brasília time zone)? */
export function isToday(iso: string, now: Date): boolean {
  const f = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(x)
  return f(new Date(iso)) === f(now)
}
