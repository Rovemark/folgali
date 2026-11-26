'use client'

import { usePathname } from 'next/navigation'
import Skeleton from '@/components/social/Skeleton'
import { pathLanguage, clientTexts } from '@/lib/i18n-client'

/** The "loading" of the profile area screens: the screen reader text comes from the language of the route. */
export default function LoadingProfile({ lines = 6, blocks = 2 }: { lines?: number; blocks?: number }) {
  const d = clientTexts(pathLanguage(usePathname()))
  return (
    <div className="stack">
      {Array.from({ length: blocks }, (_, i) => (
        <Skeleton key={i} lines={i === 0 ? lines : 3} rotulo={d.comum.carregando} />
      ))}
    </div>
  )
}
