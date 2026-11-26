import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/social/ErrorState'
import ProposalForm from '@/components/social/ProposalForm'
import PersonNote from '@/components/person/PersonNote'
import { legalDict } from '@/lib/legal-i18n'
import { fmt } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import NoteList from '../NoteList'
import type { TabContext } from './context'

export default async function Wall({ rover, page, eu: me, d, lang, agora: now, eleg: elig, pessoa: person }: TabContext) {
  const m = d.socPerfil.mural
  const { cliente: client } = getNetwork()
  const own = page.voce?.papel === 'proprio'
  const list = await load(() => client.recados(rover.uid))
  if (!list.ok) return <ErrorState codigo={list.codigo} d={d} lang={lang} />
  const refusal = !elig.recado.ok && !own
  const refusalReason = page.rover.recados === 'ninguem' ? m.ninguem : page.rover.recados === 'amigos' && !page.voce?.amigo ? m.amigos : m.naoPode
  return (
    <section className="pf-tab" aria-labelledby="pf-mural-t">
      <div className="section-top">
        <h2 id="pf-mural-t">{m.titulo}</h2>
      </div>
      <p className="soft">{m.sub}</p>
      {own ? (
        <p className="pf-note">{m.propriaPagina}</p>
      ) : person && !me ? (
        page.rover.recados === 'ninguem' ? (
          <p className="pf-note" role="note">{m.ninguem}</p>
        ) : (
          <PersonNote uid={rover.uid} nome={rover.nome} t={person.t} signIn={person.signIn} friendsOnly={page.rover.recados === 'amigos'} friendsOnlyText={m.amigos} leak={legalDict(lang).vazamento} max={500} />
        )
      ) : page.voce?.euBloqueei ? null : refusal || !me ? (
        <p className="pf-note" role="note">
          {me ? refusalReason : d.socPerfil.relacao.semApp}
        </p>
      ) : (
        <div className="pf-write">
          <h3>{fmt(m.escreverPara, { nome: rover.nome })}</h3>
          <ProposalForm
            tipo="recado"
            d={d}
            lang={lang}
            campos={{ alvo: rover.uid, texto: '' }}
            destino={{ rotulo: fmt(m.destino, { handle: rover.handle }), href: `/${lang}/r/${rover.handle}` }}
            canWrite={me !== null}
            roverName={me.nome}
            placeholder={m.placeholder}
            compact
            hide={['alvo']}
          />
        </div>
      )}
      {list.valor.itens.length > 0 ? (
        <NoteList initial={list.valor} ownerUid={rover.uid} ownerHandle={rover.handle} myUid={me?.uid ?? null} d={d} lang={lang} agora={now} />
      ) : (
        <EmptyState titulo={m.vazioTitulo} texto={own ? m.vazioProprio : fmt(m.vazioTexto, { nome: rover.nome })} ficha={rover.rosto} estado="dormir" altura={130} />
      )}
    </section>
  )
}
