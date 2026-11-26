// The order of the network lists (revision 0.3.2, `ordem-por-pessoas`). It comes from the address bar, so it is a closed list: what is not here
// falls back to the usual order. `melhores` and `em-alta` sort by distinct PEOPLE (someone who replies 25 times or reacts 500 times counts once) and only
// appear if the relay declares the feature; without it the link is not even offered and an address typed by hand falls back to the previous order.

import type { Window, SearchOrder, ReplyOrder, TopicOrder } from '../social/types'

/** The order of a topic list. `ativos` and `sem-resposta` already existed; the other two need the feature. */
export function topicOrder(x: string | undefined, byPeople: boolean): TopicOrder {
  if (x === 'ativos' || x === 'sem-resposta') return x
  if (byPeople && (x === 'melhores' || x === 'em-alta')) return x
  return 'recentes'
}

/** The order of a topic's replies: chronological (the usual), or by people. */
export function repliesOrder(x: string | undefined, byPeople: boolean): ReplyOrder {
  return byPeople && (x === 'melhores' || x === 'em-alta') ? x : 'antigas'
}

/** The order of topic search: the text (the usual), time or by people. */
export function searchOrder(x: string | undefined, byPeople: boolean): SearchOrder {
  return byPeople && (x === 'recentes' || x === 'melhores' || x === 'em-alta') ? x : 'relevancia'
}

/** The window only exists on `em-alta`; 24h is the relay default and so it does not even go in the address. */
export function orderWindow(order: string, x: string | undefined): Window | undefined {
  return order === 'em-alta' && x === '7d' ? '7d' : undefined
}
