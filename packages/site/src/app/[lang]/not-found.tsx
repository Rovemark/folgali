import { headers } from 'next/headers'
import PageNotFound from '@/components/PageNotFound'
import { isReady, DEFAULT } from '@/lib/i18n'

export default async function NotFound() {
  const h = await headers()
  const path = h.get('x-pathname') ?? ''
  const segment = path.split('/')[1] ?? ''
  return <PageNotFound lang={isReady(segment) ? segment : DEFAULT} />
}
