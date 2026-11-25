// "Em alta": quanto uma postagem esquentou nas últimas horas. Reação vale 1, resposta vale 2, e o
// calor cai pela metade a cada 24 horas. Postagem apagada não esquenta ninguém.

import type { Postagem } from '../tipos'

export const MEIA_VIDA_HORAS = 24

export function pontuar(p: Pick<Postagem, 'reacoes' | 'respostas' | 'criadaEm' | 'removida'>, agora: Date): number {
  if (p.removida) return 0
  const horas = Math.max(0, (agora.getTime() - new Date(p.criadaEm).getTime()) / 3_600_000)
  const bruto = p.reacoes.curtir + p.reacoes.util + 2 * p.respostas
  return bruto * Math.pow(0.5, horas / MEIA_VIDA_HORAS)
}

export function rankear(postagens: Postagem[], agora: Date): Array<{ uid: string; pontos: number }> {
  const soma = new Map<string, number>()
  for (const p of postagens) soma.set(p.autor.uid, (soma.get(p.autor.uid) ?? 0) + pontuar(p, agora))
  return [...soma.entries()]
    .map(([uid, pontos]) => ({ uid, pontos }))
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.uid.localeCompare(b.uid))
}
