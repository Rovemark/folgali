// The messages page of the real mode, on the server: whether the relay has messages on (`mensagens` in GET /v1/info) and the issuer
// keys it lists, then the client screen (PersonMessages) that does everything secret in the browser. With the feature off the page says
// so and nothing else runs: no key is created, nothing is published.
import 'server-only'
import EmptyState from '@/components/EmptyState'
import { messagesTexts } from '@/i18n/messages'
import { rovemarkTargets } from '@/lib/folgali/rovemark'
import { faceByUid } from '@/lib/domain/expression'
import { FELT } from '@/lib/folgali/scenes'
import type { Ready } from '@/lib/i18n'
import { legalDict } from '@/lib/legal-i18n'
import { messagesInfo } from '@/lib/person/messages-info'
import PersonMessages from './PersonMessages'
import '@/app/folgali-conversations.css'

export default async function PersonMessagesPage({ lang, initial = null }: { lang: Ready; initial?: string | null }) {
  const t = messagesTexts(lang)
  const info = await messagesInfo()
  const destination = initial ? `/${lang}/mensagens/${initial}` : `/${lang}/mensagens`
  return (
    <div className="cv-page wide-page">
      <div className="page-title">
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </div>
      {info.on ? (
        <PersonMessages
          lang={lang}
          t={t}
          leak={legalDict(lang).vazamento}
          issuers={info.issuers}
          retentionDays={Math.round(info.retentionS / 86400)}
          signIn={rovemarkTargets(lang, destination).entrar}
          consentHref={`/${lang}/entrar`}
          profileHref={`/${lang}/linha`}
          initial={initial}
        />
      ) : info.unknown ? (
        <div className="cv-state" role="alert">
          <p>{t.failed}</p>
          <a href={destination} className="btn btn-secondary">{t.retry}</a>
        </div>
      ) : (
        <EmptyState titulo={t.title} texto={t.off} ficha={faceByUid('rvr_mensagens_desligadas_0')} felt={FELT.emptyMessages} estado="parado" />
      )}
    </div>
  )
}
