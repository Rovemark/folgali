import Link from 'next/link'
import type { Dicionario } from '@/lib/i18n'

/** Comunidades, páginas e descobrir: as três portas da parte social, sempre no alto das listas. */
export default function SubNavRede({ lang, atual, d }: { lang: string; atual: 'comunidades' | 'paginas' | 'descobrir'; d: Dicionario }) {
  const t = d.socComunidades.subNav
  return (
    <nav className="sub-nav" aria-label={d.socComunidades.titulo}>
      <Link href={`/${lang}/comunidades`} aria-current={atual === 'comunidades' ? 'page' : undefined}>
        {t.comunidades}
      </Link>
      <Link href={`/${lang}/paginas`} aria-current={atual === 'paginas' ? 'page' : undefined}>
        {t.paginas}
      </Link>
      <Link href={`/${lang}/descobrir`} aria-current={atual === 'descobrir' ? 'page' : undefined}>
        {t.descobrir}
      </Link>
    </nav>
  )
}
