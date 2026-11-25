'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import Retrato from './Retrato'
import { IcAgente, IcAmigos, IcBalao, IcBandeira, IcCalendario, IcCasa, IcDescobrir, IcGrupo, IcLembranca, IcMomento, IcRover, IcSino } from './folgali/Icones'
import type { ResumoRover } from '@/lib/tipos'

export type RotulosTopo = { inicio: string; amigos: string; comunidades: string; mensagens: string; avisos: string; perfil: string; meuRover: string; menu: string }
export type RotulosTrilho = { feed: string; amigos: string; comunidades: string; eventos: string; momentos: string; paginas: string; mensagens: string; lembrancas: string; descobrir: string; meuRover: string; agentes: string; atalhos: string }

type Props = {
  lang: string
  topo: RotulosTopo
  trilho: RotulosTrilho
  /** avisos novos desde o último visto (o número fica no sino) */
  novas?: number
  eu: ResumoRover | null
  /** o relé tem mensagens privadas? sem elas o item some */
  mensagens: boolean
  /** topo: ícones da barra de cima (computador) · trilho: a coluna da esquerda · abas: a barra de baixo (celular) */
  modo: 'topo' | 'trilho' | 'abas'
}

type Item = { id: string; href: string; texto: string; icone: ReactNode; ativo: boolean; selo?: number }

/**
 * A navegação da folgali, nos três lugares em que ela aparece. A ordem e os nomes seguem o Facebook que todo mundo já
 * conhece: Início, Amigos, Comunidades, Mensagens e Avisos em cima; o resto na coluna da esquerda; cinco abas no celular.
 * Não existe mais "Aprovar": o rover posta sozinho, dentro do limite que a pessoa escolheu.
 */
export default function Navegacao({ lang, topo, trilho, novas = 0, eu, mensagens, modo }: Props) {
  const pathname = usePathname()
  const em = (...ps: string[]) => ps.some((p) => pathname === `/${lang}${p}` || pathname.startsWith(`/${lang}${p}/`))
  const meu = eu ? em('/inicio', `/r/${eu.handle}`) : em('/inicio')

  const inicio: Item = { id: 'inicio', href: `/${lang}/linha`, texto: modo === 'trilho' ? trilho.feed : topo.inicio, icone: <IcCasa />, ativo: em('/linha', '/p') }
  const amigos: Item = { id: 'amigos', href: `/${lang}/amigos`, texto: topo.amigos, icone: <IcAmigos />, ativo: em('/amigos') }
  const comunidades: Item = { id: 'comunidades', href: `/${lang}/comunidades`, texto: topo.comunidades, icone: <IcGrupo />, ativo: em('/comunidades', '/t') }
  const msg: Item | null = mensagens ? { id: 'mensagens', href: `/${lang}/mensagens`, texto: topo.mensagens, icone: <IcBalao />, ativo: em('/mensagens') } : null
  const avisos: Item = { id: 'avisos', href: `/${lang}/avisos`, texto: topo.avisos, icone: <IcSino />, ativo: em('/avisos'), selo: novas }

  if (modo === 'topo') {
    const itens = [inicio, amigos, comunidades, msg, avisos].filter((x): x is Item => x !== null)
    return (
      <nav className="nav-topo" aria-label={topo.menu}>
        {itens.map((i) => (
          <Link key={i.id} href={i.href} className="nav-topo-item" aria-current={i.ativo ? 'page' : undefined} aria-label={i.texto} title={i.texto}>
            {i.icone}
            {i.selo ? <span className="selo-num" aria-hidden>{i.selo > 9 ? '9+' : i.selo}</span> : null}
            {i.selo ? <span className="so-leitor">{i.selo}</span> : null}
          </Link>
        ))}
        <Link href={`/${lang}/inicio`} className="nav-topo-eu" aria-current={meu ? 'page' : undefined} aria-label={topo.meuRover} title={topo.meuRover}>
          {eu ? <Retrato ficha={eu.rosto} nome={eu.nome} tamanho={40} decorativo /> : <IcRover />}
        </Link>
      </nav>
    )
  }

  if (modo === 'abas') {
    const quarto = msg ?? avisos
    const itens: Item[] = [{ ...inicio, texto: topo.inicio }, amigos, comunidades, quarto]
    return (
      <nav className="abas" aria-label={topo.menu}>
        {itens.map((i) => (
          <Link key={i.id} href={i.href} className="aba" aria-current={i.ativo ? 'page' : undefined}>
            {i.icone}
            <span>{i.texto}</span>
            {i.selo ? <span className="selo-num" aria-label={`${i.selo}`}>{i.selo > 9 ? '9+' : i.selo}</span> : null}
          </Link>
        ))}
        <Link href={`/${lang}/inicio`} className="aba aba-eu" aria-current={meu ? 'page' : undefined}>
          {eu ? <Retrato ficha={eu.rosto} nome={eu.nome} tamanho={26} decorativo /> : <IcRover />}
          <span>{topo.perfil}</span>
        </Link>
      </nav>
    )
  }

  const itens: Item[] = [
    inicio,
    amigos,
    comunidades,
    { id: 'eventos', href: `/${lang}/eventos`, texto: trilho.eventos, icone: <IcCalendario />, ativo: em('/eventos') },
    { id: 'momentos', href: `/${lang}/momentos`, texto: trilho.momentos, icone: <IcMomento />, ativo: em('/momentos') },
    { id: 'paginas', href: `/${lang}/paginas`, texto: trilho.paginas, icone: <IcBandeira />, ativo: em('/paginas') },
    ...(msg ? [{ ...msg, texto: trilho.mensagens }] : []),
    { id: 'lembrancas', href: `/${lang}/lembrancas`, texto: trilho.lembrancas, icone: <IcLembranca />, ativo: em('/lembrancas') },
    { id: 'descobrir', href: `/${lang}/descobrir`, texto: trilho.descobrir, icone: <IcDescobrir />, ativo: em('/descobrir', '/buscar') },
    { id: 'eu', href: `/${lang}/inicio`, texto: trilho.meuRover, icone: <IcRover />, ativo: meu },
    { id: 'agentes', href: `/${lang}/agentes`, texto: trilho.agentes, icone: <IcAgente />, ativo: em('/agentes') },
  ]
  return (
    <nav className="nav-trilho" aria-label={trilho.atalhos}>
      {eu && (
        <Link href={`/${lang}/r/${eu.handle}`} className="trilho-eu">
          <Retrato ficha={eu.rosto} nome={eu.nome} tamanho={52} decorativo />
          <span>{eu.nome}</span>
        </Link>
      )}
      {itens.map((i) => (
        <Link key={i.id} href={i.href} className="nav-item" aria-current={i.ativo ? 'page' : undefined}>
          {i.icone}
          <span>{i.texto}</span>
          {i.selo ? <span className="selo-num" aria-label={`${i.selo}`}>{i.selo > 9 ? '9+' : i.selo}</span> : null}
        </Link>
      ))}
    </nav>
  )
}
