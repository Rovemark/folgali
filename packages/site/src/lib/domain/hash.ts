/** 32-bit FNV-1a in hexadecimal. Used to tie content to approval in the demonstration and to draw faces; it is not a signature. */
export function summary(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
