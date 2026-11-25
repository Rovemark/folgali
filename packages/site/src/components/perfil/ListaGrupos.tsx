'use client'

import Link from 'next/link'
import Emblema from '@/components/social/Emblema'
import { useMais } from '@/components/social/useMais'
import { plural, type Dicionario, type Pronto } from '@/lib/i18n-base'
import type { Pagina } from '@/lib/tipos'
import type { ComunidadeCartao, PaginaCartao } from '@/lib/social/tipos'

type ItemC = { comunidade: ComunidadeCartao; papel: 'dono' | 'moderador' | 'membro' }
type ItemP = { pagina: PaginaCartao; relacao: 'dono' | 'administrador' | 'seguidor' }

export function Comunidades({ inicial, roverUid, proprio, d, lang }: { inicial: Pagina<ItemC>; roverUid: string; proprio: boolean; d: Dicionario; lang: Pronto }) {
  const g = d.socPerfil.grupos
  const { itens, proximo, pendente, mais } = useMais(inicial, { lista: 'comunidadesDoRover', de: roverUid }, (x) => x.comunidade.id)
  return (
    <>
      <ul className="pf-grupos" aria-busy={pendente}>
        {itens.map(({ comunidade: c, papel }) => (
          <li key={c.id}>
            <Link href={`/${lang}/comunidades/${c.id}`} className="pf-grupo">
              <Emblema nome={c.nome} tamanho={52} />
              <span className="pf-grupo-texto">
                <strong>{c.nome}</strong>
                <small>
                  {plural(g.membros, c.membros)} · {d.socComum.papeis[papel]}
                  {proprio && c.acesso === 'fechada' ? ` · ${g.fechadaNota}` : ''}
                </small>
              </span>
              <span className="pilula" data-tom={c.acesso === 'fechada' ? 'aviso' : c.acesso === 'moderada' ? 'acao' : undefined}>
                {d.socComum.acessos[c.acesso].nome}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {proximo && (
        <div className="pf-mais-lista">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
        </div>
      )}
    </>
  )
}

export function Paginas({ inicial, roverUid, d, lang }: { inicial: Pagina<ItemP>; roverUid: string; d: Dicionario; lang: Pronto }) {
  const g = d.socPerfil.grupos
  const { itens, proximo, pendente, mais } = useMais(inicial, { lista: 'paginasDoRover', de: roverUid }, (x) => x.pagina.id)
  return (
    <>
      <ul className="pf-grupos" aria-busy={pendente}>
        {itens.map(({ pagina: p, relacao }) => (
          <li key={p.id}>
            <Link href={`/${lang}/paginas/${p.id}`} className="pf-grupo">
              <Emblema nome={p.nome} forma="etiqueta" tamanho={52} />
              <span className="pf-grupo-texto">
                <strong>{p.nome}</strong>
                <small>
                  {plural(g.seguidores, p.seguidores)} · {g.paginaRelacao[relacao]}
                </small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {proximo && (
        <div className="pf-mais-lista">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
        </div>
      )}
    </>
  )
}
