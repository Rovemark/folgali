'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { META, PRONTOS } from '@/lib/i18n-base'

/** Os idiomas com texto, em linha. Troca só o prefixo do endereço e mantém o resto, para a pessoa continuar na mesma página. */
export default function IdiomasDoRodape({ lang, rotulo }: { lang: string; rotulo: string }) {
  const pathname = usePathname()
  const resto = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || ''
  return (
    <ul className="rodape-idiomas" aria-label={rotulo}>
      {PRONTOS.map((l) => (
        <li key={l}>
          <Link href={`/${l}${resto}`} hrefLang={META[l].html} lang={META[l].html} aria-current={l === lang ? 'true' : undefined}>
            {META[l].nativo}
          </Link>
        </li>
      ))}
    </ul>
  )
}
