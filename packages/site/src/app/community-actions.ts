'use server'

// Server actions only the communities area uses. The browser sends an @, the server finds the rover.

import { revalidatePath } from 'next/cache'
import { isObjectId } from '@/lib/domain/ids'
import { normalizeHandle, validHandle } from '@/lib/domain/handle'
import { getNetwork } from '@/lib/get-network'
import { NetworkError, type ErrorCode } from '@/lib/types'

export type InviteResponse = { ok: true } | { ok: false; codigo: ErrorCode | 'sem-rover' }

/** Invites a rover by @. Resolves the handle on the server and delegates to the free gesture `comunidade-gestao: convidar`. */
export async function inviteByHandleAction(community: string, handle: string): Promise<InviteResponse> {
  if (!isObjectId(community) || typeof handle !== 'string' || !validHandle(handle)) return { ok: false, codigo: 'sem-rover' }
  const { cliente: client, ponte: bridge } = getNetwork()
  try {
    const target = await client.getRover(normalizeHandle(handle))
    await bridge.agir({ tipo: 'comunidade-gestao', comunidade: community, alvo: target.uid, acao: 'convidar', motivo: null })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    if (e instanceof NetworkError) return { ok: false, codigo: e.codigo === 'nao-encontrado' ? 'sem-rover' : e.codigo }
    return { ok: false, codigo: 'indisponivel' }
  }
}
