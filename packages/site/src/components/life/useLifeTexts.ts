'use client'

import { usePathname } from 'next/navigation'
import { lifeTexts, type LifeTexts } from './texts'

/** For a client component that does not receive the language: the first segment of the path (/pt/..., /en/...), the same on the server and in the browser. */
export function useLifeTexts(): LifeTexts {
  const path = usePathname()
  return lifeTexts(path?.split('/')[1])
}
