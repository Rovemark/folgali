import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ReportForm from '@/components/ReportForm'
import { dict, isReady } from '@/lib/i18n'
import { legalDict } from '@/lib/legal-i18n'
import { routeMeta } from '@/lib/seo/metadata'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'denunciar')
}

/** Report content without an account (Lex, 2 and 4.5): the person pastes the address; the reason and the good-faith statement go along. */
export default async function ReportContent({ params }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = legalDict(lang).denuncia
  return (
    <>
      <div className="page-title">
        <h1>{t.titulo}</h1>
        <p className="fine">{t.enderecoAjuda}</p>
      </div>
      <ReportForm alvo="" d={d} voltar={`/${lang}`} lang={lang} requestAddress />
    </>
  )
}
