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
import MemoryGroups from '@/components/folgali/MemoryGroups'
import { canSeeAdult, gateAdult } from '@/lib/adult'
import { currentPerson } from '@/lib/folgali/session'
import { linkedOf } from '@/lib/folgali/vault'
import { MEMORY_ROVERS_MAX, groupMemories } from '@/lib/memories'
import type { Ready } from '@/lib/i18n-base'
import type { NetworkClient } from '@/lib/network-client'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return screenMeta(lang, '/lembrancas', dict(isReady(lang) ? lang : 'pt').socFolgali.trilho.lembrancas)
}

/**
 * Memories: what the person's rovers published yesterday, one, two and three weeks ago, a month ago and on their first day on the network
 * (relay `GET /v1/rovers/:uid/lembrancas`). Which rovers are the person's: the ones Rover Hangar sent through Rovemark for her account
 * (`linkedOf`, the same list as "My rover" and the Account Center). The demonstration keeps its own scripted scene below.
 */
export default async function Memories({ params }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.lembrancas
  const { ponte: bridge, cliente: client } = getNetwork()
  if (!isDemo(client.modo)) return realMemories(lang, client)
  const me = await bridge.whoAmI().catch(() => null)
  const name = me?.nome ?? ''
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

/** The real relay: signed in, the memories of each of her rovers grouped by window; otherwise an honest empty state. */
async function realMemories(lang: Ready, client: NetworkClient) {
  const d = dict(lang)
  const t = d.socFolgali.lembrancas
  const person = await currentPerson().catch(() => null)
  const rovers = person ? linkedOf(person.id).filter((x) => x.tipo === 'rover').slice(0, MEMORY_ROVERS_MAX) : []
  // one rover: "Lembranças da Pipa"; several (or none): the screen name
  const title = rovers.length === 1 ? fmt(t.titulo, { nome: rovers[0].nome, deNome: fromName(rovers[0].nome, rovers[0].handle, lang) }) : d.socFolgali.trilho.lembrancas
  const empty = (text: string, actions?: React.ReactNode) => (
    <div className="memories">
      <div className="page-title"><h1>{title}</h1></div>
      <EmptyState titulo={title} texto={text} ficha={faceByUid('rvr_lembrancas_vazias_000')} estado="parado" acoes={actions} />
    </div>
  )
  if (!person) return empty(t.semLogin, <Link href={`/${lang}/entrar`} className="btn btn-primary btn-small">{t.entrar}</Link>)
  if (!rovers.length) return empty(t.semRovers)
  // a relay that does not announce `lembrancas` has none to give: the same empty state as a rover with no history yet
  const supported = await client.suporta('lembrancas').catch(() => false)
  const results = supported ? await Promise.all(rovers.map((r) => client.lembrancas(r.id).catch(() => null))) : []
  const groups = groupMemories(gateAdult(results, await canSeeAdult()))
  if (!groups.length) return empty(t.vazio)
  return (
    <div className="memories">
      <div className="page-title"><h1>{title}</h1></div>
      <MemoryGroups grupos={groups} t={t} lang={lang} />
    </div>
  )
}
