'use client'

import RoverCard from '@/components/social/RoverCard'
import ActionButton from '@/components/social/ActButton'
import { useMore } from '@/components/social/useMais'
import { canInCommunity } from '@/lib/domain/permissions'
import { relativeTime, type Dictionary } from '@/lib/i18n-base'
import type { Access, MemberItem, RoleInCommunity } from '@/lib/social/types'
import type { Page } from '@/lib/types'
import ActionWithReason from './ActionWithReason'

/** Members with the actions that the reader's ROLE allows: the matrix decides, and what does not fit does not even appear. */
export default function MembersModeration({ initial, comunidade: community, acesso: access, myRole, myUid, d, lang, agora: now }: { initial: Page<MemberItem>; comunidade: string; acesso: Access; myRole: RoleInCommunity; myUid: string; d: Dictionary; lang: string; agora: string }) {
  const { itens: items, proximo: next, pendente: pending, failed, mais: more } = useMore(initial, { lista: 'membros', de: community }, (m) => m.rover.uid)
  const t = d.socModeracao.membros
  const who = { papel: myRole, banido: false }
  const nMod = items.filter((m) => m.papel === 'moderador').length
  return (
    <>
      <ul className="members-list membros-mod">
        {items.map((m) => {
          const me = m.rover.uid === myUid
          const kick = !me && canInCommunity('expulsar', who, access, { alvoPapel: m.papel }).ok
          const ban = !me && canInCommunity('banir', who, access, { alvoPapel: m.papel }).ok
          const promote = !me && myRole === 'dono' && m.papel === 'membro' && nMod < 10
          const demote = !me && myRole === 'dono' && m.papel === 'moderador'
          return (
            <li key={m.rover.uid} className="member-mod">
              <RoverCard
                rover={m.rover}
                lang={lang}
                extra={
                  <>
                    <span className="pill" data-tom={m.papel === 'membro' ? undefined : 'acao'}>
                      {me ? `${d.socComum.papeis[m.papel]} (${t.ele})` : d.socComum.papeis[m.papel]}
                    </span>
                    <span className="fine">{relativeTime(m.desde, d, new Date(now))}</span>
                  </>
                }
              />
              {(kick || ban || promote || demote) && (
                <div className="flex-row member-actions">
                  {promote && (
                    <ActionButton ato={{ tipo: 'comunidade-gestao', comunidade: community, alvo: m.rover.uid, acao: 'promover', motivo: null }} d={d} className="btn btn-secondary btn-small">
                      {t.promover}
                    </ActionButton>
                  )}
                  {demote && (
                    <ActionButton ato={{ tipo: 'comunidade-gestao', comunidade: community, alvo: m.rover.uid, acao: 'rebaixar', motivo: null }} d={d} className="btn btn-secondary btn-small">
                      {t.rebaixar}
                    </ActionButton>
                  )}
                  {kick && <ActionWithReason ato={{ tipo: 'comunidade-gestao', comunidade: community, alvo: m.rover.uid, acao: 'expulsar' }} d={d} rotulo={t.expulsar} titulo={t.expulsarTitulo} texto={t.expulsarTexto} confirmar={t.expulsar} />}
                  {ban && <ActionWithReason ato={{ tipo: 'comunidade-gestao', comunidade: community, alvo: m.rover.uid, acao: 'banir' }} d={d} rotulo={t.banir} titulo={t.banirTitulo} texto={t.banirTexto} confirmar={t.banir} />}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {next && (
        <div style={{ display: 'grid', justifyItems: 'center', marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={more} disabled={pending}>
            {pending ? d.comum.carregando : d.comum.carregarMais}
          </button>
        </div>
      )}
      {failed && (
        <p className="error-field" role="alert">
          {d.socComum.erros.outro.titulo}
        </p>
      )}
    </>
  )
}
