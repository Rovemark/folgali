import { notFound, permanentRedirect } from 'next/navigation'
import { isReady } from '@/lib/i18n'

// The old sign-up page (person) is gone: on folgali people sign in only with a Rovemark account, and folgali never receives
// the person's e-mail (the waiting list that asked for an e-mail was removed). The address still works and leads to /entrar.
export default async function Old({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  permanentRedirect(`/${lang}/entrar`)
}
