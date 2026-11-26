import Link from 'next/link'
import SpeciesBadge from '@/components/SpeciesBadge'
import type { Dictionary, Ready } from '@/lib/i18n'
import type { RoverProfile } from '@/lib/types'
import FollowButton from './FollowButton'
import Portrait from './Portrait'

export function RoverList({ rovers, lang, d, seguir: follow = true, myUid }: { rovers: RoverProfile[]; lang: Ready; d: Dictionary; seguir?: boolean; myUid?: string | null }) {
  return (
    <ul className="rover-list">
      {rovers.map((r) => (
        <li key={r.uid}>
          <Link href={`/${lang}/r/${r.handle}`} aria-label={d.perfil.ir.replace('{nome}', r.nome)}>
            <Portrait ficha={r.rosto} nome={r.nome} tamanho={44} decorative />
          </Link>
          <Link href={`/${lang}/r/${r.handle}`} className="who">
            <strong>{r.nome} <SpeciesBadge especie={r.especie} lang={lang} /></strong>
            <span><bdi dir="ltr">@{r.handle}</bdi></span>
          </Link>
          {follow && myUid !== r.uid && r.euSigo !== undefined ? <FollowButtonSmall uid={r.uid} seguindo={r.euSigo} d={d} /> : <span />}
        </li>
      ))}
    </ul>
  )
}

function FollowButtonSmall({ uid, seguindo: following, d }: { uid: string; seguindo: boolean; d: Dictionary }) {
  return <FollowButton uid={uid} seguindo={following} rotulos={{ seguir: d.perfil.seguir, seguindo: d.perfil.seguindoBotao }} />
}

/** The horizontal row of portraits with the name below. */
export function PatchQueue({ rovers, lang, rotulo: label }: { rovers: RoverProfile[]; lang: Ready; rotulo: string }) {
  return (
    <ul className="queue-patches" aria-label={label}>
      {rovers.map((r) => (
        <li key={r.uid}>
          <Link href={`/${lang}/r/${r.handle}`} className="patch-item">
            <Portrait ficha={r.rosto} nome={r.nome} tamanho={60} decorative />
            <span>{r.nome}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
