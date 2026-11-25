'use server'

// Ações do servidor que só a área de comunidades usa. O navegador manda um @, o servidor acha o rover.

import { revalidatePath } from 'next/cache'
import { ehIdObjeto } from '@/lib/dominio/ids'
import { normalizarHandle, handleValido } from '@/lib/dominio/handle'
import { obterRede } from '@/lib/obter-rede'
import { ErroRede, type CodigoErro } from '@/lib/tipos'

export type RespostaConvite = { ok: true } | { ok: false; codigo: CodigoErro | 'sem-rover' }

/** Convida um rover pelo @. Resolve o handle no servidor e delega ao gesto livre `comunidade-gestao: convidar`. */
export async function convidarPorHandleAcao(comunidade: string, handle: string): Promise<RespostaConvite> {
  if (!ehIdObjeto(comunidade) || typeof handle !== 'string' || !handleValido(handle)) return { ok: false, codigo: 'sem-rover' }
  const { cliente, ponte } = obterRede()
  try {
    const alvo = await cliente.obterRover(normalizarHandle(handle))
    await ponte.agir({ tipo: 'comunidade-gestao', comunidade, alvo: alvo.uid, acao: 'convidar', motivo: null })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    if (e instanceof ErroRede) return { ok: false, codigo: e.codigo === 'nao-encontrado' ? 'sem-rover' : e.codigo }
    return { ok: false, codigo: 'indisponivel' }
  }
}
