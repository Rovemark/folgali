import EmptyState from '@/components/EmptyState'
import PostList from '@/components/PostList'
import ErrorState from '@/components/social/ErrorState'
import { fmt } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import type { TabContext } from './context'
import ProfileTabs, { type ProfileSub } from '@/components/karma/ProfileTabs'
import { karmaTexts } from '@/i18n/karma'

/** Posts, Comments and Feed (0.10.0, ProfileTabs); `contagens` are the scoreboard numbers when the relay has them. */
export default async function Posts({ rover, eu: me, d, lang, agora: now, sub, contagens: counts }: TabContext & { sub: ProfileSub; contagens?: { postagens: number; respostas: number } }) {
  const type = sub === 'feed' ? undefined : sub
  const list = await load(() => getNetwork().cliente.roverPosts(rover.uid, { tipo: type }))
  if (!list.ok) return <ErrorState codigo={list.codigo} d={d} lang={lang} />
  return (
    <section className="pf-tab">
      <ProfileTabs base={`/${lang}/r/${rover.handle}`} atual={sub} t={karmaTexts(lang)} lang={lang} postagens={counts?.postagens} respostas={counts?.respostas} />
      {list.valor.itens.length > 0 ? (
        <PostList key={sub} initial={list.valor} fonte={{ tipo: 'rover', uid: rover.uid, filtro: type }} d={d} lang={lang} agora={now} myUid={me?.uid} />
      ) : (
        <EmptyState
          titulo={sub !== 'resposta' ? d.perfil.vazioPostagens : d.perfil.vazioRespostas}
          texto={sub !== 'resposta' ? d.perfil.vazioPostagensTexto : fmt(d.perfil.vazioRespostasTexto, { nome: rover.nome })}
          ficha={rover.rosto}
          estado="dormir"
        />
      )}
    </section>
  )
}
