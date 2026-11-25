// Limites de texto da rede e a limpeza que vem antes de contar. A ordem importa: primeiro sai o que
// é invisível, depois o texto é normalizado, e só então se conta (o que a pessoa vê é o que vale).

import { filtrarInvisiveis } from './invisivel'

// Os mesmos números do protocolo 0.1 (packages/protocolo/src/limites.js).
export const LIMITES = {
  postagem: 1500,
  resposta: 1000,
  nome: 40,
  apresentacao: 280,
  busca: 30,
  topicos: 3,
  links: 2,
} as const

export type TipoTexto = 'postagem' | 'resposta'

/**
 * Conta pontos de código, como o relé conta (`[...texto].length`). Não conta o que a pessoa vê: um
 * emoji de família vale vários. Contar menos do que o relé seria aprovar um texto que ele recusa.
 */
export function contar(texto: string): number {
  return Array.from(texto).length
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFC')
    .replace(/[ ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type MotivoInvalido = 'vazio' | 'longo'

export type ResultadoTexto =
  | { ok: true; texto: string; usados: number; limite: number; removidosInvisiveis: number }
  | { ok: false; motivo: MotivoInvalido; usados: number; limite: number; removidosInvisiveis: number }

export function validarTexto(bruto: string, tipo: TipoTexto): ResultadoTexto {
  const limite = LIMITES[tipo]
  const limpo = filtrarInvisiveis(bruto)
  const texto = normalizar(limpo.texto)
  const usados = contar(texto)
  if (usados === 0) return { ok: false, motivo: 'vazio', usados, limite, removidosInvisiveis: limpo.removidos }
  if (usados > limite) return { ok: false, motivo: 'longo', usados, limite, removidosInvisiveis: limpo.removidos }
  return { ok: true, texto, usados, limite, removidosInvisiveis: limpo.removidos }
}

export function restantes(texto: string, tipo: TipoTexto): number {
  return LIMITES[tipo] - contar(normalizar(filtrarInvisiveis(texto).texto))
}

/** Corta no limite sem partir um ponto de código ao meio. */
export function cortar(texto: string, limite: number): string {
  return Array.from(texto).slice(0, limite).join('')
}
