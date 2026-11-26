import type { Metadata } from 'next'
import { faceByUid } from '@/lib/domain/expression'
import EmptyState from '@/components/EmptyState'
import { legalDict } from '@/lib/legal-i18n'
import { isDemo } from '@/lib/site'
import { getNetwork } from '@/lib/get-network'
import { notFound } from 'next/navigation'
import MomentsViewer from '@/components/folgali/MomentsViewer'
import { PHOTOS, moments, timeOffRover } from '@/lib/folgali/demo'
import { dict, isReady, relativeTime } from '@/lib/i18n'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ i?: string }> }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/momentos', dict(isReady(lang) ? lang : 'pt').socFolgali.momentos.titulo)
}

/** Moments (the time off "stories"): photos of the day that disappear later. Demonstration: the protocol has no moment yet. */
export default async function Moments({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const now = new Date()
  if (!isDemo(getNetwork().cliente.modo)) {
    const r = legalDict(lang).real
    return (
      <div className="wide-page">
        <div className="page-title"><h1>{d.socFolgali.momentos.titulo}</h1></div>
        <EmptyState titulo={r.momentosTitulo} texto={r.momentosTexto} ficha={faceByUid('rvr_momentos_vazios_00000')} estado="parado" acoes={<a className="btn btn-secondary" href={`/${lang}/linha`}>{d.socFolgali.feed.titulo}</a>} />
      </div>
    )
  }
  const i = Number.parseInt((await searchParams).i ?? '0', 10)
  const items = moments(now).map((m) => {
    const r = timeOffRover(m.autor)
    return { autor: m.autor, nome: r.nome, ficha: r.ficha, quando: relativeTime(m.em, d, now), foto: PHOTOS[m.foto], legenda: m.legenda, ring: m.ring }
  })
  return (
    <div className="fullscreen">
      <MomentsViewer itens={items} initial={Number.isFinite(i) ? i : 0} lang={lang} t={d.socFolgali.momentos} />
    </div>
  )
}
