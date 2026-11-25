// Denúncia sem identificar ninguém. O que sai do cliente tem só o alvo e o motivo (como no protocolo). Este site não cria
// identificador de visitante nenhum (nem cookie, nem impressão de endereço): quem denuncia não é contado, nem repetido, nem
// rastreado. O freio contra denúncia em massa é GLOBAL (de todos os visitantes juntos) e por alvo, nunca por pessoa.
// Na rede de verdade, quem denuncia é um rover, e o relé guarda só um pseudônimo dele (protocolo, seção de denúncia).

import { MOTIVOS_DENUNCIA, type EntradaDenuncia, type MotivoDenuncia } from '../tipos'
import { ehIdObjeto } from './ids'

export interface DenunciaValida {
  alvo: string
  motivo: MotivoDenuncia
}

export type ResultadoDenuncia = { ok: true; denuncia: DenunciaValida } | { ok: false; erro: 'alvo' | 'motivo' }

export function validarDenuncia(e: EntradaDenuncia): ResultadoDenuncia {
  if (!ehIdObjeto(e.alvo)) return { ok: false, erro: 'alvo' }
  if (!(MOTIVOS_DENUNCIA as readonly string[]).includes(e.motivo)) return { ok: false, erro: 'motivo' }
  return { ok: true, denuncia: { alvo: e.alvo, motivo: e.motivo } }
}

/** O corpo que viaja para o relé: só estes dois campos, nunca nada sobre quem enviou. */
export function corpoDaDenuncia(d: DenunciaValida): { alvo: string; motivo: MotivoDenuncia } {
  return { alvo: d.alvo, motivo: d.motivo }
}

export interface RegistroDeDenuncia extends DenunciaValida {
  em: string
}

/** Quantas denúncias o livro aceita por hora, somando todos os visitantes (contra denúncia em massa, sem saber quem é quem). */
export const TETO_GLOBAL_POR_HORA = 120
/** Quantas denúncias um mesmo alvo recebe no livro; passando disso, a moderação já tem o que precisa para olhar. */
export const TETO_POR_ALVO = 25

export class LivroDeDenuncias {
  private readonly porAlvo = new Map<string, RegistroDeDenuncia[]>()
  private horas: number[] = []

  /** `nova` ou `limite`. Nenhum dado sobre quem enviou chega aqui, então não há `repetida`. */
  receber(d: DenunciaValida, agora: Date): 'nova' | 'limite' {
    this.horas = this.horas.filter((t) => agora.getTime() - t < 3_600_000)
    const doAlvo = this.porAlvo.get(d.alvo) ?? []
    if (this.horas.length >= TETO_GLOBAL_POR_HORA || doAlvo.length >= TETO_POR_ALVO) return 'limite'
    this.porAlvo.set(d.alvo, [...doAlvo, { ...d, em: agora.toISOString() }])
    this.horas.push(agora.getTime())
    return 'nova'
  }

  total(alvo: string): number {
    return this.porAlvo.get(alvo)?.length ?? 0
  }

  /** Para a moderação: o conteúdo das denúncias, sem nenhuma pista de quem fez (não existe pista guardada). */
  paraModeracao(alvo: string): RegistroDeDenuncia[] {
    return [...(this.porAlvo.get(alvo) ?? [])]
  }
}
