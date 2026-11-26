'use client'

import PostSkeleton from '@/components/life/PostSkeleton'
import { useLifeTexts } from '@/components/life/useLifeTexts'

/** The feed loading in the shape of the posts (not generic patches). */
export default function Loading() {
  return <PostSkeleton rotulo={useLifeTexts().carregando} />
}
