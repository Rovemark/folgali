// Moderação (seção 10): o que a moderação pode dizer (um motivo do enum, nunca texto livre), quem decide
// a apelação, a janela de 14 dias e a ordem da fila. REGRA CENTRAL: nenhuma quantidade de denúncias
// esconde ou remove conteúdo; `peso` só ordena. Quem decide é sempre uma pessoa com papel.

import { MOTIVOS_MODERACAO, type DenunciaNaFila, type MotivoModeracao, type RegistroModeracao } from '../social/tipos'

export const JANELA_DE_APELACAO_DIAS = 14

export type AcaoDeGestao = 'convidar' | 'cancelar-convite' | 'aprovar-pedido' | 'recusar-pedido' | 'expulsar' | 'banir' | 'desbanir' | 'promover' | 'rebaixar'

/** `motivo` é obrigatório em expulsar e banir, e tem de ser nulo nas demais (seção 4.11). */
export function exigeMotivo(acao: AcaoDeGestao): boolean {
  return acao === 'expulsar' || acao === 'banir'
}

export type ErroDeGestao = 'motivo-obrigatorio' | 'motivo-proibido' | 'motivo-invalido'

export function validarGestao(acao: AcaoDeGestao, motivo: MotivoModeracao | null): ErroDeGestao | null {
  if (exigeMotivo(acao)) {
    if (motivo === null) return 'motivo-obrigatorio'
    return (MOTIVOS_MODERACAO as readonly string[]).includes(motivo) ? null : 'motivo-invalido'
  }
  return motivo === null ? null : 'motivo-proibido'
}

/** Dentro de 14 dias da remoção ou do banimento. */
export function podeApelar(emIso: string, agora: Date): boolean {
  const passou = agora.getTime() - new Date(emIso).getTime()
  return passou >= 0 && passou <= JANELA_DE_APELACAO_DIAS * 86_400_000
}

/** Quanto falta da janela, em dias inteiros (para a tela dizer "ainda dá para apelar por 9 dias"). */
export function diasRestantesParaApelar(emIso: string, agora: Date): number {
  const resta = JANELA_DE_APELACAO_DIAS * 86_400_000 - (agora.getTime() - new Date(emIso).getTime())
  return Math.max(0, Math.ceil(resta / 86_400_000))
}

/** Quem decide a apelação: o dono, se quem agiu foi um moderador; a administração do relé nos outros casos. */
export function quemDecideApelacao(quemAgiu: RegistroModeracao['por']): 'dono' | 'rele' {
  return quemAgiu === 'moderador' ? 'dono' : 'rele'
}

/** A fila, do mais pesado ao mais leve, depois do mais recente. Não esconde nada e não remove nada. */
export function ordenarFila(itens: DenunciaNaFila[]): DenunciaNaFila[] {
  return [...itens].sort((a, b) => b.peso - a.peso || (a.ultimaEm < b.ultimaEm ? 1 : a.ultimaEm > b.ultimaEm ? -1 : a.alvo.localeCompare(b.alvo)))
}

/** O motivo mais citado de uma denúncia (para o título do cartão da fila). */
export function motivoPrincipal(d: Pick<DenunciaNaFila, 'motivos'>): string | null {
  let melhor: string | null = null
  let n = 0
  for (const [m, q] of Object.entries(d.motivos)) {
    if ((q ?? 0) > n) {
      melhor = m
      n = q ?? 0
    }
  }
  return melhor
}
