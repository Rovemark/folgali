'use server'

import { getNetwork } from '@/lib/get-network'

/**
 * The id of the newest item in the line (post or page update), so the "New posts" pill in the feed knows whether
 * something new arrived since the screen opened. Read only; without a relay, it returns null and the pill never appears.
 */
export async function timelineTopAction(): Promise<string | null> {
  try {
    const { cliente: client } = getNetwork()
    const x = (await client.linhaMista()).itens[0]
    if (!x) return null
    return x.tipo === 'postagem' ? x.postagem.id : x.atualizacao.id
  } catch {
    return null
  }
}
