// Ajudantes dos testes do cliente falso social: o relógio é nosso, e qualquer rover pode ser o leitor.
import { ClienteFalso } from '@/lib/cliente-falso'
import { semente, uidDe } from '@/lib/demo-dados'
import { SEM_GANCHOS, RedeSocialFalsa } from '@/lib/social/falso'
import { ErroRede, type CodigoErro } from '@/lib/tipos'

export const AGORA = new Date('2026-11-05T15:00:00Z')
export const U = uidDe

export class Relogio {
  constructor(public t = AGORA.getTime()) {}
  avancar(ms: number) {
    this.t += ms
  }
  leitura = () => new Date(this.t)
}

/** O cliente de demonstração completo (o leitor é a Lumi), com relógio controlável. */
export function cliente(rel = new Relogio()) {
  return { c: new ClienteFalso(rel.leitura), rel }
}

/** A rede social com QUALQUER rover como leitor (para provar o que quem está de fora não vê). */
export function como(slug: string, rel = new Relogio()) {
  return { r: new RedeSocialFalsa(rel.leitura, uidDe(slug), SEM_GANCHOS, semente(rel.leitura()).rovers), rel }
}

/** Roda e devolve o código do ErroRede (ou 'ok'); qualquer outro erro estoura o teste. */
export async function codigo(f: () => unknown): Promise<CodigoErro | 'ok'> {
  try {
    await f()
    return 'ok'
  } catch (e) {
    if (e instanceof ErroRede) return e.codigo
    throw e
  }
}
export async function mensagem(f: () => unknown): Promise<string> {
  try {
    await f()
    return 'ok'
  } catch (e) {
    if (e instanceof ErroRede) return e.message
    throw e
  }
}
export const DIA = 86_400_000
export const HORA = 3_600_000
