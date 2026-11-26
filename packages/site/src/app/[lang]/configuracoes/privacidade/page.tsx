import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/editorial/EditorialPage'
import RovemarkButton from '@/components/folgali/RovemarkButton'
import PreferencesForm from '@/components/legal/PreferencesForm'
import SettingsTabs from '@/components/person/SettingsTabs'
import { profileTexts } from '@/i18n/profile'
import { consentOf, preferencesOf } from '@/lib/folgali/vault'
import { rovemarkTargets } from '@/lib/folgali/rovemark'
import { currentPerson } from '@/lib/folgali/session'
import { dict, isReady } from '@/lib/i18n'
import { legalDict } from '@/lib/legal-i18n'
import { pageMeta } from '@/lib/seo/metadata'

type Params = { params: Promise<{ lang: string }>; searchParams?: Promise<{ salvo?: string; erro?: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang } = await params
  const l = isReady(lang) ? lang : 'pt'
  const c = legalDict(l).configuracoes
  return pageMeta({ lang: l, caminho: '/configuracoes/privacidade', titulo: c.titulo, descricao: c.texto })
}

/**
 * Settings > Privacy (Rovemark's decision, 25/11/2026). The two choices left the sign-in screen and live here: 18+ content (off by
 * default; turning it on asks the person to confirm again being 18 or older) and the objection to AI training (allowed by default).
 * LGPD art. 18 and GDPR art. 21 ask that the person can object at any time, so this page is linked from the account area (/entrar)
 * and from the privacy policy. `?erro=maior` comes back from a save that tried to turn 18+ on without the confirmation box.
 */
export default async function PrivacySettings({ params, searchParams }: Params) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const legal = legalDict(lang)
  const c = legal.configuracoes
  const person = await currentPerson()
  const sp = await searchParams
  const saved = sp?.salvo === '1'
  const missingAge = sp?.erro === 'maior'
  return (
    <article className="editorial configuracoes">
      <Breadcrumbs lang={lang} itens={[{ nome: c.titulo, href: `/${lang}/configuracoes/privacidade` }]} />
      <header className="page-title">
        <h1 id="t">{c.titulo}</h1>
        <p>{c.texto}</p>
      </header>
      <SettingsTabs lang={lang} atual="privacidade" t={profileTexts(lang)} />
      {!person ? (
        <section className="box box-pad" aria-labelledby="cfg-entrar">
          <p id="cfg-entrar">{c.entrar}</p>
          <RovemarkButton href={rovemarkTargets(lang).entrar} rotulo={dict(lang).socFolgali.entrar.botao} emBreve={dict(lang).socFolgali.entrar.emBreve} emBreveTexto={dict(lang).socFolgali.entrar.emBreveTexto} />
        </section>
      ) : !consentOf(person.id) ? (
        <section className="box box-pad" aria-labelledby="cfg-aceite">
          <p id="cfg-aceite">{c.aceite}</p>
          <Link href={`/${lang}/entrar`} className="btn btn-primary">{c.aceiteBotao}</Link>
        </section>
      ) : (
        <section className="box box-pad">
          {saved && (
            <p className="callout callout-ok" role="status">
              {c.salvo}
            </p>
          )}
          {missingAge && (
            <p className="callout callout-notice" role="alert">
              {c.erroMaior}
            </p>
          )}
          <PreferencesForm prefs={preferencesOf(person.id)} legal={legal} salvar={legal.preferencias.salvar} lang={lang} />
        </section>
      )}
      <p className="fine">
        <Link href={`/${lang}/privacidade`}>{legal.aceite.privacidade}</Link>
      </p>
    </article>
  )
}
