'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

import { ABAS, type Aba } from './abas'

/**
 * As abas da página do rover: links de verdade (cada aba é uma tela), com o número quando ele existe. No
 * celular a fila rola de lado, e a aba atual sempre se acomoda à vista.
 */
export default function PerfilAbas({ base, atual, rotulos, numeros, rotuloGeral }: { base: string; atual: Aba; rotulos: Record<Aba, string>; numeros: Partial<Record<Aba, number | null>>; rotuloGeral: string }) {
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const ativa = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (ativa && nav.current) nav.current.scrollLeft = Math.max(0, ativa.offsetLeft - (nav.current.clientWidth - ativa.offsetWidth) / 2)
  }, [atual])
  return (
    <nav ref={nav} className="sub-nav pf-abas" aria-label={rotuloGeral}>
      {ABAS.map((a) => (
        <Link key={a} href={a === 'mural' ? base : `${base}?aba=${a}`} aria-current={a === atual ? 'page' : undefined} scroll={false}>
          {rotulos[a]}
          {typeof numeros[a] === 'number' && <span className="num">{numeros[a]}</span>}
        </Link>
      ))}
    </nav>
  )
}
