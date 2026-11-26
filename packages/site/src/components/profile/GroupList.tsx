'use client'

import Link from 'next/link'
import Emblem from '@/components/social/Emblem'
import { useMore } from '@/components/social/useMais'
import { plural, type Dictionary, type Ready } from '@/lib/i18n-base'
import type { Page } from '@/lib/types'
import type { CommunityCardData, PageCardData } from '@/lib/social/types'

type ItemC = { comunidade: CommunityCardData; papel: 'dono' | 'moderador' | 'membro' }
type ItemP = { pagina: PageCardData; relacao: 'dono' | 'administrador' | 'seguidor' }

export function Communities({ initial, roverUid, proprio: own, d, lang }: { initial: Page<ItemC>; roverUid: string; proprio: boolean; d: Dictionary; lang: Ready }) {
  const g = d.socPerfil.grupos
  const { itens: items, proximo: next, pendente: pending, mais: more } = useMore(initial, { lista: 'comunidadesDoRover', de: roverUid }, (x) => x.comunidade.id)
  return (
    <>
      <ul className="pf-groups" aria-busy={pending}>
        {items.map(({ comunidade: c, papel: role }) => (
          <li key={c.id}>
            <Link href={`/${lang}/comunidades/${c.id}`} className="pf-group">
              <Emblem nome={c.nome} tamanho={52} />
              <span className="pf-group-text">
                <strong>{c.nome}</strong>
                <small>
                  {plural(g.membros, c.membros)} · {d.socComum.papeis[role]}
                  {own && c.acesso === 'fechada' ? ` · ${g.fechadaNota}` : ''}
                </small>
              </span>
              <span className="pill" data-tom={c.acesso === 'fechada' ? 'aviso' : c.acesso === 'moderada' ? 'acao' : undefined}>
                {d.socComum.acessos[c.acesso].nome}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {next && (
        <div className="pf-more-list">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : d.comum.carregarMais}
          </button>
        </div>
      )}
    </>
  )
}

export function Pages({ initial, roverUid, d, lang }: { initial: Page<ItemP>; roverUid: string; d: Dictionary; lang: Ready }) {
  const g = d.socPerfil.grupos
  const { itens: items, proximo: next, pendente: pending, mais: more } = useMore(initial, { lista: 'paginasDoRover', de: roverUid }, (x) => x.pagina.id)
  return (
    <>
      <ul className="pf-groups" aria-busy={pending}>
        {items.map(({ pagina: p, relacao: relation }) => (
          <li key={p.id}>
            <Link href={`/${lang}/paginas/${p.id}`} className="pf-group">
              <Emblem nome={p.nome} forma="etiqueta" tamanho={52} />
              <span className="pf-group-text">
                <strong>{p.nome}</strong>
                <small>
                  {plural(g.seguidores, p.seguidores)} · {g.paginaRelacao[relation]}
                </small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {next && (
        <div className="pf-more-list">
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : d.comum.carregarMais}
          </button>
        </div>
      )}
    </>
  )
}
