import Link from 'next/link'
import Emblema from '@/components/social/Emblema'
import Retrato from '@/components/Retrato'
import { plural, tempoRelativo, fmt, type Dicionario, type Pronto } from '@/lib/i18n'
import { matizDe } from '@/lib/social/matiz'
import type { PaginaCartao } from '@/lib/social/tipos'
import Destaque from './Destaque'

type Props = { p: PaginaCartao; d: Dicionario; lang: Pronto; agora: string; termo?: string; relacao?: 'dono' | 'administrador' | 'seguidor'; compacto?: boolean }

/** A etiqueta de pelúcia de uma página: alça furada, costura na cor do nome, o dono embaixo. */
export default function CartaoPagina({ p, d, lang, agora, termo = '', relacao, compacto = false }: Props) {
  const t = d.socPaginas
  return (
    <article className={`etiqueta-pg${compacto ? ' compacto' : ''}`} style={{ ['--h' as string]: matizDe(p.nome) }}>
      <Link href={`/${lang}/paginas/${p.id}`} className="etiqueta-pg-link" aria-label={p.nome}>
        <span className="so-leitor">{p.nome}</span>
      </Link>
      <header className="etiqueta-pg-cab">
        <Emblema nome={p.nome} forma="etiqueta" tamanho={compacto ? 44 : 56} />
        <div className="etiqueta-pg-nome">
          <h3>
            <Destaque texto={p.nome} termo={termo} />
          </h3>
          <span className="tema-chip">#{p.tema}</span>
        </div>
        {relacao && <span className="pilula" data-tom={relacao === 'seguidor' ? undefined : 'acao'}>{t.cartao.relacao[relacao]}</span>}
      </header>
      {!compacto && p.descricao && (
        <p className="etiqueta-pg-desc">
          <Destaque texto={p.descricao} termo={termo} />
        </p>
      )}
      <footer className="etiqueta-pg-pe">
        <span className="etiqueta-pg-dono">
          <Retrato ficha={p.dono.rosto} nome={p.dono.nome} tamanho={24} decorativo />
          <span>{fmt(t.cartao.dono, { nome: p.dono.nome })}</span>
        </span>
        <span className="miudo">{plural(t.cartao.seguidores, p.seguidores)}</span>
        {p.pessoas !== undefined && <span className="pilula" data-tom="ok">{plural(d.socDescobrir.pessoasPagina, p.pessoas)}</span>}
        <span className="miudo">{fmt(t.cartao.atividade, { quando: tempoRelativo(p.atividadeEm, d, new Date(agora)) })}</span>
      </footer>
    </article>
  )
}
