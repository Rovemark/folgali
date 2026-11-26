// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.10.0 (proposal 0012): the order and window helpers shared by the ordered post list (social-karma.js) and the scored topic orders
// of a community (social-read.js). A module of its own so neither class file imports the other.
import { ProtocolError, TOP_WINDOWS } from '../../protocol/src/index.js'

/** The new topic orders of a community (wire values). */
export const TOPIC_SCORE_ORDERS = Object.freeze(['quentes', 'top', 'comentados'])

/** The days of a Top or Most commented window (`semana` by default; `sempre` is null, no cut). */
export function topWindowDays(window) {
  const j = window ?? 'semana'
  if (!Object.hasOwn(TOP_WINDOWS, j)) throw new ProtocolError('esquema', { campo: 'janela', detalhe: `Parâmetro janela: ${Object.keys(TOP_WINDOWS).join(', ')}.` })
  return TOP_WINDOWS[j]
}

/** The ORDER BY of a scored topic order (`pl` is the LEFT JOINed score row, `t` the topic). */
export function topicScoreOrder(order) {
  if (order === 'quentes') return 'COALESCE(pl.quente, 0) DESC, t.atividade_seq DESC'
  if (order === 'top') return 'COALESCE(pl.pontos, 0) DESC, COALESCE(pl.quente, 0) DESC'
  return 'COALESCE(pl.respostas, 0) DESC, COALESCE(pl.quente, 0) DESC'
}
