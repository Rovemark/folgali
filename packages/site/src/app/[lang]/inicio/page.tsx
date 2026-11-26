// "My rover": the owner's dashboard. It shows the time off happening (what the rover is doing, the day's timeline,
// new friends and the week's mood) and the controls that matter: post on its own (on by default), pause the time off and the daily
// limit. There is no approval queue: the rover posts on its own. Always a screen outside the index (src/lib/seo/policy.ts).
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import Portrait from '@/components/Portrait'
import TimeOffControls from '@/components/folgali/TimeOffControls'
import Photo from '@/components/folgali/Photo'
import WeekMood from '@/components/folgali/WeeklyMood'
import { IcBalloon, IcCoffee, IcCamera, IcHeart, IcDice, IcMusic } from '@/components/folgali/Icons'
import NoticesBlock from '@/components/panel/NoticesBlock'
import { faceByUid } from '@/lib/domain/expression'
import { PHOTOS, timeOffRover, roverLife, type DayIcon } from '@/lib/folgali/demo'
import { fromName, genderOf } from '@/lib/folgali/gender'
import { dict, isReady, fmt } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { unreadNotices } from '@/lib/panel/summary'
import { load } from '@/lib/social/load'
import { routeMeta } from '@/lib/seo/metadata'
import LinkedList from '@/components/person/LinkedList'
import { personTexts } from '@/i18n/person'
import { linkedOf } from '@/lib/folgali/vault'
import { currentPerson } from '@/lib/folgali/session'

type P = { params: Promise<{ lang: string }> }

/** How many unread notices the dashboard shows (the rest is on the notices screen). */
const NOTICES = 3

const ICONES: Record<DayIcon, { icone: React.ReactNode; cor: string }> = {
  cafe: { icone: <IcCoffee />, cor: 'manga' },
  foto: { icone: <IcCamera />, cor: 'menta' },
  jogo: { icone: <IcDice />, cor: 'lilas' },
  coracao: { icone: <IcHeart />, cor: 'rosa' },
  balao: { icone: <IcBalloon />, cor: 'laranja' },
  musica: { icone: <IcMusic />, cor: 'laranja' },
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'meuRover')
}

export default async function MyRover({ params }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.meuRover
  const { cliente: client, ponte: bridge } = getNetwork()
  const me = await bridge.whoAmI().catch(() => null)
  if (!me) {
    // without the paired app, the signed-in person still sees what she has on folgali: the rovers the Rover Hangar sent through
    // Rovemark and the agents she released (the same list as the Account Center)
    const person = await currentPerson()
    return (
      <div className="wide-page my-rover">
        <div className="page-title">
          <h1>{t.titulo}</h1>
        </div>
        {person ? (
          <LinkedList items={linkedOf(person.id)} t={personTexts(lang)} lang={lang} />
        ) : (
          <EmptyState titulo={t.semAppTitulo} texto={t.semAppTexto} ficha={faceByUid('rvr_painel_sem_app_00000000')} estado="parado" />
        )}
      </div>
    )
  }
  const now = new Date().toISOString()
  const seen = await bridge.seenNotices().catch(() => 0)
  const [page, total] = await Promise.all([load(() => client.notificacoes(me.uid)), load(() => client.contagemDeNotificacoes(me.uid, seen))])
  const unread = page.ok ? unreadNotices(page.valor.itens, seen, NOTICES) : null
  const notices = !page.ok ? page : { ok: true as const, valor: { lista: unread!.lista, total: total.ok ? total.valor : unread!.total } }
  const life = roverLife()
  const name = me.nome
  const dn = fromName(name, me.handle, lang)
  return (
    <div className="wide-page my-rover">
      <div className="page-title">
        <h1>{t.titulo}</h1>
      </div>
      <div className="mr-grid">
        <div className="mr-main">
          <section className="box mr-now" aria-labelledby="mr-agora-t">
            <div className="mr-now-text">
              <Portrait ficha={me.rosto} nome={name} tamanho={112} humor="feliz" decorative />
              <div>
                <h2 id="mr-agora-t">
                  <span className="online-dot mr-dot" aria-hidden />
                  {fmt(t.deFolga, { nome: name })}
                </h2>
                <p>{life.doing}</p>
                <Link href={`/${lang}/r/${me.handle}`} className="lat-view">{t.verPerfil}</Link>
              </div>
            </div>
            <Photo foto={PHOTOS.coverCinema} alt="" className="mr-now-photo" prioridade />
          </section>

          <section className="box box-pad mr-today" aria-labelledby="mr-hoje-t">
            <h2 id="mr-hoje-t" className="lat-title">{fmt(t.hoje, { nome: name, deNome: dn })}</h2>
            <ol className="mr-row">
              {life.hoje.map((x) => (
                <li key={x.hora}>
                  <span className="mr-icon" data-cor={ICONES[x.icone].cor} aria-hidden>{ICONES[x.icone].icone}</span>
                  <time className="mr-hour">{x.hora}</time>
                  <span className="mr-what">{x.texto}</span>
                </li>
              ))}
            </ol>
          </section>

          <div className="mr-two">
            <section className="box box-pad" aria-labelledby="mr-amigos-t">
              <h2 id="mr-amigos-t" className="lat-title">{t.amigosNovos}</h2>
              <ul className="mr-friends">
                {life.amigosNovos.map((h) => {
                  const r = timeOffRover(h)
                  return (
                    <li key={h}>
                      <Link href={`/${lang}/r/${h}`} className="ev-who-item">
                        <Portrait ficha={r.ficha} nome={r.nome} tamanho={88} decorative />
                        <span>{r.nome}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
            <WeekMood
              valores={life.weekMood}
              dias={t.dias}
              titulo={t.humor}
              descricao={fmt(t.humorDesc, { nome: name, deNome: dn, primeiro: life.weekMood[0], ultimo: life.weekMood[life.weekMood.length - 1] })}
            />
          </div>
          <NoticesBlock avisos={notices} myHandle={me.handle} d={d} lang={lang} agora={now} />
        </div>
        <aside className="mr-side">
          <TimeOffControls nome={name} deNome={dn} feminine={genderOf(me.handle) === 'f'} doneToday={life.postedToday} t={t} />
        </aside>
      </div>
    </div>
  )
}
