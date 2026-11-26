// Load from the relay WITHOUT bringing the page down: the screen decides what to show for each error code.
// (An error thrown in a server component reaches the browser without the class or the message, so
// every social page uses this instead of a loose try/catch.)

import { NetworkError, type ErrorCode } from '../types'

export type Loaded<T> = { ok: true; valor: T } | { ok: false; codigo: ErrorCode }

export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, valor: await fn() }
  } catch (e) {
    return { ok: false, codigo: e instanceof NetworkError ? e.codigo : 'indisponivel' }
  }
}

/** What the screen shows for each code: the key of the `socComum.erros` dictionary and whether it is a "does not exist" case. */
export function stateType(c: ErrorCode): 'nao-existe' | 'sem-permissao' | 'privado' | 'removido' | 'fora-do-ar' | 'limite' | 'outro' {
  switch (c) {
    case 'nao-encontrado':
    case 'invalido':
      return 'nao-existe'
    case 'proibido':
    case 'sem-permissao':
    case 'interacao-nao-permitida':
    case 'banido':
    case 'nao-e-membro':
      return 'sem-permissao'
    case 'grafo-privado':
      return 'privado'
    case 'removido':
      return 'removido'
    case 'indisponivel':
    case 'versao-nao-suportada':
      return 'fora-do-ar'
    case 'limite':
    case 'limite-de-estrutura':
      return 'limite'
    default:
      return 'outro'
  }
}
