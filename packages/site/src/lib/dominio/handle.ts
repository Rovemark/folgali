// O @ do rover. A forma é a mesma do contrato do Rover Hangar: 3 a 30 caracteres de a-z, 0-9, ponto e
// sublinhado, sem ponto na ponta, sem dois pontos seguidos, ao menos uma letra.

export const HANDLE_RE = /^(?!\.)(?!.*\.\.)(?=.*[a-z])[a-z0-9._]{3,30}(?<!\.)$/

export function normalizarHandle(entrada: string): string {
  return entrada.trim().replace(/^@/, '').toLowerCase()
}

export function handleValido(entrada: string): boolean {
  return HANDLE_RE.test(normalizarHandle(entrada))
}

/**
 * Transforma o que a pessoa digitou na busca em um termo seguro e comparável: sem arroba, sem
 * acento, minúsculo, só os caracteres que um @ ou um nome podem ter, no máximo 30.
 */
export function termoDeBusca(entrada: string): string {
  return entrada
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/^[@\s]+/, '')
    .replace(/[^a-z0-9._ ]+/g, '')
    .trim()
    .slice(0, 30)
}
