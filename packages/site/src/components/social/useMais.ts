'use client'

import { useCallback, useState, useTransition } from 'react'
import { moreAction, type ListRequest } from '@/app/social-actions'
import type { Page } from '@/lib/types'

/** "See more" of any paginated list: joins the pages without repeating an item and says if it failed. */
export function useMore<T>(initial: Page<T>, request: Omit<ListRequest, 'cursor'>, key: (x: T) => string) {
  const [items, setItems] = useState<T[]>(initial.itens)
  const [next, setNext] = useState<string | undefined>(initial.proximo)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  const optionsKey = JSON.stringify(request.opcoes)
  const { lista: list, de: from } = request
  const options = request.opcoes
  const more = useCallback(() => {
    if (!next) return
    start(async () => {
      const r = (await moreAction({ lista: list, de: from, opcoes: options, cursor: next })) as Page<T> | null
      if (!r) return setFailed(true)
      setFailed(false)
      setItems((current) => {
        const seen = new Set(current.map(key))
        return [...current, ...r.itens.filter((n) => !seen.has(key(n)))]
      })
      setNext(r.proximo)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, list, from, optionsKey])

  return { itens: items, setItems, proximo: next, failed, pendente: pending, mais: more }
}
