// SPDX-License-Identifier: AGPL-3.0-or-later
// Order by DISTINCT PEOPLE (0.3.2, proposal 0007): `melhores` and `em-alta`.
//
//   points = 3 x (distinct people who replied) + 1 x (distinct people who reacted)
//
// It counts people, never how many times: whoever replies 25 times or reacts 500 times counts as 1. The author does not score on what they wrote. Only a visible
// rover counts (ROVER_VISIBLE), one that did not leave and has an account at least `contaConsideradaNaDescobertaS` old (the same rule as the discovery
// "trending", so a burst of new accounts is not rewarded). `em-alta` counts only what arrived in the window. The relay never exposes `pontos` nor the
// list of who: the client receives the list already sorted. The points are for the whole list, not for whoever reads (nothing here personalizes).
//
// A single SQL fragment, used by the four lists (topics of a community, topic replies, post replies and topic
// search), so the formula does not diverge between them.
import { ProtocolError, ORDERS_PER_PEOPLE, TIMES } from '../../protocol/src/index.js'
import { ROVER_VISIBLE } from './store.js'

/** `true` when the requested order is one of the two by-people orders. */
export const isByPeople = (order) => ORDERS_PER_PEOPLE.includes(order)

/** Standard error for an `ordem` outside the list, with the list that route accepts. */
export function invalidOrder(accepted) {
  return new ProtocolError('esquema', { campo: 'ordem', detalhe: `Parâmetro ordem: ${accepted.join(', ')}.` })
}

/**
 * The SQL fragment of the points of a piece of content.
 * @param {object} o
 * @param {string} o.alias        the alias of the content in the calling query (`t` for topic, `o` for reply)
 * @param {'resposta-forum'|'resposta'} o.tipoResposta  the type of the replies that count
 * @param {'ctx'|'alvo'} o.colunaResposta  how the reply points to the content: topic by `ctx` (any depth), reply by `alvo`
 * @param {boolean} o.janela      only what arrived after `:corte` (em-alta); without it, all time (melhores)
 */
export function pointsSql({ alias, tipoResposta: replyType, colunaResposta: replyColumn, janela: window }) {
  if (!['resposta-forum', 'resposta'].includes(replyType) || !['ctx', 'alvo'].includes(replyColumn) || !/^[a-z]{1,3}$/.test(alias)) {
    throw new Error('pontosSql: argumento inválido')
  }
  const cutoff = (a) => (window ? ` AND ${a}.recebido_em > :corte` : '')
  // The inner `r` of the subqueries hides the outer `r`: each one judges the visibility of WHO replied or reacted.
  return `(
    3 * (SELECT COUNT(DISTINCT x.autor) FROM objetos x JOIN rovers r ON r.uid = x.autor
         WHERE x.tipo = '${replyType}' AND x.${replyColumn} = ${alias}.id AND x.autor <> ${alias}.autor
           AND x.removido_em IS NULL AND x.oculto_em IS NULL AND x.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
           AND ${ROVER_VISIBLE} AND :agora - r.criado_em >= :idade${cutoff('x')})
    + (SELECT COUNT(DISTINCT y.autor) FROM objetos y JOIN rovers r ON r.uid = y.autor
       WHERE y.tipo = 'reacao' AND y.alvo = ${alias}.id AND y.autor <> ${alias}.autor AND y.removido_em IS NULL
         AND ${ROVER_VISIBLE} AND :agora - r.criado_em >= :idade${cutoff('y')})
  )`
}

/** The named parameters the fragment uses (only these: the store does not accept a named parameter the query does not have). */
export function pointsParams(visibilityParams, now, windowDurationS) {
  return {
    ...visibilityParams,
    idade: TIMES.contaConsideradaNaDescobertaS,
    ...(windowDurationS === null ? {} : { corte: now - windowDurationS })
  }
}
