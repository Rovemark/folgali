// Time zones for events, with no library: an IANA zone is checked by its shape and by Intl, and a wall clock time in a zone becomes
// the protocol instant (seconds, UTC) and back. Light on purpose: it runs in the browser (the form) and on the server (the cards).

const ZONE_RE = /^(?:UTC|[A-Za-z][A-Za-z0-9_+-]{1,13}(?:\/[A-Za-z][A-Za-z0-9_+-]{1,13}){1,2})$/

/** An IANA time zone this runtime knows ("America/Sao_Paulo", "UTC"). Same rule as the protocol (`ehFuso`). */
export function isZone(v: unknown): v is string {
  if (typeof v !== 'string' || !ZONE_RE.test(v)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v })
    return true
  } catch {
    return false
  }
}

/** The zone of this browser (or server), or UTC when it says none the protocol takes. */
export function localZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isZone(z) ? z : 'UTC'
  } catch {
    return 'UTC'
  }
}

/** The zones a person may pick: the runtime's list when it has one, always with the given ones and UTC. */
export function zoneList(...keep: string[]): string[] {
  let all: string[] = []
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    all = f ? f('timeZone') : []
  } catch {
    all = []
  }
  return [...new Set([...keep.filter(isZone), 'UTC', ...all.filter(isZone)])].sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)))
}

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function wallClockOf(ms: number, zone: string): WallClock & { second: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') }
}

/** How far the zone's wall clock is ahead of UTC at that instant, in ms. */
function offsetMs(ms: number, zone: string): number {
  const w = wallClockOf(ms, zone)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{2}):(\d{2})$/

/**
 * "2026-12-05" and "20:00" in "America/Sao_Paulo" as the protocol instant (seconds, UTC), or null when the date or time is not one.
 * A wall time that does not exist (the hour skipped when clocks move forward) lands on the instant right after the gap.
 */
export function zonedToInstant(date: string, time: string, zone: string): number | null {
  const d = DATE_RE.exec(date)
  const t = TIME_RE.exec(time)
  if (!d || !t || !isZone(zone)) return null
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])]
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null
  const guess = Date.UTC(y, mo - 1, da, h, mi)
  const check = new Date(guess)
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) return null
  const a = guess - offsetMs(guess, zone)
  const b = guess - offsetMs(a, zone)
  const shows = (ms: number) => {
    const w = wallClockOf(ms, zone)
    return w.year === y && w.month === mo && w.day === da && w.hour === h && w.minute === mi
  }
  // the candidate whose wall clock reads what was asked; in a gap neither does, and the later one is right after it
  const ms = shows(b) ? b : shows(a) ? a : Math.max(a, b)
  return Math.floor(ms / 1000)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The instant as the date and time fields of a form in that zone: { date: "2026-12-05", time: "20:00" }. */
export function instantToZoned(s: number, zone: string): { date: string; time: string } {
  const w = wallClockOf(s * 1000, isZone(zone) ? zone : 'UTC')
  return { date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, time: `${pad(w.hour)}:${pad(w.minute)}` }
}

/** The calendar day of an instant in a zone ("2026-12-05"), to compare days. */
export function dayIn(s: number, zone: string): string {
  return instantToZoned(s, zone).date
}
