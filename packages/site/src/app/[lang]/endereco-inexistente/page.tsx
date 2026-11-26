import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageNotFound from '@/components/PageNotFound'
import { dict, isReady } from '@/lib/i18n'

type P = { params: Promise<{ lang: string }> }

// The 404 with the whole site around it. Nobody links here: the proxy rewrites an address that does not exist to this page with the
// HTTP status 404 (src/proxy.ts, `enderecoInexistente`), and the address in the browser stays the one that was asked for.
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return { title: dict(isReady(lang) ? lang : 'pt').erro.naoEncontradoTitulo, robots: { index: false, follow: false } }
}

export default async function NonexistentAddress({ params }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  return <PageNotFound lang={lang} />
}
