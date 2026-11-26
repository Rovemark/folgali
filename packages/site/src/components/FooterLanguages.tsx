'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { META, READY, type Locale } from '@/lib/i18n-base'
import { IcGlobe } from './Icons'

/**
 * The footer language picker: a compact button (globe + current language) that opens the list upward. Native <details>, so it
 * works without JavaScript; with it, Escape and a click outside close it. Each link swaps only the language prefix, so the
 * person stays on the same page.
 */
export default function FooterLanguages({ lang, rotulo: label }: { lang: string; rotulo: string }) {
  const pathname = usePathname()
  const ref = useRef<HTMLDetailsElement>(null)
  const rest = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || ''

  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const d = ref.current
      if (!d?.open) return
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') {
          d.open = false
          d.querySelector('summary')?.focus()
        }
        return
      }
      if (!d.contains(e.target as Node)) d.open = false
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', close)
    }
  }, [])

  return (
    <details className="footer-language" ref={ref}>
      <summary aria-label={`${label}: ${META[lang as Locale].native}`}>
        <IcGlobe className="footer-language-globe" />
        <span lang={META[lang as Locale].html}>{META[lang as Locale].native}</span>
        <svg className="footer-language-arrow" viewBox="0 0 12 12" width="12" height="12" aria-hidden focusable="false">
          <path d="M3 7.5 6 4.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <ul className="footer-language-list" aria-label={label}>
        {READY.map((l) => (
          <li key={l}>
            <Link href={`/${l}${rest}`} hrefLang={META[l].html} lang={META[l].html} aria-current={l === lang ? 'true' : undefined}>
              {META[l].native}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}
