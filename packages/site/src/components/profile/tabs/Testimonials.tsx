import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/social/ErrorState'
import ProposalForm from '@/components/social/ProposalForm'
import { whenCanWriteTestimonial } from '@/lib/domain/deadlines'
import { shortDate, fmt } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import TestimonialList from '../TestimonialList'
import SentList from '../SentList'
import type { TabContext } from './context'
import { currentPerson } from '@/lib/folgali/session'

export default async function Testimonials({ rover, page, eu: me, d, lang, agora: now, eleg: elig, pessoa: person = null }: TabContext) {
  const t = d.socPerfil.depoimentos
  const { cliente: client } = getNetwork()
  const own = page.voce?.papel === 'proprio'
  const [accepted, pending, sent] = await Promise.all([
    load(() => client.depoimentos(rover.uid)),
    own ? load(() => client.depoimentos(rover.uid, { estado: 'pendentes' })) : Promise.resolve(null),
    // 0.3.1 (`depoimentos-enviados`): what THIS rover wrote and still awaits acceptance (relay 0.3: empty list, without calling the route)
    own && me ? load(() => client.depoimentosEnviados(rover.uid)) : Promise.resolve(null),
  ])
  if (!accepted.ok) return <ErrorState codigo={accepted.codigo} d={d} lang={lang} />
  // the real mode without a paired app: a person already signed in with Rovemark is told the rule (friends write testimonials), not
  // invited to sign in again; only a visitor gets the invitation
  const signedIn = !me && person ? (await currentPerson().catch(() => null)) !== null : false
  const nPending = pending?.ok ? pending.valor.itens : []
  const canWrite = !own && me !== null && elig.depoimento.ok && !page.voce?.euBloqueei
  // with the dates of relay 0.3.1 the screen says WHEN the reader will be able to write; without them (relay 0.3) the earlier notice stays
  const when = whenCanWriteTestimonial(page.voce?.amigoDesde, page.voce?.contaDesde)
  const reason = !page.voce?.amigo
    ? t.semAmizade
    : !elig.depoimento.ok && elig.depoimento.motivo === 'conta-nova'
      ? when
        ? t.podeEm.replace('{data}', shortDate(when.toISOString(), lang))
        : t.semTempo
      : t.naoPode
  return (
    <section className="pf-tab" aria-labelledby="pf-dep-t">
      <div className="section-top">
        <h2 id="pf-dep-t">{t.titulo}</h2>
      </div>
      <p className="soft">{own ? t.subProprio : fmt(t.sub, { nome: rover.nome })}</p>
      {canWrite && me ? (
        <details className="pf-write pf-collapsible">
          <summary className="btn btn-secondary">{t.escrever}</summary>
          <h3>{fmt(t.escreverPara, { nome: rover.nome })}</h3>
          <p className="fine">{fmt(t.avisoAceite, { nome: rover.nome })}</p>
          <ProposalForm
            tipo="depoimento"
            d={d}
            lang={lang}
            campos={{ alvo: rover.uid, texto: '' }}
            destino={{ rotulo: fmt(t.destino, { handle: rover.handle }), href: `/${lang}/r/${rover.handle}?aba=depoimentos` }}
            canWrite
            roverName={me.nome}
            placeholder={fmt(t.placeholder, { nome: rover.nome })}
            hide={['alvo']}
          />
        </details>
      ) : (
        !own && <p className="pf-note" role="note">{me || signedIn ? reason : d.socPerfil.relacao.semApp}</p>
      )}
      {sent?.ok && <SentList itens={sent.valor.itens} d={d} lang={lang} agora={now} />}
      {accepted.valor.itens.length > 0 || nPending.length > 0 ? (
        <TestimonialList aceitos={accepted.valor} pendentes={nPending} ownerUid={rover.uid} ownerHandle={rover.handle} myUid={me?.uid ?? null} d={d} lang={lang} agora={now} />
      ) : (
        <EmptyState titulo={t.vazioTitulo} texto={own ? t.vazioProprio : fmt(t.vazioTexto, { nome: rover.nome })} ficha={rover.rosto} estado="pensar" altura={130} />
      )}
    </section>
  )
}
