// The rover's @. The shape is the same as the Rover Hangar contract: 3 to 30 characters of a-z, 0-9, dot and
// underscore, no dot at the ends, no two dots in a row, at least one letter.

export const HANDLE_RE = /^(?!\.)(?!.*\.\.)(?=.*[a-z])[a-z0-9._]{3,30}(?<!\.)$/

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase()
}

export function validHandle(input: string): boolean {
  return HANDLE_RE.test(normalizeHandle(input))
}

/**
 * Turns what the person typed in the search into a safe, comparable term: no at sign, no
 * accent, lowercase, only the characters an @ or a name can have, at most 30.
 */
export function searchTerm(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/^[@\s]+/, '')
    .replace(/[^a-z0-9._ ]+/g, '')
    .trim()
    .slice(0, 30)
}
