'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Institutional pages (texts, not product): the beta strip stays off them (Lex's request, section 3). Legal pages show their own notice. */
export const INSTITUTIONAL = [
  '/termos', '/privacidade', '/cookies', '/regras', '/moderacao/politica', '/direitos-autorais', '/idade', '/desenvolvedores', '/responsabilidade-por-agentes',
  '/contato', '/sobre', '/licenca', '/imprensa', '/transparencia', '/governanca', '/seguranca', '/protocolo', '/glossario', '/guias', '/ajuda', '/novidades',
  '/como-funciona', '/denunciar',
]

export const isProductPath = (pathname: string): boolean => {
  const rest = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/'
  return !INSTITUTIONAL.some((p) => rest === p || rest.startsWith(`${p}/`))
}

/** The discreet "folgali is in beta" strip at the top of the product pages, with the link to section 13 of the Terms. */
export default function BetaNotice({ lang, text, more }: { lang: string; text: string; more: string }) {
  const pathname = usePathname() ?? ''
  if (!isProductPath(pathname)) return null
  return (
    <div className="band-beta" role="note">
      {text} <Link href={`/${lang}/termos#s13`}>{more}</Link>
    </div>
  )
}
