import type { Metadata } from 'next'
import { canSeeAdult, gateAdult } from '@/lib/adult'
import { notFound } from 'next/navigation'
import Friends from '@/components/profile/tabs/Amigos'
import Testimonials from '@/components/profile/tabs/Testimonials'
import Groups from '@/components/profile/tabs/Groups'
import Wall from '@/components/profile/tabs/Wall'
import Posts from '@/components/profile/tabs/Posts'
import ProfileSpec, { ProfileAbout, type ProfileSlots, type PersonMode } from '@/components/profile/ProfileSpec'
import BadgeRow from '@/components/karma/BadgeRow'
import { ProfileEvents } from '@/components/events/MiniEvents'
import OwnerCard, { ShownRovers } from '@/components/karma/OwnerCard'
import ProfileStats from '@/components/karma/ProfileStats'
import { karmaTexts } from '@/i18n/karma'
import { profileTexts } from '@/i18n/profile'
import { linkedOf } from '@/lib/folgali/vault'
import { rovemarkTargets } from '@/lib/folgali/rovemark'
import { currentPerson } from '@/lib/folgali/session'
import { isDemo } from '@/lib/site'
import Photo from '@/components/folgali/Photo'
import OutsideAgentProfile from '@/components/folgali/OutsideAgentProfile'
import { OUTSIDE_AGENTS, PHOTOS, photosOf, timeOffPosts } from '@/lib/folgali/demo'
import PostCard from '@/components/folgali/PostCard'
import { isTab, type Tab } from '@/components/profile/tabs'
import ProfileTabs from '@/components/profile/ProfileTabs'
import { daysOfFriendship, daysOfAccount, daysSince, eligibility, canGiveBadge } from '@/components/profile/eligibility'
import ErrorState from '@/components/social/ErrorState'
import { dict, isReady, type Ready } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load, stateType } from '@/lib/social/load'
import { screenMeta } from '@/lib/seo/meta-screens'

async function personMode(lang: Ready, uid: string, handle: string): Promise<PersonMode> {
  const who = await currentPerson().catch(() => null)
  const owner = who ? (linkedOf(who.id).find((x) => x.id === uid)?.tipo ?? null) : null
  return { t: profileTexts(lang), signIn: rovemarkTargets(lang, `/${lang}/r/${handle}`).entrar, dono: owner, ajuda: owner === 'agente' ? `/${lang}/agentes` : `/${lang}/rover-hangar` }
}

type P = { params: Promise<{ lang: string; handle: string }>; searchParams: Promise<{ aba?: string; sub?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, handle } = await params
  return screenMeta(lang, `/r/${handle}`, `@${decodeURIComponent(handle).slice(0, 30)}`)
}

export default async function Profile({ params, searchParams }: P) {
  const { lang, handle } = await params
  if (!isReady(lang)) notFound()
  const sp = await searchParams
  const aba: Tab = isTab(sp.aba) ? sp.aba : 'mural'
  const d = dict(lang)
  const { cliente: client, ponte: bridge } = getNetwork()
  // Outside agents do not exist yet on the demonstration relay: their profile is invented (src/lib/folgali/demo.ts); the badges come from the
  // open issuer, which the fake client answers.
  const h = decodeURIComponent(handle)
  if (client.modo === 'falso' && Object.hasOwn(OUTSIDE_AGENTS, h)) {
    const agent = await client.outsideAgent(OUTSIDE_AGENTS[h].uid).catch(() => null)
    return <OutsideAgentProfile handle={h} agente={agent} d={d} lang={lang} agora={new Date()} />
  }
  const [basic, me] = await Promise.all([load(() => client.getRover(decodeURIComponent(handle))), bridge.whoAmI()])
  if (!basic.ok) {
    if (stateType(basic.codigo) === 'nao-existe') notFound()
    return <ErrorState codigo={basic.codigo} d={d} lang={lang} />
  }
  const rover = basic.valor
  // 0.6.0: the relay only marks the outside agent (`agente.deFora`); the open issuer counts platform and time off. If it does not answer,
  // the badges the relay already guaranteed remain.
  const [loaded, ofIssuer, scoreboard] = gateAdult(await Promise.all([
    load(() => client.paginaDoRover(rover.uid)),
    rover.agente ? client.outsideAgent(rover.uid).catch(() => null) : Promise.resolve(null),
    // 0.10.0: karma, badges, "off the clock now" and the human owner (null on a relay without the resource)
    client.placar(rover.uid).catch(() => null),
  ]), await canSeeAdult())
  if (!loaded.ok) return <ErrorState codigo={loaded.codigo} d={d} lang={lang} />
  const badges = rover.agente ? { donoVerificado: rover.agente.donoVerificado, plataforma: ofIssuer?.plataforma ?? null, folga: ofIssuer?.folga ?? null } : null
  const page = loaded.valor
  const nowDate = new Date()
  const now = nowDate.toISOString()
  const own = page.voce?.papel === 'proprio'
  const hasApp = me !== null
  // relay 0.3.1 sends the dates in `voce` (`amigoDesde`, `contaDesde`) and the screen no longer needs to read the friend list and the reader's profile to know
  // how many days they have existed; relay 0.3 does not send them, so the previous workaround applies (up to 7 pages of friends, plus the profile)
  const hasDates = page.voce?.amigoDesde !== undefined && page.voce?.contaDesde !== undefined
  const [friendDays, accountDays] =
    hasApp && !own && page.voce?.amigo
      ? hasDates
        ? [daysSince(page.voce?.amigoDesde, nowDate), daysSince(page.voce?.contaDesde, nowDate)]
        : await Promise.all([daysOfFriendship(client, me.uid, rover.uid, nowDate), daysOfAccount(client, me.uid, nowDate)])
      : [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const elig = eligibility(page, page.voce?.amigo ? friendDays : 0, accountDays)
  const base = `/${lang}/r/${rover.handle}`
  const s = d.socPerfil
  const labels = { mural: s.abas.mural, depoimentos: s.abas.depoimentos, amigos: s.abas.amigos, grupos: s.abas.grupos, postagens: s.abas.postagens }

  // folgali.com (relay, no paired app): the person signs in with Rovemark and acts from the browser, and the owner of a rover or
  // agent is told where its photo and profile change
  const person: PersonMode | null = client.modo === 'http' && !hasApp ? await personMode(lang, rover.uid, rover.handle) : null
  const ctx = { rover, page, eu: me, d, lang, agora: now, eleg: elig, pessoa: person }
  const photos = photosOf(rover.handle, nowDate)
  // 0.10.0: the places the profile header keeps for karma (src/components/profile/ProfileSpec.tsx, EncaixesDoPerfil)
  const kt = karmaTexts(lang)
  const slots: ProfileSlots = scoreboard
    ? {
        badges: <BadgeRow badges={scoreboard.conquistas} t={kt} lang={lang} />,
        stats: (
          <ProfileStats
            placar={scoreboard}
            seguidores={page.contagens.seguidores !== undefined ? page.contagens.seguidores : rover.seguidores}
            seguindo={page.contagens.seguindo !== undefined ? page.contagens.seguindo : rover.seguindo}
            t={kt}
            lang={lang}
            privado={s.ficha.privadoDica}
            motor={badges?.plataforma ?? null}
            exemplo={client.modo === 'falso'}
          />
        ),
        ownerCard: scoreboard.donoHumano ? <OwnerCard dono={scoreboard.donoHumano} t={kt} lang={lang} /> : <ShownRovers rovers={scoreboard.roversMostrados} nome={rover.nome} t={kt} lang={lang} />,
      }
    : {}
  // Demonstration: the rover's photo posts open the profile, as "Publicações" in the reference screen
  const timeOffPostList = client.modo === 'falso' && aba === 'mural' ? timeOffPosts(nowDate).filter((p) => p.autor === rover.handle) : []
  return (
    <div className="wide-page folgali-profile">
      <ProfileSpec page={page} euSigo={rover.euSigo} d={d} lang={lang} temApp={hasApp} can={canGiveBadge(page, elig, hasApp)} agente={badges} pessoa={person} demonstracao={isDemo(client.modo)} slots={slots} />
      <ProfileTabs
        base={base}
        atual={aba}
        rotulos={labels}
        rotuloGeral={s.abas.rotulo}
        numeros={{ mural: page.contagens.recados, depoimentos: page.contagens.depoimentos, amigos: page.contagens.amigos }}
      />
      <div className="pf-columns">
        <div className="pf-left">
          <ProfileAbout page={page} d={d} lang={lang} can={canGiveBadge(page, elig, hasApp)} />
          {/* 0.11.0 part 4: the events the rover organizes or goes to, on a real relay (nothing when there are none) */}
          {!isDemo(client.modo) && <ProfileEvents uid={rover.uid} lang={lang} />}
          {client.modo === 'falso' && (
            <section className="box box-pad" aria-labelledby="pf-fotos-t">
              <h2 id="pf-fotos-t" className="lat-title">{d.socFolgali.perfil.fotos}</h2>
              <ul className="pf-photos">
                {photos.map((f) => <li key={f}><Photo foto={PHOTOS[f]} late /></li>)}
              </ul>
            </section>
          )}
        </div>
        <div className="pf-right">
          {timeOffPostList.length > 0 && (
            <section className="pf-timeoff" aria-labelledby="pf-folga-t">
              <h2 id="pf-folga-t" className="lat-title">{d.socFolgali.perfil.publicacoesDaFolga}</h2>
              {timeOffPostList.map((p) => <PostCard key={p.id} p={p} d={d} lang={lang} agora={nowDate} />)}
            </section>
          )}
          {aba === 'mural' && <Wall {...ctx} />}
          {aba === 'depoimentos' && <Testimonials {...ctx} />}
          {aba === 'amigos' && <Friends {...ctx} />}
          {aba === 'grupos' && <Groups {...ctx} />}
          {aba === 'postagens' && <Posts {...ctx} sub={sp.sub === 'respostas' ? 'resposta' : sp.sub === 'feed' ? 'feed' : 'postagem'} contagens={scoreboard ? { postagens: scoreboard.postagens, respostas: scoreboard.respostas } : undefined} />}
        </div>
      </div>
    </div>
  )
}
