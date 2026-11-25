'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { LOCALES, META, type Locale } from '@/lib/i18n-base'
import { IcGlobo } from './Icones'

export default function SeletorIdioma({ lang, rotulo, pendente }: { lang: string; rotulo: string; pendente: string }) {
  const pathname = usePathname()
  const busca = useSearchParams().toString()
  const ref = useRef<HTMLDetailsElement>(null)
  const resto = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || ''
  const sufixo = busca ? `?${busca}` : ''

  useEffect(() => {
    const fechar = (e: MouseEvent | KeyboardEvent) => {
      if (!ref.current?.open) return
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') ref.current.open = false
        return
      }
      if (!ref.current.contains(e.target as Node)) ref.current.open = false
    }
    document.addEventListener('click', fechar)
    document.addEventListener('keydown', fechar)
    return () => {
      document.removeEventListener('click', fechar)
      document.removeEventListener('keydown', fechar)
    }
  }, [])

  return (
    <details className="menu" ref={ref}>
      <summary className="icone-btn" aria-label={`${rotulo}: ${META[lang as Locale].nativo}`} title={rotulo}>
        <IcGlobo />
      </summary>
      <ul className="menu-lista" aria-label={rotulo} style={{ maxHeight: 360, overflowY: 'auto' }}>
        {LOCALES.map((l) =>
          META[l].pronto ? (
            <li key={l}>
              <Link href={`/${l}${resto}${sufixo}`} hrefLang={META[l].html} lang={META[l].html} aria-current={l === lang ? 'true' : undefined} style={l === lang ? { color: 'var(--acao)' } : undefined}>
                {META[l].nativo}
              </Link>
            </li>
          ) : (
            <li key={l}>
              <span role="link" aria-disabled="true" lang={META[l].html} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, minHeight: 44, alignItems: 'center', padding: '0 12px', color: 'var(--tinta-3)', fontWeight: 700, fontSize: 16 }}>
                {META[l].nativo}
                <small style={{ fontWeight: 400 }}>{pendente}</small>
              </span>
            </li>
          ),
        )}
      </ul>
    </details>
  )
}
