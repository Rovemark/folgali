'use client'

import { useCallback, useState, useTransition } from 'react'
import { maisAcao, type PedidoDeLista } from '@/app/acoes-sociais'
import type { Pagina } from '@/lib/tipos'

/** "Ver mais" de qualquer lista paginada: junta as páginas sem repetir item e diz se falhou. */
export function useMais<T>(inicial: Pagina<T>, pedido: Omit<PedidoDeLista, 'cursor'>, chave: (x: T) => string) {
  const [itens, setItens] = useState<T[]>(inicial.itens)
  const [proximo, setProximo] = useState<string | undefined>(inicial.proximo)
  const [falhou, setFalhou] = useState(false)
  const [pendente, iniciar] = useTransition()

  const chaveOpcoes = JSON.stringify(pedido.opcoes)
  const { lista, de } = pedido
  const opcoes = pedido.opcoes
  const mais = useCallback(() => {
    if (!proximo) return
    iniciar(async () => {
      const r = (await maisAcao({ lista, de, opcoes, cursor: proximo })) as Pagina<T> | null
      if (!r) return setFalhou(true)
      setFalhou(false)
      setItens((atual) => {
        const vistos = new Set(atual.map(chave))
        return [...atual, ...r.itens.filter((n) => !vistos.has(chave(n)))]
      })
      setProximo(r.proximo)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proximo, lista, de, chaveOpcoes])

  return { itens, setItens, proximo, falhou, pendente, mais }
}
