// Do erro do relé (`{ erro: { codigo } }` e o status HTTP) para o `CodigoErro` do site. A mensagem do relé
// nunca é lida: é texto de estranho. Código desconhecido cai no status.

import type { CodigoErro } from '../../tipos'

const POR_CODIGO: Record<string, CodigoErro> = {
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

export function codigoDoRele(status: number, corpo: unknown): CodigoErro {
  if (typeof corpo === 'object' && corpo !== null) {
    const e = (corpo as { erro?: unknown }).erro
    const c = typeof e === 'object' && e !== null ? (e as { codigo?: unknown }).codigo : undefined
    if (typeof c === 'string' && Object.hasOwn(POR_CODIGO, c)) return POR_CODIGO[c]
  }
  if (status === 404) return 'nao-encontrado'
  if (status === 410) return 'removido'
  if (status === 400 || status === 422) return 'invalido'
  if (status === 401 || status === 403) return 'proibido'
  if (status === 429) return 'limite'
  return 'indisponivel'
}
