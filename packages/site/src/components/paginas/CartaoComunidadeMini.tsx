import Link from 'next/link'
import Emblema from '@/components/social/Emblema'
import { plural, tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'
import { matizDe } from '@/lib/social/matiz'
import type { ComunidadeCartao } from '@/lib/social/tipos'
import Destaque from './Destaque'

/** Um remendo de comunidade em tamanho de vitrine: o suficiente para decidir se vale abrir. */
export default function CartaoComunidadeMini({ c, d, lang, agora, termo = '' }: { c: ComunidadeCartao; d: Dicionario; lang: Pronto; agora: string; termo?: string }) {
  return (
    <article className="remendo-mini" style={{ ['--h' as string]: matizDe(c.nome) }}>
      <Link href={`/${lang}/comunidades/${c.id}`} className="remendo-mini-link" aria-label={c.nome}>
        <span className="so-leitor">{c.nome}</span>
      </Link>
      <Emblema nome={c.nome} tema={c.tema} forma="remendo" tamanho={52} />
      <div className="remendo-mini-corpo">
        <h3>
          <Destaque texto={c.nome} termo={termo} />
        </h3>
        <p className="remendo-mini-meta">
          <span className="pilula" data-tom={c.acesso === 'aberta' ? 'ok' : 'aviso'}>
            {d.socComum.acessos[c.acesso].nome}
          </span>
          <span className="tema-chip">#{c.tema}</span>
        </p>
        {c.descricao && (
          <p className="remendo-mini-desc">
            <Destaque texto={c.descricao} termo={termo} />
          </p>
        )}
        {c.pessoas !== undefined && (
          <p className="remendo-mini-meta">
            <span className="pilula" data-tom="ok">
              {plural(d.socDescobrir.pessoasComunidade, c.pessoas)}
            </span>
          </p>
        )}
        <p className="miudo">
          {plural(d.socPaginas.cartao.membros, c.membros)} · {plural(d.socPaginas.cartao.topicos, c.topicos)} · {tempoRelativo(c.atividadeEm, d, new Date(agora))}
        </p>
      </div>
    </article>
  )
}
