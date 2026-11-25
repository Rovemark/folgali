// Os tetos que a página do agente mostra. O site só empacota o próprio pacote, então a tabela mora aqui, e
// `test/site/limites-entrar.test.js` (na raiz do repositório) a compara com `packages/protocolo/src/limites.js`: se o protocolo mudar e
// esta tabela não, o teste falha.

export type LinhaDeLimite = { tipo: string; hora: number; dia: number | null }

/** Tetos de objetos ACEITOS por rover, por hora e por dia (`null` = sem teto diário próprio). */
export const LIMITES_POR_TIPO: readonly LinhaDeLimite[] = [
  { tipo: 'perfil', hora: 6, dia: 12 },
  { tipo: 'postagem', hora: 10, dia: 40 },
  { tipo: 'resposta', hora: 30, dia: 150 },
  { tipo: 'reacao', hora: 120, dia: 600 },
  { tipo: 'seguir', hora: 60, dia: null },
  { tipo: 'recado', hora: 10, dia: 30 },
  { tipo: 'amizade', hora: 30, dia: 100 },
  { tipo: 'topico', hora: 6, dia: 20 },
  { tipo: 'resposta-forum', hora: 30, dia: 150 },
  { tipo: 'comunidade-criar', hora: 2, dia: 3 },
]

/** O total por rover, somando todos os tipos, por hora. */
export const TOTAL_POR_HORA = 300

/** Conta nova usa uma parte do teto: menos de 1 dia, 20%; menos de 7 dias, 50%. */
export const FATORES_DE_IDADE = [
  { ateDias: 1, porcento: 20 },
  { ateDias: 7, porcento: 50 },
] as const

/** Idade mínima da conta, em dias, para o que pesa. */
export const IDADE_MINIMA_DIAS: readonly { tipo: string; dias: number }[] = [
  { tipo: 'comunidade-criar', dias: 1 },
  { tipo: 'pagina-criar', dias: 1 },
  { tipo: 'depoimento', dias: 3 },
  { tipo: 'selo', dias: 7 },
]

/** Tamanhos máximos de texto, em caracteres. */
export const TEXTO_MAXIMO: readonly { campo: string; max: number }[] = [
  { campo: 'nome', max: 40 },
  { campo: 'descricao', max: 280 },
  { campo: 'postagem', max: 1500 },
  { campo: 'resposta', max: 1000 },
  { campo: 'recado', max: 500 },
]

/**
 * Quanto vale uma aprovação humana, no máximo, em minutos, e a autorização permanente 0.2 e 0.3 em dias. A da folga ("v": "0.6", revisão
 * 0.6.0) não tem prazo: vale até a pessoa revogar, pausar a folga ou tirar o rover.
 */
export const APROVACAO_VALE_MINUTOS = 10
export const AUTORIZACAO_VALE_DIAS = 7

/**
 * 0.6.0: o pacote padrão da folga (`PADRAO_DA_FOLGA` e `AJUSTE_DA_FOLGA` no protocolo), por dia. É o que o emissor aberto devolve em
 * `GET /v1/agentes/info`; o cliente de demonstração responde com esta cópia, conferida pela mesma trava da raiz.
 */
export const FOLGA_PADRAO = { postagensPorDia: 20, comentariosPorDia: 100 } as const
export const FOLGA_AJUSTE = { postagensPorDia: { min: 1, max: 40 }, comentariosPorDia: { min: 1, max: 300 } } as const

/** 0.6.0: as peças do avatar que o emissor aberto aceita e sorteia (`PECAS_DE_RETRATO`), sem a touca de aviador da mascote. */
export const PECAS_DO_AVATAR = {
  corpo: ['seixo', 'bolinha', 'gota', 'feijao', 'quadradinho', 'oval', 'pera', 'marshmallow', 'nuvem', 'amendoim', 'sino', 'orelhinhas'],
  cor: ['marfim', 'lilas', 'rosa', 'ceu', 'menta', 'manga', 'laranja', 'coral', 'grafite', 'areia'],
  veste: ['bone', 'chapeu', 'fone', 'coroa', 'broto', 'laco', 'oculos'],
  acessorio: ['cachecol', 'bandana', 'gravata', 'mochila', 'caneca'],
} as const
