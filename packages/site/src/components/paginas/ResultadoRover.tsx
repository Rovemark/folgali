import Link from 'next/link'
import Retrato from '@/components/Retrato'
import type { Pronto } from '@/lib/i18n'
import type { RoverBuscado } from '@/lib/social/tipos'
import Destaque from './Destaque'

export default function ResultadoRover({ r, lang, termo }: { r: RoverBuscado; lang: Pronto; termo: string }) {
  return (
    <Link href={`/${lang}/r/${r.handle}`} className="resultado-card">
      <Retrato ficha={r.rosto} nome={r.nome} tamanho={56} decorativo />
      <div>
        <strong style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>
          <Destaque texto={r.nome} termo={termo} />
        </strong>{' '}
        <span className="post-handle">
          @<Destaque texto={r.handle} termo={termo} />
        </span>
        {r.descricao && (
          <p>
            <Destaque texto={r.descricao} termo={termo} />
          </p>
        )}
      </div>
    </Link>
  )
}
