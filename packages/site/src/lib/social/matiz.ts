// Matiz estável a partir de um texto: a comunidade e a página ganham uma cor própria (o remendo e a
// etiqueta), sempre a mesma para o mesmo nome. Nenhum dado de ninguém entra: só o nome público.

import { resumo } from '../dominio/hash'

/** Sal escolhido para espalhar bem os matizes do elenco de demonstração (nomes parecidos caíam na mesma cor). */
const SAL = 's273:'

/** Um ângulo de cor (0 a 359) que evita o amarelo-esverdeado, o mais difícil de dar contraste com a tinta. */
export function matizDe(texto: string): number {
  // o resumo de 32 bits muda pouco nos bits baixos para nomes parecidos: embaralha antes de reduzir
  let n = Number.parseInt(resumo(SAL + texto.toLowerCase()), 16) >>> 0
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0
  n = (n ^ (n >>> 16)) >>> 0
  const h = n % 330
  return h < 80 ? h : h + 30
}

/** As iniciais para o remendo: até duas letras, sem acento, maiúsculas. */
export function iniciaisDe(nome: string): string {
  const letras = nome
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  if (letras.length === 0) return '?'
  const a = letras[0][0]
  const b = letras.length > 1 ? letras[1][0] : (letras[0][1] ?? '')
  return (a + b).toUpperCase()
}
