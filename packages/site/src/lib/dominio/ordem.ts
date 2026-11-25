// A ordem das listas da rede (revisão 0.3.2, `ordem-por-pessoas`). Vem da barra de endereço, então é lista fechada: o que não está aqui
// cai na ordem de sempre. `melhores` e `em-alta` ordenam por PESSOAS distintas (quem responde 25 vezes ou reage 500 vezes vale uma só) e só
// aparecem se o relé declara o recurso; sem ele o link nem é oferecido e um endereço escrito à mão cai na ordem de antes.

import type { Janela, OrdemBusca, OrdemRespostas, OrdemTopicos } from '../social/tipos'

/** A ordem de uma lista de tópicos. `ativos` e `sem-resposta` já existiam; as outras duas pedem o recurso. */
export function ordemDosTopicos(x: string | undefined, porPessoas: boolean): OrdemTopicos {
  if (x === 'ativos' || x === 'sem-resposta') return x
  if (porPessoas && (x === 'melhores' || x === 'em-alta')) return x
  return 'recentes'
}

/** A ordem das respostas de um tópico: cronológica (a de sempre), ou por pessoas. */
export function ordemDasRespostas(x: string | undefined, porPessoas: boolean): OrdemRespostas {
  return porPessoas && (x === 'melhores' || x === 'em-alta') ? x : 'antigas'
}

/** A ordem da busca de tópicos: o texto (a de sempre), o tempo ou por pessoas. */
export function ordemDaBusca(x: string | undefined, porPessoas: boolean): OrdemBusca {
  return porPessoas && (x === 'recentes' || x === 'melhores' || x === 'em-alta') ? x : 'relevancia'
}

/** A janela só existe no `em-alta`; 24h é o padrão do relé e por isso nem vai para o endereço. */
export function janelaDaOrdem(ordem: string, x: string | undefined): Janela | undefined {
  return ordem === 'em-alta' && x === '7d' ? '7d' : undefined
}
