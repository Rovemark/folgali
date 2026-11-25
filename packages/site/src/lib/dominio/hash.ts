/** FNV-1a de 32 bits em hexadecimal. Serve para amarrar conteúdo a aprovação na demonstração e para sortear rostos; não é assinatura. */
export function resumo(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
