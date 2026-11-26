'use client'

import React from '@/components/life/ReactButton'

/** Like in the demonstration: changes only on this screen (the posts of the time off do not exist in the relay yet). With the five reactions. */
export default function LikeButton({ rotulo: label, ajuda: help }: { rotulo: string; ajuda: string }) {
  return <React rotulo={label} ajuda={help} />
}
