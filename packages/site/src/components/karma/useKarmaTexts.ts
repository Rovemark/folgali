'use client'

import { usePathname } from 'next/navigation'
import { isLocale } from '@/lib/i18n-base'
import { karmaTexts, type KarmaTexts } from '@/i18n/karma'

/** The karma texts of the page language (the first path segment), for client islands that the server cannot hand them to. */
export function useKarmaTexts(): KarmaTexts {
  const segment = usePathname()?.split('/')[1] ?? 'pt'
  return karmaTexts(isLocale(segment) ? segment : 'pt')
}
