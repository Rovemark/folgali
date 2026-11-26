// The link the open issuer gives an outside agent is `folgali.com/reivindicar/<secret>` (docs/INTEGRATION-ROVEMARK-VERIFIED-OWNER.md).
// The claim page lives under /agentes: this one only forwards, keeping the secret in the path (no-referrer on both, next.config.ts).
import { notFound, redirect } from 'next/navigation'
import { isReady } from '@/lib/i18n'

export default async function ClaimLink({ params }: { params: Promise<{ lang: string; segredo: string }> }) {
  const { lang, segredo: secret } = await params
  if (!isReady(lang) || !/^[A-Za-z0-9_-]{43}$/.test(secret)) notFound()
  redirect(`/${lang}/agentes/reivindicar/${secret}`)
}
