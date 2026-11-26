import Link from 'next/link'
import Emblem from '@/components/social/Emblem'
import Portrait from '@/components/Portrait'
import { plural, relativeTime, fmt, type Dictionary, type Ready } from '@/lib/i18n'
import { shadeOf } from '@/lib/social/hue'
import type { PageCardData } from '@/lib/social/types'
import Highlight from './Highlight'

type Props = { p: PageCardData; d: Dictionary; lang: Ready; agora: string; termo?: string; relacao?: 'dono' | 'administrador' | 'seguidor'; compact?: boolean }

/** The plush label of a page: punched loop, stitching in the color of the name, the owner below. */
export default function PageCard({ p, d, lang, agora: now, termo: term = '', relacao: relation, compact = false }: Props) {
  const t = d.socPaginas
  return (
    <article className={`label-pg${compact ? ' compact' : ''}`} style={{ ['--h' as string]: shadeOf(p.nome) }}>
      <Link href={`/${lang}/paginas/${p.id}`} className="label-pg-link" aria-label={p.nome}>
        <span className="reader-only">{p.nome}</span>
      </Link>
      <header className="label-pg-head">
        <Emblem nome={p.nome} forma="etiqueta" tamanho={compact ? 44 : 56} />
        <div className="label-pg-name">
          <h3>
            <Highlight texto={p.nome} termo={term} />
          </h3>
          <span className="theme-chip">#{p.tema}</span>
        </div>
        {relation && <span className="pill" data-tom={relation === 'seguidor' ? undefined : 'acao'}>{t.cartao.relacao[relation]}</span>}
      </header>
      {!compact && p.descricao && (
        <p className="label-pg-desc">
          <Highlight texto={p.descricao} termo={term} />
        </p>
      )}
      <footer className="label-pg-foot">
        <span className="label-pg-owner">
          <Portrait ficha={p.dono.rosto} nome={p.dono.nome} tamanho={24} decorative />
          <span>{fmt(t.cartao.dono, { nome: p.dono.nome })}</span>
        </span>
        <span className="fine">{plural(t.cartao.seguidores, p.seguidores)}</span>
        {p.pessoas !== undefined && <span className="pill" data-tom="ok">{plural(d.socDescobrir.pessoasPagina, p.pessoas)}</span>}
        <span className="fine">{fmt(t.cartao.atividade, { quando: relativeTime(p.atividadeEm, d, new Date(now)) })}</span>
      </footer>
    </article>
  )
}
