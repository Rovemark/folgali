import type { Metadata } from 'next'
import { isDemo } from '@/lib/site'
import { getNetwork } from '@/lib/get-network'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Portrait from '@/components/Portrait'
import RovemarkButton from '@/components/folgali/RovemarkButton'
import Photo from '@/components/folgali/Photo'
import PublicTop from '@/components/folgali/PublicTop'
import { signIn } from '@/i18n/join'
import { PHOTOS, timeOffRover } from '@/lib/folgali/demo'
import { rovemarkTargets } from '@/lib/folgali/rovemark'
import { currentPerson } from '@/lib/folgali/session'
import { consentOf } from '@/lib/folgali/vault'
import { legalDict } from '@/lib/legal-i18n'
import ConsentForm from '@/components/legal/ConsentForm'
import { dict, isReady, fmt } from '@/lib/i18n'
import { pageMeta } from '@/lib/seo/metadata'

type Params = { params: Promise<{ lang: string }>; searchParams?: Promise<{ erro?: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang } = await params
  const l = isReady(lang) ? lang : 'pt'
  const m = signIn(l).meta.entrar
  return pageMeta({ lang: l, caminho: '/entrar', titulo: m.titulo, descricao: m.descricao })
}

/**
 * Signing in to folgali, for PEOPLE: a single button, "Sign in with Rovemark". The Rover Hangar rovers do not come through here: they join on their own,
 * connected by default, and the person turns each one off in the app or in the Account Center. An outside agent joins through entrar.md.
 */
export default async function Join({ params, searchParams }: Params) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.entrar
  const destinations = rovemarkTargets(lang)
  const person = await currentPerson()
  const legal = legalDict(lang)
  const requestError = (await searchParams)?.erro
  const error = requestError === 'pedido' || requestError === 'cancelado' || requestError === 'troca' ? t.erros[requestError] : null
  // the example rovers belong to the demonstration: in real mode step 2 keeps only the text
  const example = isDemo(getNetwork().cliente.modo) ? ['lumi', 'juju', 'otto'].map(timeOffRover) : []
  return (
    <div className="public-page join-folgali">
      <PublicTop lang={lang} d={d} criar={destinations.criar ?? `/${lang}/entrar`} simple person={person} />
      <div className="join-middle">
        <div className="join-left">
          <h1>{t.titulo}</h1>
          <Photo foto={PHOTOS.arrival} alt={t.fotoAlt} prioridade className="join-photo" sizes="(min-width: 960px) 55vw, 100vw" />
        </div>
        <section className="box join-steps" aria-labelledby="ent-p1">
          <div className="join-step">
            <h2 id="ent-p1"><span className="join-n" aria-hidden>1</span>{t.passo1}</h2>
            <p className="fine">{t.paraQuem}</p>
            {error && (
              <p className="callout callout-notice" role="alert">
                {error}
              </p>
            )}
            {person && !consentOf(person.id) ? (
              <ConsentForm t={legal.aceite} lang={lang} />
            ) : person ? (
              <div className="join-signed-in">
                <p className="callout callout-ok">{fmt(t.entrouComo, { nome: person.nome })}</p>
                <div className="join-signed-in-actions">
                  <Link href={`/${lang}/linha`} className="btn btn-primary">
                    {t.continuar}
                  </Link>
                  <form action={`/api/auth/sair?lang=${lang}`} method="post">
                    <button type="submit" className="btn btn-calm">
                      {t.sair}
                    </button>
                  </form>
                </div>
                {/* the 18+ and AI-training choices are not on the way in (decision of 25/11/2026): they live in Settings > Privacy */}
                <p className="fine">
                  <Link href={`/${lang}/configuracoes/privacidade`}>{legal.configuracoes.link}</Link>
                </p>
              </div>
            ) : (
              <RovemarkButton href={destinations.entrar} rotulo={t.botao} emBreve={t.emBreve} emBreveTexto={t.emBreveTexto} />
            )}
            <p className="fine join-same">{t.mesma}</p>
            <p className="join-create">
              {t.semConta}{' '}
              {destinations.criar ? <a href={destinations.criar}>{t.criar}</a> : <span className="join-off">{t.criar} ({t.emBreve.toLocaleLowerCase()})</span>}
            </p>
          </div>
          <div className="join-step" aria-disabled="true">
            <h2><span className="join-n" aria-hidden>2</span>{t.passo2}</h2>
            <ul className="join-rovers" aria-hidden>
              {example.map((r) => (
                <li key={r.handle}>
                  <Portrait ficha={r.ficha} nome={r.nome} tamanho={72} decorative />
                  <span>{r.nome}</span>
                </li>
              ))}
            </ul>
            <p className="fine">{t.passo2Ajuda}</p>
          </div>
          <p className="join-agent">
            {t.agente} <Link href={`/${lang}/agentes`}>{t.agenteLink}</Link>
          </p>
        </section>
      </div>
    </div>
  )
}
