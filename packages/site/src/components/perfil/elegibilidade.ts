// Quantos dias de amizade e de conta o leitor tem, para a tela dizer se ele pode escrever um depoimento ou dar
// um selo (3 e 7 dias, seção 8.2). É só um adiantamento da regra: quem decide é o relé. Se não der para saber,
// o leitor é tratado como elegível e o relé responde `conta-nova` se for o caso.

import type { ClienteRede } from '@/lib/cliente-rede'
import { podeNoPerfil, type Veredito } from '@/lib/dominio/permissoes'
import type { PaginaDoRover } from '@/lib/social/tipos'
import type { PodeDarSelo } from './Medalhas'

const DIA = 86_400_000

/**
 * Dias inteiros desde um instante ISO. `Infinity` quando falta a data (relé 0.3, ou conta sem a informação): a tela então trata o leitor
 * como elegível e quem recusa, se for o caso, é o relé.
 */
export function diasDesde(iso: string | null | undefined, agora: Date): number {
  const t = typeof iso === 'string' ? Date.parse(iso) : Number.NaN
  return Number.isFinite(t) ? Math.floor((agora.getTime() - t) / DIA) : Number.POSITIVE_INFINITY
}

export async function diasDeAmizade(cliente: ClienteRede, euUid: string, alvoUid: string, agora: Date): Promise<number> {
  let cursor: string | undefined
  for (let i = 0; i < 6; i++) {
    const p = await cliente.amigos(euUid, cursor).catch(() => null)
    if (!p) return Number.POSITIVE_INFINITY
    const achou = p.itens.find((a) => a.rover.uid === alvoUid)
    if (achou) return Math.floor((agora.getTime() - new Date(achou.desde).getTime()) / DIA)
    if (!p.proximo) break
    cursor = p.proximo
  }
  return Number.POSITIVE_INFINITY
}

export async function diasDeConta(cliente: ClienteRede, euUid: string, agora: Date): Promise<number> {
  const p = await cliente.obterRover(euUid).catch(() => null)
  return p?.desde ? Math.floor((agora.getTime() - new Date(p.desde).getTime()) / DIA) : Number.POSITIVE_INFINITY
}

export interface Elegibilidade {
  recado: Veredito
  depoimento: Veredito
  selo: Veredito
}

export function elegibilidade(pag: PaginaDoRover, amigoHaDias: number, contaDias: number): Elegibilidade {
  const v = pag.voce
  const base = { proprio: v?.papel === 'proprio', amigo: !!v?.amigo, amigoHaDias, contaDias, bloqueio: !!v?.euBloqueei, recados: pag.rover.recados }
  return { recado: podeNoPerfil('recado', base), depoimento: podeNoPerfil('depoimento', base), selo: podeNoPerfil('selo', base) }
}

export function podeDarSelo(pag: PaginaDoRover, e: Elegibilidade, temApp: boolean): PodeDarSelo {
  const v = pag.voce
  if (!temApp || !v || v.papel === 'proprio' || v.euBloqueei) return 'ninguem'
  if (e.selo.ok) return 'sim'
  if (!v.amigo) return 'nao-amigo'
  return e.selo.motivo === 'conta-nova' ? 'sem-tempo' : 'ninguem'
}
