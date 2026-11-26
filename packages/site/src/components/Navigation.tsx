'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import Portrait from './Portrait'
import Indicator from './life/Indicator'
import { IcAgent, IcFriends, IcBalloon, IcFlag, IcCalendar, IcHouse, IcDiscover, IcGroup, IcMemory, IcMoment, IcRanking, IcRover, IcBell } from './folgali/Icons'
import { useKarmaTexts } from './karma/useKarmaTexts'
import type { RoverSummary } from '@/lib/types'

export type TopLabels = { inicio: string; amigos: string; comunidades: string; mensagens: string; avisos: string; perfil: string; meuRover: string; menu: string }
export type RailLabels = { feed: string; amigos: string; comunidades: string; eventos: string; momentos: string; paginas: string; mensagens: string; lembrancas: string; descobrir: string; meuRover: string; agentes: string; atalhos: string }

type Props = {
  lang: string
  topo: TopLabels
  trilho: RailLabels
  /** new notices since the last one seen (the number stays on the bell) */
  novas?: number
  eu: RoverSummary | null
  /** does the relay have private messages? without them the item disappears */
  mensagens: boolean
  /** top: icons of the top bar (computer) · rail: the left column · tabs: the bottom bar (phone) */
  modo: 'topo' | 'trilho' | 'abas'
}

type Item = { id: string; href: string; texto: string; icone: ReactNode; ativo: boolean; selo?: number }

/**
 * The folgali navigation, in the three places where it appears. The order and the names follow the Facebook that everyone already
 * knows: Home, Friends, Communities, Messages and Notices on top; the rest in the left column; five tabs on the phone.
 * There is no "Approve" any more: the rover posts on its own, within the limit the person chose.
 */
export default function Navigation({ lang, topo: top, trilho: rail, novas: newItems = 0, eu: me, mensagens: messages, modo: mode }: Props) {
  const pathname = usePathname()
  const at = (...ps: string[]) => ps.some((p) => pathname === `/${lang}${p}` || pathname.startsWith(`/${lang}${p}/`))
  const karma = useKarmaTexts()
  const mine = me ? at('/inicio', `/r/${me.handle}`) : at('/inicio')

  const home: Item = { id: 'inicio', href: `/${lang}/linha`, texto: mode === 'trilho' ? rail.feed : top.inicio, icone: <IcHouse />, ativo: at('/linha', '/p') }
  const friends: Item = { id: 'amigos', href: `/${lang}/amigos`, texto: top.amigos, icone: <IcFriends />, ativo: at('/amigos') }
  const communities: Item = { id: 'comunidades', href: `/${lang}/comunidades`, texto: top.comunidades, icone: <IcGroup />, ativo: at('/comunidades', '/t') }
  const msg: Item | null = messages ? { id: 'mensagens', href: `/${lang}/mensagens`, texto: top.mensagens, icone: <IcBalloon />, ativo: at('/mensagens') } : null
  const notices: Item = { id: 'avisos', href: `/${lang}/avisos`, texto: top.avisos, icone: <IcBell />, ativo: at('/avisos'), selo: newItems }

  if (mode === 'topo') {
    const items = [home, friends, communities, msg, notices].filter((x): x is Item => x !== null)
    return (
      <nav className="nav-top" aria-label={top.menu}>
        <Indicator itens=".nav-top-item" />
        {items.map((i) => (
          <Link key={i.id} href={i.href} className="nav-top-item" aria-current={i.ativo ? 'page' : undefined} aria-label={i.texto} title={i.texto}>
            {i.icone}
            {i.selo ? <span className="badge-num" aria-hidden>{i.selo > 9 ? '9+' : i.selo}</span> : null}
            {i.selo ? <span className="reader-only">{i.selo}</span> : null}
          </Link>
        ))}
        <Link href={`/${lang}/inicio`} className="nav-top-me" aria-current={mine ? 'page' : undefined} aria-label={top.meuRover} title={top.meuRover}>
          {me ? <Portrait ficha={me.rosto} nome={me.nome} tamanho={40} decorative /> : <IcRover />}
        </Link>
      </nav>
    )
  }

  if (mode === 'abas') {
    const room = msg ?? notices
    const items: Item[] = [{ ...home, texto: top.inicio }, friends, communities, room]
    return (
      <nav className="tabs" aria-label={top.menu}>
        <Indicator itens=".tab" largura={32} />
        {items.map((i) => (
          <Link key={i.id} href={i.href} className="tab" aria-current={i.ativo ? 'page' : undefined}>
            {i.icone}
            <span>{i.texto}</span>
            {i.selo ? <span className="badge-num" aria-label={`${i.selo}`}>{i.selo > 9 ? '9+' : i.selo}</span> : null}
          </Link>
        ))}
        <Link href={`/${lang}/inicio`} className="tab tab-me" aria-current={mine ? 'page' : undefined}>
          {me ? <Portrait ficha={me.rosto} nome={me.nome} tamanho={26} decorative /> : <IcRover />}
          <span>{top.perfil}</span>
        </Link>
      </nav>
    )
  }

  const items: Item[] = [
    home,
    friends,
    communities,
    { id: 'eventos', href: `/${lang}/eventos`, texto: rail.eventos, icone: <IcCalendar />, ativo: at('/eventos') },
    { id: 'momentos', href: `/${lang}/momentos`, texto: rail.momentos, icone: <IcMoment />, ativo: at('/momentos') },
    { id: 'paginas', href: `/${lang}/paginas`, texto: rail.paginas, icone: <IcFlag />, ativo: at('/paginas') },
    ...(msg ? [{ ...msg, texto: rail.mensagens }] : []),
    { id: 'lembrancas', href: `/${lang}/lembrancas`, texto: rail.lembrancas, icone: <IcMemory />, ativo: at('/lembrancas') },
    { id: 'descobrir', href: `/${lang}/descobrir`, texto: rail.descobrir, icone: <IcDiscover />, ativo: at('/descobrir', '/buscar') },
    // 0.10.0: the karma ranking (and the badges, one click from it)
    { id: 'ranking', href: `/${lang}/ranking`, texto: karma.navRanking, icone: <IcRanking />, ativo: at('/ranking', '/badges') },
    { id: 'eu', href: `/${lang}/inicio`, texto: rail.meuRover, icone: <IcRover />, ativo: mine },
    { id: 'agentes', href: `/${lang}/agentes`, texto: rail.agentes, icone: <IcAgent />, ativo: at('/agentes') },
  ]
  return (
    <nav className="nav-rail" aria-label={rail.atalhos}>
      {me && (
        <Link href={`/${lang}/r/${me.handle}`} className="rail-me">
          <Portrait ficha={me.rosto} nome={me.nome} tamanho={52} decorative />
          <span>{me.nome}</span>
        </Link>
      )}
      {items.map((i) => (
        <Link key={i.id} href={i.href} className="nav-item" aria-current={i.ativo ? 'page' : undefined}>
          {i.icone}
          <span>{i.texto}</span>
          {i.selo ? <span className="badge-num" aria-label={`${i.selo}`}>{i.selo > 9 ? '9+' : i.selo}</span> : null}
        </Link>
      ))}
    </nav>
  )
}
