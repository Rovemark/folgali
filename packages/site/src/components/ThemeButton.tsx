'use client'

import { useSyncExternalStore } from 'react'
import { IcMoon, IcSun } from './Icons'
import { switchWithCircle } from './life/movement'

function signBytes(notice: () => void) {
  const o = new MutationObserver(notice)
  o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
  return () => o.disconnect()
}
const readDark = () => document.documentElement.dataset.tema === 'escuro'

/** Whether the page is in the dark theme right now (follows `data-tema` on <html>). */
export const useDarkTheme = (): boolean => useSyncExternalStore(signBytes, readDark, () => false)

/** Switches the theme from a click: the new theme opens in a circle from the pointer (or the control) and is remembered. */
export function toggleTheme(e: React.MouseEvent<HTMLElement>, dark: boolean) {
  const newValue = !dark
  // the new theme opens in a circle from the button (View Transitions); without the API or with reduced motion, it swaps at once
  const r = e.currentTarget.getBoundingClientRect()
  switchWithCircle(e.detail ? { x: e.clientX, y: e.clientY } : { x: r.left + r.width / 2, y: r.top + r.height / 2 }, () => {
    document.documentElement.dataset.tema = newValue ? 'escuro' : 'claro'
  })
  try {
    localStorage.setItem('rn-tema', newValue ? 'escuro' : 'claro')
  } catch {
    /* no storage: it only holds for this visit */
  }
}

export default function ThemeButton({ darkLabel, lightLabel }: { darkLabel: string; lightLabel: string }) {
  const dark = useDarkTheme()
  return (
    <button type="button" className="icon-btn life-theme" onClick={(e) => toggleTheme(e, dark)} aria-label={dark ? lightLabel : darkLabel} title={dark ? lightLabel : darkLabel}>
      {dark ? <IcSun /> : <IcMoon />}
    </button>
  )
}
