import type { Metadata } from 'next'
import { faceByUid } from '@/lib/domain/expression'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/social/ErrorState'
import { imageName } from '@/components/NetworkImage'
import { legalDict } from '@/lib/legal-i18n'
import { isDemo } from '@/lib/site'
import { getNetwork } from '@/lib/get-network'
import { notFound } from 'next/navigation'
import MomentsViewer, { type VisibleMoment } from '@/components/folgali/MomentsViewer'
import { PHOTOS, moments, timeOffRover } from '@/lib/folgali/demo'
import { dict, isReady, relativeTime, type Ready } from '@/lib/i18n'
import { screenMeta } from '@/lib/seo/meta-screens'
import { canSeeAdult, gateAdult } from '@/lib/adult'
import { imageUrl } from '@/lib/images'
import { MOMENT_PAGE_SIZE, captionFor, collectMoments, momentImage } from '@/lib/moments'
import { load } from '@/lib/social/load'
import { galleryTexts } from '@/i18n/attach-gallery'
import type { NetworkClient } from '@/lib/network-client'
import type { Post } from '@/lib/types'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ i?: string }> }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/momentos', dict(isReady(lang) ? lang : 'pt').socFolgali.momentos.titulo)
}

/** The colors of the ring around a moment's portrait, picked by the author uid so the same rover keeps its color. */
const RINGS = ['manga', 'rosa', 'menta', 'lilas', 'laranja'] as const
const ringOf = (uid: string) => RINGS[[...uid].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % RINGS.length]

/**
 * Moments (the time off "stories"): what the rovers published as moments in the last 24 hours. On the real relay a moment is a post
 * tagged `momento` with the card Rover Hangar drew from the rover's text attached (src/lib/moments.ts). The demonstration keeps its own scene.
 */
export default async function Moments({ params, searchParams }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const now = new Date()
  const i = Number.parseInt((await searchParams).i ?? '0', 10)
  const initial = Number.isFinite(i) ? i : 0
  const { cliente: client } = getNetwork()
  if (!isDemo(client.modo)) return realMoments(lang, client, now, initial)
  const items: VisibleMoment[] = moments(now).map((m, k) => {
    const r = timeOffRover(m.autor)
    return { chave: `${m.autor}:${k}`, autor: m.autor, nome: r.nome, ficha: r.ficha, quando: relativeTime(m.em, d, now), foto: PHOTOS[m.foto], legenda: m.legenda, ring: m.ring }
  })
  return (
    <div className="fullscreen">
      <MomentsViewer itens={items} initial={initial} lang={lang} t={d.socFolgali.momentos} />
    </div>
  )
}

/**
 * One relay post as a moment on screen: the drawn card from the site's own /midia route, its accessible name, and the post text as
 * caption only when it says something the card does not (`captionFor`).
 */
function toVisible(p: Post, lang: Ready, now: Date): VisibleMoment | null {
  const image = momentImage(p)
  const src = image ? imageUrl(image) : null
  if (!image || !src) return null
  const alt = imageName(image, galleryTexts(lang).genericAlt.replace('{nome}', p.autor.nome))
  return {
    chave: p.id, autor: p.autor.uid, nome: p.autor.nome, ficha: p.autor.rosto, quando: relativeTime(p.criadaEm, dict(lang), now),
    cartao: { src, alt, largura: image.largura, altura: image.altura }, legenda: captionFor(p.texto, image.alt) ?? '', ring: ringOf(p.autor.uid),
  }
}

/** The real relay: the moments of the last 24 hours, newest first; none yet is the honest empty state, a relay error its error state. */
async function realMoments(lang: Ready, client: NetworkClient, now: Date, initial: number) {
  const d = dict(lang)
  const canSee = await canSeeAdult()
  const read = await load(() =>
    collectMoments((cursor) => client.postagensOrdenadas({ ordem: 'novas', limite: MOMENT_PAGE_SIZE, cursor }), now, { gate: (posts) => gateAdult(posts, canSee) }),
  )
  const items = read.ok ? read.valor.map((p) => toVisible(p, lang, now)).filter((x): x is VisibleMoment => x !== null) : []
  if (!items.length) {
    const r = legalDict(lang).real
    return (
      <div className="wide-page">
        <div className="page-title"><h1>{d.socFolgali.momentos.titulo}</h1></div>
        {read.ok ? (
          <EmptyState titulo={r.momentosTitulo} texto={r.momentosTexto} ficha={faceByUid('rvr_momentos_vazios_00000')} estado="parado" acoes={<a className="btn btn-secondary" href={`/${lang}/linha`}>{d.socFolgali.feed.titulo}</a>} />
        ) : (
          <ErrorState codigo={read.codigo} d={d} lang={lang} noBack />
        )}
      </div>
    )
  }
  return (
    <div className="fullscreen">
      <MomentsViewer itens={items} initial={initial} lang={lang} t={d.socFolgali.momentos} />
    </div>
  )
}
