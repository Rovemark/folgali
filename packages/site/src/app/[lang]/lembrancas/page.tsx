import type { Metadata } from 'next'
import { faceByUid } from '@/lib/domain/expression'
import EmptyState from '@/components/EmptyState'
import { isDemo } from '@/lib/site'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import MemoryButton from '@/components/folgali/MemoryButton'
import Photo from '@/components/folgali/Photo'
import { PHOTOS, memories, timeOffRover } from '@/lib/folgali/demo'
import { fromName } from '@/lib/folgali/gender'
import { dict, isReady, fmt } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/lembrancas', dict(isReady(lang) ? lang : 'pt').socFolgali.trilho.lembrancas)
}

/** Memories: what happened around this same time, in the person's rover time off. Demonstration. */
export default async function Memories({ params }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.lembrancas
  const { ponte: bridge } = getNetwork()
  const me = await bridge.whoAmI().catch(() => null)
  const name = me?.nome ?? ''
  // real mode: memory belongs to the demonstration (the protocol has none); without the paired app, only the empty state
  if (!isDemo(getNetwork().cliente.modo)) {
    return (
      <div className="memories">
        <div className="page-title"><h1>{fmt(t.titulo, { nome: name, deNome: fromName(name, me?.handle, lang) })}</h1></div>
        <EmptyState titulo={fmt(t.titulo, { nome: name, deNome: fromName(name, me?.handle, lang) })} texto={t.vazio} ficha={faceByUid('rvr_lembrancas_vazias_000')} estado="parado" />
      </div>
    )
  }
  const l = memories()
  const when = t.quando as Record<string, string>
  return (
    <div className="memories">
      <div className="page-title">
        <h1>{fmt(t.titulo, { nome: name, deNome: fromName(name, me?.handle, lang) })}</h1>
      </div>
      <section className="box mem-highlight" aria-labelledby="lemb-d">
        <h2 id="lemb-d" className="lat-title">{when[l.highlight.quando]}</h2>
        <Photo foto={PHOTOS[l.highlight.foto]} prioridade className="mem-photo" />
        <div className="mem-footer">
          <p className="mem-title">{l.highlight.titulo}</p>
          <MemoryButton rotulo={t.compartilhar} feito={fmt(t.compartilhada, { nome: name })} />
        </div>
      </section>
      <h2 className="feed-sep">{t.nesteDia}</h2>
      <ol className="mem-row">
        {l.nesteDia.map((x, i) => {
          const r = timeOffRover(x.com)
          return (
            <li key={i} className="box mem-item">
              <Photo foto={PHOTOS[x.foto]} alt="" className="mem-mini" />
              <div>
                <p className="fine">{when[x.quando]}</p>
                <p className="mem-title">{x.titulo}</p>
                <Link href={`/${lang}/r/${x.com}`} className="lat-view">{r.nome}</Link>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
