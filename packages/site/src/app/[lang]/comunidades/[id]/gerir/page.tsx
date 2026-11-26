import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import CommunityHeader from '@/components/communities/CommunityHeader'
import OwnershipForm from '@/components/communities/OwnershipForm'
import { IcAlert } from '@/components/Icons'
import ErrorState from '@/components/social/ErrorState'
import ProposalForm from '@/components/social/ProposalForm'
import { isComplete, ID_OK, readCommunity, whoOf, whoAmI } from '@/lib/communities/data'
import { faceByUid } from '@/lib/domain/expression'
import { canInCommunity } from '@/lib/domain/permissions'
import { dict, isReady } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/comunidades/${id}/gerir`, dict(isReady(lang) ? lang : 'pt').socComunidades.gerir.titulo)
}

export default async function Manage({ params }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socComunidades.gerir
  const c = ID_OK.test(id) ? await readCommunity(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <ErrorState codigo={c.codigo} d={d} lang={lang} />
  const using = c.valor
  if (!isComplete(using)) return <CommunityHeader c={using} d={d} lang={lang} />
  const who = whoOf(using.voce)
  if (!canInCommunity('editar-dados', who, using.acesso).ok) {
    return (
      <>
        <CommunityHeader c={using} d={d} lang={lang} aba="gerir" />
        <EmptyState titulo={d.socModeracao.soEquipe.titulo} texto={t.soEquipe} ficha={faceByUid('rvr_gerir_so_equipe_0000')} estado="parado" erro />
      </>
    )
  }
  const me = await whoAmI()
  const owner = canInCommunity('transferir', who, using.acesso).ok
  const members = owner ? await load(() => getNetwork().cliente.membros(id)) : null
  const candidates = members?.ok ? members.valor.itens.filter((m) => m.papel !== 'dono' && m.rover.uid !== me?.uid).map((m) => m.rover) : []
  return (
    <>
      <CommunityHeader c={using} d={d} lang={lang} aba="gerir" />
      <div className="stack-large">
        <div>
          <h2>{t.titulo}</h2>
          <p className="soft">{t.sub}</p>
        </div>
        <section className="card" aria-labelledby="ed-t">
          <h3 id="ed-t">{t.editar}</h3>
          <p className="soft">{t.editarTexto}</p>
          {using.acesso === 'fechada' && (
            <p className="notice-community" role="note">
              <IcAlert />
              <span>{t.fechadaAbre}</span>
            </p>
          )}
          {!owner && <p className="fine">{t.acessoSoDono}</p>}
          <ProposalForm
            tipo="comunidade-atualizar"
            d={d}
            lang={lang}
            canWrite={me !== null}
            roverName={me?.nome}
            destino={{ rotulo: using.nome, href: `/${lang}/comunidades/${id}` }}
            hide={owner ? ['comunidade'] : ['comunidade', 'acesso']}
            campos={{ comunidade: id, nome: using.nome, descricao: using.descricao, regras: using.regras, tema: using.tema, acesso: using.acesso, categorias: using.categorias }}
          />
        </section>
        {owner && me && (
          <section aria-labelledby="posse-t" className="stack">
            <div>
              <h3 id="posse-t">{t.posse}</h3>
              <p className="soft">{t.posseTexto}</p>
            </div>
            <OwnershipForm comunidade={id} communityName={using.nome} membros={candidates} d={d} lang={lang} roverName={me.nome} />
          </section>
        )}
      </div>
    </>
  )
}
