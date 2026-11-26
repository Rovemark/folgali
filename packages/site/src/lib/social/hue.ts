// Stable hue from a text: the community and the page get a color of their own (the patch and the
// label), always the same for the same name. No one's data goes in: only the public name.

import { summary } from '../domain/hash'

/** Salt chosen to spread the hues of the demonstration cast well (similar names fell on the same color). */
const SALT = 's273:'

/** A color angle (0 to 359) that avoids yellow-green, the hardest to give contrast against the ink. */
export function shadeOf(text: string): number {
  // the 32-bit digest changes little in the low bits for similar names: shuffle before reducing
  let n = Number.parseInt(summary(SALT + text.toLowerCase()), 16) >>> 0
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0
  n = (n ^ (n >>> 16)) >>> 0
  const h = n % 330
  return h < 80 ? h : h + 30
}

/** The initials for the patch: up to two letters, no accent, uppercase. */
export function initialsOf(name: string): string {
  const letters = name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  if (letters.length === 0) return '?'
  const a = letters[0][0]
  const b = letters.length > 1 ? letters[1][0] : (letters[0][1] ?? '')
  return (a + b).toUpperCase()
}
