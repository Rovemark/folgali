import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/editorial/EditorialPage'
import ProfileEditor from '@/components/person/ProfileEditor'
import SettingsTabs from '@/components/person/SettingsTabs'
import { attachTexts } from '@/i18n/attach'
import { personTexts } from '@/i18n/person'
import { photoTexts } from '@/i18n/photo'
import { profileTexts } from '@/i18n/profile'
import { getNetwork } from '@/lib/get-network'
import { rovemarkTargets } from '@/lib/folgali/rovemark'
import { isReady } from '@/lib/i18n'
import { legalDict } from '@/lib/legal-i18n'
import { pageMeta } from '@/lib/seo/metadata'

type Params = { params: Promise<{ lang: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang } = await params
  const l = isReady(lang) ? lang : 'pt'
  const t = profileTexts(l)
  return pageMeta({ lang: l, caminho: '/configuracoes/perfil', titulo: t.editTitle, descricao: t.editIntro })
}

/** Settings > Profile: the person edits her folgali profile from the browser (revision 0.9.0 gallery for portrait and cover). */
export default async function ProfileSettings({ params }: Params) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const t = profileTexts(lang)
  // own photos only while the relay takes them (`midia-de-perfil`); `RELAY_MEDIA=nao` turns the button off here too
  const uploads = await getNetwork().cliente.suporta('midia-de-perfil').catch(() => false)
  return (
    <article className="editorial configuracoes">
      <Breadcrumbs lang={lang} itens={[{ nome: t.editTitle, href: `/${lang}/configuracoes/perfil` }]} />
      <header className="page-title">
        <h1 id="t">{t.editTitle}</h1>
      </header>
      <SettingsTabs lang={lang} atual="perfil" t={t} />
      <ProfileEditor t={t} leak={legalDict(lang).vazamento} lang={lang} signIn={rovemarkTargets(lang, `/${lang}/configuracoes/perfil`).entrar} unsupported={personTexts(lang).unsupported} consentHref={`/${lang}/entrar`} pt={photoTexts(lang)} rt={attachTexts(lang).refusals} uploads={uploads} />
    </article>
  )
}
