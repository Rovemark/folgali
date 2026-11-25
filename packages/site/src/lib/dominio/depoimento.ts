// O ciclo do depoimento (seção 4.4): escrito por um amigo, nasce PENDENTE, só aparece depois de o dono
// aceitar, e o dono pode esconder depois um que já estava aceito. Pendente nunca é público: só o dono e
// o autor leem. Puro.

import type { Depoimento, EstadoDepoimento } from '../social/tipos'

export const DIAS_DE_ESPERA_APOS_RECUSA = 7
export const MAX_PENDENTES = 20

export type DecisaoDeDepoimento = 'aceitar' | 'recusar'

/**
 * O estado depois da decisão do dono. Aceitar só vale para um pendente; recusar vale para pendente
 * ou aceito (é o jeito de esconder um depoimento que já estava no mural). Recusado não volta.
 */
export function aplicarDecisao(atual: EstadoDepoimento, decisao: DecisaoDeDepoimento): EstadoDepoimento | null {
  if (atual === 'recusado') return null
  if (decisao === 'aceitar') return atual === 'pendente' ? 'aceito' : null
  return 'recusado'
}

/** Quem lê o quê: aceito é de todos; pendente é só do dono e do autor; recusado não aparece para ninguém. */
export function visivelPara(d: Pick<Depoimento, 'estado' | 'alvo'> & { autor: { uid: string } }, leitorUid: string | null): boolean {
  if (d.estado === 'aceito') return true
  if (d.estado === 'recusado' || leitorUid === null) return false
  return leitorUid === d.alvo || leitorUid === d.autor.uid
}

export type MotivoDeEspera = 'ja-existe' | 'espera' | 'limite-de-estrutura'

/**
 * Pode este amigo escrever outro depoimento para este dono? Um vivo (pendente ou aceito) por par;
 * depois de recusado, 7 dias de espera; o dono tem no máximo 20 pendentes.
 */
export function podeEscreverOutro(
  doPar: Pick<Depoimento, 'estado' | 'criadoEm'>[],
  pendentesDoDono: number,
  agoraMs: number,
  recusadoEmMs?: number,
): { ok: true } | { ok: false; motivo: MotivoDeEspera } {
  if (doPar.some((d) => d.estado === 'pendente' || d.estado === 'aceito')) return { ok: false, motivo: 'ja-existe' }
  if (recusadoEmMs !== undefined && agoraMs - recusadoEmMs < DIAS_DE_ESPERA_APOS_RECUSA * 86_400_000) return { ok: false, motivo: 'espera' }
  if (pendentesDoDono >= MAX_PENDENTES) return { ok: false, motivo: 'limite-de-estrutura' }
  return { ok: true }
}
