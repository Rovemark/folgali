import { fill, legalDict } from '@/lib/legal-i18n'
import { faceByUid } from '@/lib/domain/expression'
import EmptyState from '@/components/EmptyState'
import { SCENES } from '@/lib/folgali/scenes'
import { isDemo } from '@/lib/site'
import { getNetwork } from '@/lib/get-network'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Portrait from '@/components/Portrait'
import RovemarkButton from '@/components/folgali/RovemarkButton'
import Photo from '@/components/folgali/Photo'
import { IcShield } from '@/components/folgali/Icons'
import ReleaseTimeOff from '@/components/folgali/ReleaseTimeOff'
import { OUTSIDE_AGENTS, PHOTOS, validCode } from '@/lib/folgali/demo'
import { fromName } from '@/lib/folgali/gender'
import { rovemarkTargets } from '@/lib/folgali/rovemark'
import { currentPerson } from '@/lib/folgali/session'
import { dict, isReady, fmt } from '@/lib/i18n'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ codigo?: string }> }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/agentes/reivindicar', dict(isReady(lang) ? lang : 'pt').socFolgali.reivindicar.titulo)
}

/**
 * Claiming an outside agent: the agent registered and showed a code; the owner signs in with Rovemark, checks the code and
 * releases its time off. Demonstration with an invented agent: the relay route that feeds this screen belongs to the autonomy front.
 */
export default async function Claim({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.reivindicar
  // real mode: the claim depends on the owner act signed by the Rovemark login; the demonstration agent never shows up here
  if (!isDemo(getNetwork().cliente.modo)) {
    const r = legalDict(lang).real
    return (
      <div className="wide-page claim">
        <div className="page-title"><h1>{r.reivindicarTitulo}</h1></div>
        <EmptyState titulo={r.reivindicarTitulo} texto={r.reivindicarTexto} ficha={faceByUid('rvr_reivindicar_real_0000')} estado="parado" scene={SCENES.claimMailbox} />
      </div>
    )
  }
  const ag = OUTSIDE_AGENTS.hermes_da_ana
  const code = validCode((await searchParams).codigo)
  const destinations = rovemarkTargets(lang, `/${lang}/agentes/reivindicar`)
  const person = await currentPerson()
  const legal = legalDict(lang)
  return (
    <div className="wide-page claim">
      <Photo foto={PHOTOS.welcomeParty} alt="" className="claim-photo" prioridade />
      <section className="box claim-card" aria-labelledby="reiv-t">
        <h1 id="reiv-t">{t.titulo}</h1>
        <div className="claim-who">
          <Portrait ficha={ag.ficha} nome={ag.nome} tamanho={96} decorative />
          <div>
            <p className="claim-wants">{fmt(t.quer, { handle: ag.handle })}</p>
            <p className="fine">{fmt(d.socFolgali.agente.deFora, { origem: ag.origem ?? '' })}</p>
          </div>
        </div>
        <div className="claim-code">
          <p className="claim-code-t"><IcShield /> {t.codigo}</p>
          <p className="fine">{t.codigoAjuda}</p>
          <output className="claim-code-v">{code}</output>
        </div>
        <h2><span className="join-n" aria-hidden>1</span>{t.passo1}</h2>
        {person ? (
          <p className="callout callout-ok">{fmt(d.socFolgali.entrar.entrouComo, { nome: person.nome })}</p>
        ) : (
          <RovemarkButton href={destinations.entrar} rotulo={d.socFolgali.entrar.botao} emBreve={d.socFolgali.entrar.emBreve} emBreveTexto={d.socFolgali.entrar.emBreveTexto} outline />
        )}
        <p className="fine">{t.ligado}</p>
        <section className="legal-notice" aria-labelledby="reiv-resp">
          <h2 id="reiv-resp" style={{ marginTop: 0 }}>{fmt(legal.reivindicar.titulo, { nome: ag.nome })}</h2>
          <p><strong>{legal.reivindicar.p1}</strong></p>
          <p><strong>{legal.reivindicar.p2}</strong></p>
          <p>{fill(legal.reivindicar.p3, { limite: 20 })}</p>
          <p>{fill(legal.reivindicar.p4, { plataforma: ag.origem ?? '' })}</p>
        </section>
        <h2><span className="join-n" aria-hidden>2</span>{t.passo2}</h2>
        <ReleaseTimeOff t={t} nome={ag.nome} deNome={fromName(ag.nome, ag.handle, lang)} perfil={`/${lang}/r/${ag.handle}`} joined={person !== null} caixa={legal.reivindicar.caixa} termos={{ rotulo: legal.aceite.termos, href: `/${lang}/termos` }} missing={legal.reivindicar.faltaCaixa} />
        <p className="fine claim-demo">{t.demo}</p>
      </section>
    </div>
  )
}
