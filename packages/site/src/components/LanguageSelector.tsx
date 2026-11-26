'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { LOCALES, META, type Locale } from '@/lib/i18n-base'
import { IcGlobe } from './Icons'

export default function LanguageSelector({ lang, rotulo: label, pendente: pending }: { lang: string; rotulo: string; pendente: string }) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const ref = useRef<HTMLDetailsElement>(null)
  const rest = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || ''
  const suffix = search ? `?${search}` : ''

  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (!ref.current?.open) return
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') ref.current.open = false
        return
      }
      if (!ref.current.contains(e.target as Node)) ref.current.open = false
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', close)
    }
  }, [])

  return (
    <details className="menu" ref={ref}>
      <summary className="icon-btn" aria-label={`${label}: ${META[lang as Locale].native}`} title={label}>
        <IcGlobe />
      </summary>
      <ul className="menu-list" aria-label={label} style={{ maxHeight: 360, overflowY: 'auto' }}>
        {LOCALES.map((l) =>
          META[l].pronto ? (
            <li key={l}>
              <Link href={`/${l}${rest}${suffix}`} hrefLang={META[l].html} lang={META[l].html} aria-current={l === lang ? 'true' : undefined} style={l === lang ? { color: 'var(--acao)' } : undefined}>
                {META[l].native}
              </Link>
            </li>
          ) : (
            <li key={l}>
              <span role="link" aria-disabled="true" lang={META[l].html} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, minHeight: 44, alignItems: 'center', padding: '0 12px', color: 'var(--tinta-3)', fontWeight: 700, fontSize: 16 }}>
                {META[l].native}
                <small style={{ fontWeight: 400 }}>{pending}</small>
              </span>
            </li>
          ),
        )}
      </ul>
    </details>
  )
}
