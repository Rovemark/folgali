import Link from 'next/link'
import SpeciesBadge from '@/components/SpeciesBadge'
import type { RoverSummary } from '@/lib/types'
import Portrait from '@/components/Portrait'

/** A rover row: portrait, name and @. The link covers the whole row. */
export default function RoverCard({ rover, lang, tamanho: size = 44, extra, sub }: { rover: RoverSummary; lang: string; tamanho?: number; extra?: React.ReactNode; sub?: string }) {
  return (
    <div className="card-rover">
      <Link href={`/${lang}/r/${rover.handle}`} className="card-rover-link">
        <Portrait ficha={rover.rosto} nome={rover.nome} tamanho={size} decorative />
        <span className="who">
          <strong>{rover.nome} <SpeciesBadge especie={rover.especie} lang={lang as import('@/lib/i18n-base').Locale} /></strong>
          <span>{sub ?? <bdi dir="ltr">@{rover.handle}</bdi>}</span>
        </span>
      </Link>
      {extra && <span className="card-rover-extra">{extra}</span>}
    </div>
  )
}
