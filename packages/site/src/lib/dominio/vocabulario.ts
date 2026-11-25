// O vocabulário fechado de uma comunidade (revisão 0.3.2, proposta 0007): etiquetas e status com chave ASCII, rótulo de lista fechada de
// caracteres e uma de oito cores. O tópico carrega só as chaves; o rótulo e a cor saem do vocabulário da comunidade. Estas funções
// são puras: resolvem chaves em rótulos, conferem se um status vale na categoria e dizem qual classe de cor a tela usa.

import { CORES_DE_VOCABULARIO, type CorDeVocabulario, type EtiquetaDef, type MarcasDoTopico, type StatusDef, type Vocabulario } from '../social/tipos'

/** O que o relé usa quando a comunidade não definiu nenhum status. Igual a `STATUS_PADRAO` do protocolo (há um teste de paridade). */
export const STATUS_PADRAO: readonly StatusDef[] = [
  { chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null },
  { chave: 'em-andamento', rotulo: 'Em andamento', cor: 'ambar', categorias: null },
  { chave: 'fechado', rotulo: 'Fechado', cor: 'cinza', categorias: null },
]

/** Um status vale num tópico de `categoria` quando é de todas as categorias ou a categoria está na lista dele. */
export function statusValeNaCategoria(s: Pick<StatusDef, 'categorias'>, categoria: string | null): boolean {
  return s.categorias === null || (categoria !== null && s.categorias.includes(categoria))
}

/** Os status que a tela oferece como filtro: só os que valem na categoria escolhida (sem categoria escolhida, todos). */
export function statusParaFiltro(v: Vocabulario, categoria: string | undefined): StatusDef[] {
  return categoria === undefined ? v.status : v.status.filter((s) => statusValeNaCategoria(s, categoria))
}

export interface MarcasResolvidas {
  etiquetas: EtiquetaDef[]
  status: StatusDef | null
}

/**
 * Troca as chaves do tópico pelo rótulo e pela cor do vocabulário. Chave que o vocabulário não conhece (o relé limpa, mas uma leitura pode
 * chegar no meio de uma troca) some, em vez de aparecer como código. Sem vocabulário, não há o que mostrar.
 */
export function resolverMarcas(marcas: MarcasDoTopico | undefined, vocabulario: Vocabulario | undefined): MarcasResolvidas | null {
  if (!marcas || !vocabulario) return null
  const etiquetas = marcas.etiquetas.flatMap((k) => vocabulario.etiquetas.filter((e) => e.chave === k))
  const status = vocabulario.status.find((s) => s.chave === marcas.status) ?? null
  return etiquetas.length > 0 || status !== null ? { etiquetas, status } : null
}

/** O valor de `data-cor` do chip. Cor fora da lista fechada cai em `cinza`: nunca vira estilo escrito por estranho. */
export function corDoChip(cor: string): CorDeVocabulario {
  return CORES_DE_VOCABULARIO.find((c) => c === cor) ?? 'cinza'
}
