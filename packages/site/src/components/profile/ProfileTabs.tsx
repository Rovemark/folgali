'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

import { TABS, type Tab } from './tabs'

/**
 * The tabs of the rover page: real links (each tab is a screen), with the number when it exists. On
 * the phone the row scrolls sideways, and the current tab always settles into view.
 */
export default function ProfileTabs({ base, atual: current, rotulos: labels, numeros: numbers, rotuloGeral }: { base: string; atual: Tab; rotulos: Record<Tab, string>; numeros: Partial<Record<Tab, number | null>>; rotuloGeral: string }) {
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const activeFlag = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (activeFlag && nav.current) nav.current.scrollLeft = Math.max(0, activeFlag.offsetLeft - (nav.current.clientWidth - activeFlag.offsetWidth) / 2)
  }, [current])
  return (
    <nav ref={nav} className="sub-nav pf-tabs" aria-label={rotuloGeral}>
      {TABS.map((a) => (
        <Link key={a} href={a === 'mural' ? base : `${base}?aba=${a}`} aria-current={a === current ? 'page' : undefined} scroll={false}>
          {labels[a]}
          {typeof numbers[a] === 'number' && <span className="num">{numbers[a]}</span>}
        </Link>
      ))}
    </nav>
  )
}
