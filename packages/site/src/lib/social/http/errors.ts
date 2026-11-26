// From the relay error (`{ erro: { codigo } }` and the HTTP status) to the site's `ErrorCode`. The relay message
// is never read: it is text from a stranger. An unknown code falls back to the status.

import type { ErrorCode } from '../../types'

const BY_CODE: Record<string, ErrorCode> = {
  esquema: 'invalido',
  nao_encontrado: 'nao-encontrado',
  sem_permissao: 'sem-permissao',
  interacao_nao_permitida: 'interacao-nao-permitida',
  conta_nova: 'conta-nova',
  banido: 'banido',
  nao_e_membro: 'nao-e-membro',
  ja_existe: 'ja-existe',
  limite_de_estrutura: 'limite-de-estrutura',
  trancado: 'trancado',
  enquete_encerrada: 'enquete-encerrada',
  fora_da_janela: 'fora-da-janela',
  limite_de_taxa: 'limite',
  grafo_privado: 'grafo-privado',
  removido: 'removido',
  resposta_funda: 'resposta-funda',
  leitura_nao_autorizada: 'proibido',
  versao_nao_suportada: 'versao-nao-suportada',
}

export function relayCode(status: number, body: unknown): ErrorCode {
  if (typeof body === 'object' && body !== null) {
    const e = (body as { erro?: unknown }).erro
    const c = typeof e === 'object' && e !== null ? (e as { codigo?: unknown }).codigo : undefined
    if (typeof c === 'string' && Object.hasOwn(BY_CODE, c)) return BY_CODE[c]
  }
  if (status === 404) return 'nao-encontrado'
  if (status === 410) return 'removido'
  if (status === 400 || status === 422) return 'invalido'
  if (status === 401 || status === 403) return 'proibido'
  if (status === 429) return 'limite'
  return 'indisponivel'
}
