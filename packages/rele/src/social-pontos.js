// SPDX-License-Identifier: AGPL-3.0-or-later
// Ordem por PESSOAS DISTINTAS (0.3.2, proposta 0007): `melhores` e `em-alta`.
//
//   pontos = 3 x (pessoas distintas que responderam) + 1 x (pessoas distintas que reagiram)
//
// Conta pessoas, nunca quantas vezes: quem responde 25 vezes ou reage 500 vezes vale 1. O autor não pontua no que escreveu. Só conta rover
// visível (ROVER_VISIVEL), que não saiu e tem conta com pelo menos `contaConsideradaNaDescobertaS` de idade (a mesma regra do "em alta"
// de descoberta, para não premiar uma rajada de contas novas). `em-alta` conta só o que chegou na janela. O relé nunca expõe `pontos` nem a
// lista de quem: o cliente recebe a lista já ordenada. Os pontos são da lista inteira, não de quem lê (nada aqui personaliza).
//
// Um fragmento SQL só, usado pelas quatro listas (tópicos de uma comunidade, respostas de tópico, respostas de postagem e busca de
// tópicos), para a fórmula não divergir entre elas.
import { ErroDoProtocolo, ORDENS_POR_PESSOAS, TEMPOS } from '../../protocolo/src/index.js'
import { ROVER_VISIVEL } from './armazem.js'

/** `true` quando a ordem pedida é uma das duas ordens por pessoas. */
export const ehPorPessoas = (ordem) => ORDENS_POR_PESSOAS.includes(ordem)

/** Erro padrão de `ordem` fora da lista, com a lista que aquela rota aceita. */
export function ordemInvalida(aceitas) {
  return new ErroDoProtocolo('esquema', { campo: 'ordem', detalhe: `Parâmetro ordem: ${aceitas.join(', ')}.` })
}

/**
 * O fragmento SQL dos pontos de um conteúdo.
 * @param {object} o
 * @param {string} o.alias        o alias do conteúdo na consulta que chama (`t` para tópico, `o` para resposta)
 * @param {'resposta-forum'|'resposta'} o.tipoResposta  o tipo das respostas que contam
 * @param {'ctx'|'alvo'} o.colunaResposta  como a resposta aponta para o conteúdo: tópico por `ctx` (qualquer profundidade), resposta por `alvo`
 * @param {boolean} o.janela      só o que chegou depois de `:corte` (em-alta); sem isso, todo o tempo (melhores)
 */
export function pontosSql({ alias, tipoResposta, colunaResposta, janela }) {
  if (!['resposta-forum', 'resposta'].includes(tipoResposta) || !['ctx', 'alvo'].includes(colunaResposta) || !/^[a-z]{1,3}$/.test(alias)) {
    throw new Error('pontosSql: argumento inválido')
  }
  const corte = (a) => (janela ? ` AND ${a}.recebido_em > :corte` : '')
  // O `r` de dentro das subconsultas esconde o `r` de fora: cada uma julga a visibilidade de QUEM respondeu ou reagiu.
  return `(
    3 * (SELECT COUNT(DISTINCT x.autor) FROM objetos x JOIN rovers r ON r.uid = x.autor
         WHERE x.tipo = '${tipoResposta}' AND x.${colunaResposta} = ${alias}.id AND x.autor <> ${alias}.autor
           AND x.removido_em IS NULL AND x.oculto_em IS NULL AND x.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
           AND ${ROVER_VISIVEL} AND :agora - r.criado_em >= :idade${corte('x')})
    + (SELECT COUNT(DISTINCT y.autor) FROM objetos y JOIN rovers r ON r.uid = y.autor
       WHERE y.tipo = 'reacao' AND y.alvo = ${alias}.id AND y.autor <> ${alias}.autor AND y.removido_em IS NULL
         AND ${ROVER_VISIVEL} AND :agora - r.criado_em >= :idade${corte('y')})
  )`
}

/** Os parâmetros nomeados que o fragmento usa (só estes: o armazém não aceita parâmetro nomeado que a consulta não tem). */
export function paramsDePontos(paramsDeVisibilidade, agora, duracaoDaJanelaS) {
  return {
    ...paramsDeVisibilidade,
    idade: TEMPOS.contaConsideradaNaDescobertaS,
    ...(duracaoDaJanelaS === null ? {} : { corte: agora - duracaoDaJanelaS })
  }
}
