import Link from 'next/link'
import Emblem from '@/components/social/Emblem'
import { plural, relativeTime, type Dictionary, type Ready } from '@/lib/i18n'
import { shadeOf } from '@/lib/social/hue'
import type { CommunityCardData } from '@/lib/social/types'
import Highlight from './Highlight'

/** A community patch in showcase size: enough to decide whether it is worth opening. */
export default function CommunityCardMini({ c, d, lang, agora: now, termo: term = '' }: { c: CommunityCardData; d: Dictionary; lang: Ready; agora: string; termo?: string }) {
  return (
    <article className="patch-mini" style={{ ['--h' as string]: shadeOf(c.nome) }}>
      <Link href={`/${lang}/comunidades/${c.id}`} className="patch-mini-link" aria-label={c.nome}>
        <span className="reader-only">{c.nome}</span>
      </Link>
      <Emblem nome={c.nome} tema={c.tema} forma="remendo" tamanho={52} />
      <div className="patch-mini-body">
        <h3>
          <Highlight texto={c.nome} termo={term} />
        </h3>
        <p className="patch-mini-meta">
          <span className="pill" data-tom={c.acesso === 'aberta' ? 'ok' : 'aviso'}>
            {d.socComum.acessos[c.acesso].nome}
          </span>
          <span className="theme-chip">#{c.tema}</span>
        </p>
        {c.descricao && (
          <p className="patch-mini-desc">
            <Highlight texto={c.descricao} termo={term} />
          </p>
        )}
        {c.pessoas !== undefined && (
          <p className="patch-mini-meta">
            <span className="pill" data-tom="ok">
              {plural(d.socDescobrir.pessoasComunidade, c.pessoas)}
            </span>
          </p>
        )}
        <p className="fine">
          {plural(d.socPaginas.cartao.membros, c.membros)} · {plural(d.socPaginas.cartao.topicos, c.topicos)} · {relativeTime(c.atividadeEm, d, new Date(now))}
        </p>
      </div>
    </article>
  )
}
