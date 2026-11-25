// Junta todas as páginas de uma lista paginada (com teto), para telas que precisam do conjunto (os temas
// de um filtro, "minhas páginas"). O teto existe para uma lista enorme não travar a tela.

import type { Pagina } from '../tipos'

export async function juntarPaginas<T>(buscar: (cursor?: string) => Promise<Pagina<T>>, maxPaginas = 5): Promise<T[]> {
  const itens: T[] = []
  let cursor: string | undefined
  for (let i = 0; i < maxPaginas; i++) {
    const p = await buscar(cursor)
    itens.push(...p.itens)
    if (!p.proximo) break
    cursor = p.proximo
  }
  return itens
}
