'use client'

import { toggleTheme, useDarkTheme } from './ThemeButton'
import { IcMoon, IcSun } from './Icons'

/** The footer theme control: a small switch whose knob shows the current theme (sun or moon). `aria-checked` says whether dark is on. */
export default function ThemeSwitch({ rotulo: label }: { rotulo: string }) {
  const dark = useDarkTheme()
  return (
    <button type="button" role="switch" aria-checked={dark} className="footer-theme" onClick={(e) => toggleTheme(e, dark)} aria-label={label} title={label}>
      <span className="footer-theme-rail" aria-hidden>
        <span className="footer-theme-dot">
          <IcSun className="footer-theme-sun" />
          <IcMoon className="footer-theme-moon" />
        </span>
      </span>
    </button>
  )
}
