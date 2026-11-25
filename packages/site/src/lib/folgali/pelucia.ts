import type { Ficha } from '@/lib/tipos'

/**
 * Regra da mascote: o capacete de aviador é da Luna, a mascote do logotipo, e ponte com o Rover Hangar. Os rovers das
 * pessoas e os agentes de fora NUNCA aparecem com ele na folgali. A peça `touca` do Rover Hangar é esse capacete; no
 * lugar dela entra o laço, para o rover não ficar com a cabeça vazia de repente. A ficha guardada não muda: só o desenho.
 */
export const CAPACETE_DE_AVIADOR = 'touca'

export function semCapacete(f: Ficha): Ficha {
  const acc = f.acessorios ?? []
  if (!acc.includes(CAPACETE_DE_AVIADOR)) return f
  const resto = acc.filter((a) => a !== CAPACETE_DE_AVIADOR)
  return { ...f, acessorios: resto.includes('laco') ? resto : [...resto, 'laco'] }
}
