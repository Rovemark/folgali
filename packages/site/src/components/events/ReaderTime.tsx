'use client'

// The event's time in the reader's own zone, only when it differs from the organizer's. The server does not know the reader's zone:
// its snapshot is "none", so the server and the browser agree on the first paint and the line appears once the browser hydrates.
import { useSyncExternalStore } from 'react'
import { IcInfo } from '@/components/folgali/Icons'
import { whenText } from '@/lib/events/dates'
import { localZone } from '@/lib/events/timezone'
import { fmt, type Ready } from '@/lib/i18n-base'

/** How far a zone's clock is from UTC at an instant, in minutes. */
function offsetMin(s: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(s * 1000))
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - Math.floor(s / 60) * 60_000) / 60_000)
}

const noSubscription = () => () => {}

export default function ReaderTime({ inicio: home, fim: end, fuso: timezone, lang, label, until, className = 'ev-meta evr-reader' }: { inicio: number; fim: number | null; fuso: string; lang: Ready; label: string; until: string; className?: string }) {
  const mine = useSyncExternalStore(noSubscription, localZone, () => null)
  let text: string | null = null
  if (mine) {
    try {
      if (mine !== timezone && offsetMin(home, mine) !== offsetMin(home, timezone)) text = fmt(label, { quando: whenText(home, end, mine, lang, until) })
    } catch {
      // a zone this browser cannot format: the organizer's time stays alone
    }
  }
  if (!text) return null
  return (
    <p className={className}>
      <IcInfo aria-hidden />
      <span>{text}</span>
    </p>
  )
}
