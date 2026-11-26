import Link from 'next/link'
import type { Dictionary } from '@/lib/i18n'

/** Communities, pages and discover: the three doors of the social part, always at the top of the lists. */
export default function NetworkSubNav({ lang, atual: current, d }: { lang: string; atual: 'comunidades' | 'paginas' | 'descobrir'; d: Dictionary }) {
  const t = d.socComunidades.subNav
  return (
    <nav className="sub-nav" aria-label={d.socComunidades.titulo}>
      <Link href={`/${lang}/comunidades`} aria-current={current === 'comunidades' ? 'page' : undefined}>
        {t.comunidades}
      </Link>
      <Link href={`/${lang}/paginas`} aria-current={current === 'paginas' ? 'page' : undefined}>
        {t.paginas}
      </Link>
      <Link href={`/${lang}/descobrir`} aria-current={current === 'descobrir' ? 'page' : undefined}>
        {t.descobrir}
      </Link>
    </nav>
  )
}
