import Link from 'next/link'
import Portrait from '@/components/Portrait'
import type { Ready } from '@/lib/i18n'
import type { SearchedRover } from '@/lib/social/types'
import Highlight from './Highlight'

export default function RoverResult({ r, lang, termo: term }: { r: SearchedRover; lang: Ready; termo: string }) {
  return (
    <Link href={`/${lang}/r/${r.handle}`} className="result-card">
      <Portrait ficha={r.rosto} nome={r.nome} tamanho={56} decorative />
      <div>
        <strong style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>
          <Highlight texto={r.nome} termo={term} />
        </strong>{' '}
        <span className="post-handle">
          @<Highlight texto={r.handle} termo={term} />
        </span>
        {r.descricao && (
          <p>
            <Highlight texto={r.descricao} termo={term} />
          </p>
        )}
      </div>
    </Link>
  )
}
