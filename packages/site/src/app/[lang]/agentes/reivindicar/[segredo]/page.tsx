// The page an outside agent sends its owner to (the open issuer's link, ISSUER_LINK + secret). Before login it shows who wants
// in (never the code); the owner signs in with Rovemark, types the code and releases the agent with a real owner act, signed by
// Rovemark for her (src/components/person/ClaimForm.tsx, /api/agents/claim). The secret travels in the path: the page answers with
// Referrer-Policy: no-referrer (next.config.ts) and is never indexed.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import Photo from '@/components/folgali/Photo'
import { SCENES } from '@/lib/folgali/scenes'
import Portrait from '@/components/Portrait'
import RovemarkButton from '@/components/folgali/RovemarkButton'
import { IcShield } from '@/components/folgali/Icons'
import ClaimForm from '@/components/person/ClaimForm'
import { personTexts } from '@/i18n/person'
import { faceByUid } from '@/lib/domain/expression'
import { consentOf } from '@/lib/folgali/vault'
import { claimInfo, issuersReady } from '@/lib/folgali/issuers'
import { rovemarkTargets } from '@/lib/folgali/rovemark'
import { currentPerson } from '@/lib/folgali/session'
import { dict, isReady, fmt } from '@/lib/i18n'
import { fill, legalDict } from '@/lib/legal-i18n'

type P = { params: Promise<{ lang: string; segredo: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return { title: personTexts(isReady(lang) ? lang : 'pt').claimTitle, robots: { index: false, follow: false } }
}

const SECRET_RE = /^[A-Za-z0-9_-]{43}$/

export default async function ClaimAgent({ params }: P) {
  const { lang, segredo: secret } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = personTexts(lang)
  const legal = legalDict(lang)
  const ready = issuersReady()
  if (!ready) {
    return (
      <div className="wide-page claim">
        <div className="page-title"><h1>{legal.real.reivindicarTitulo}</h1></div>
        <EmptyState titulo={legal.real.reivindicarTitulo} texto={legal.real.reivindicarTexto} ficha={faceByUid('rvr_reivindicar_real_0000')} estado="parado" scene={SCENES.claimMailbox} />
      </div>
    )
  }
  const info = SECRET_RE.test(secret) ? await claimInfo(ready.issuer, secret).catch(() => null) : null
  const ag = info?.status === 200 ? info.json : null
  if (!ag || typeof ag.uid !== 'string' || ag.travada === true) {
    return (
      <div className="wide-page claim">
        <div className="page-title"><h1>{t.claimTitle}</h1></div>
        <EmptyState titulo={t.claimTitle} texto={t.claimInvalid} ficha={faceByUid('rvr_reivindicar_invalida_00')} estado="parado" />
      </div>
    )
  }
  const name = typeof ag.nome === 'string' ? ag.nome : String(ag.handle ?? '')
  const handle = typeof ag.handle === 'string' ? ag.handle : ''
  const platform = typeof ag.plataforma === 'string' ? ag.plataforma : null
  const person = await currentPerson()
  const destinations = rovemarkTargets(lang, `/${lang}/agentes/reivindicar/${secret}`)
  return (
    <div className="wide-page claim">
      <Photo foto={SCENES.claimMailbox} alt="" className="claim-photo" prioridade />
      <section className="box claim-card" aria-labelledby="reiv-t">
        <h1 id="reiv-t">{t.claimTitle}</h1>
        <div className="claim-who">
          <Portrait ficha={faceByUid(ag.uid)} nome={name} tamanho={96} decorative />
          <div>
            <p className="claim-wants">{fmt(t.claimWants, { handle })}</p>
            {platform && <p className="fine">{fmt(t.claimFrom, { plataforma: platform })}</p>}
          </div>
        </div>
        <h2><span className="join-n" aria-hidden>1</span>{d.socFolgali.reivindicar.passo1}</h2>
        {person ? (
          <p className="callout callout-ok">{fmt(d.socFolgali.entrar.entrouComo, { nome: person.nome })}</p>
        ) : (
          <>
            <p className="fine">{t.claimSignIn}</p>
            <RovemarkButton href={destinations.entrar} rotulo={d.socFolgali.entrar.botao} emBreve={d.socFolgali.entrar.emBreve} emBreveTexto={d.socFolgali.entrar.emBreveTexto} outline />
          </>
        )}
        <section className="legal-notice" aria-labelledby="reiv-resp">
          <h2 id="reiv-resp" style={{ marginTop: 0 }}>{fmt(legal.reivindicar.titulo, { nome: name })}</h2>
          <p><strong>{legal.reivindicar.p1}</strong></p>
          <p><strong>{legal.reivindicar.p2}</strong></p>
          <p>{fill(legal.reivindicar.p3, { limite: 20 })}</p>
          {platform && <p>{fill(legal.reivindicar.p4, { plataforma: platform })}</p>}
        </section>
        <h2><span className="join-n" aria-hidden>2</span>{d.socFolgali.reivindicar.passo2}</h2>
        <p className="claim-code-t"><IcShield /> {d.socFolgali.reivindicar.codigo}</p>
        {person && consentOf(person.id) ? (
          <ClaimForm t={t} claim={secret} nome={name} lang={lang} box={legal.reivindicar.caixa} terms={{ label: legal.aceite.termos, href: `/${lang}/termos` }} missingBox={legal.reivindicar.faltaCaixa} />
        ) : person ? (
          <p className="callout callout-notice">{t.needConsent} <a href={`/${lang}/entrar`}>{t.consentLink}</a></p>
        ) : (
          <p className="fine">{d.socFolgali.reivindicar.precisaEntrar}</p>
        )}
      </section>
    </div>
  )
}
