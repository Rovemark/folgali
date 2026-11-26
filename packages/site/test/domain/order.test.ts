import { describe, expect, it } from 'vitest'
import { orderWindow, searchOrder, repliesOrder, topicOrder } from '@/lib/domain/order'

// The order comes from the address bar: a closed list. What is not in the list falls to the usual order, and the orders by people only count if the relay declares them.

describe('topic order', () => {
  it('the three from before work with or without the resource', () => {
    for (const by of [true, false]) {
      expect(topicOrder('ativos', by)).toBe('ativos')
      expect(topicOrder('sem-resposta', by)).toBe('sem-resposta')
      expect(topicOrder('recentes', by)).toBe('recentes')
    }
  })
  it('best and trending only work with the resource; without it they fall to recent', () => {
    expect(topicOrder('melhores', true)).toBe('melhores')
    expect(topicOrder('em-alta', true)).toBe('em-alta')
    expect(topicOrder('melhores', false)).toBe('recentes')
    expect(topicOrder('em-alta', false)).toBe('recentes')
  })
  it('junk, empty and absent fall to recent', () => {
    for (const x of [undefined, '', 'MELHORES', 'melhores ', "'; drop", '__proto__', 'constructor', 'antigas', 'relevancia']) {
      expect(topicOrder(x, true)).toBe('recentes')
    }
  })
})

describe('reply order', () => {
  it('chronological is the default; the ones by people ask for the resource', () => {
    expect(repliesOrder(undefined, true)).toBe('antigas')
    expect(repliesOrder('melhores', true)).toBe('melhores')
    expect(repliesOrder('em-alta', true)).toBe('em-alta')
    expect(repliesOrder('melhores', false)).toBe('antigas')
    expect(repliesOrder('em-alta', false)).toBe('antigas')
  })
  it('only the two by people: recent and active are not offered on the replies screen', () => {
    for (const x of ['recentes', 'ativos', 'antigas', 'x', '']) expect(repliesOrder(x, true)).toBe('antigas')
  })
})

describe('topic search order', () => {
  it('relevance is the default; recent, best and trending ask for the resource', () => {
    expect(searchOrder(undefined, true)).toBe('relevancia')
    expect(searchOrder('relevancia', true)).toBe('relevancia')
    for (const o of ['recentes', 'melhores', 'em-alta'] as const) {
      expect(searchOrder(o, true)).toBe(o)
      expect(searchOrder(o, false)).toBe('relevancia')
    }
  })
  it('junk falls to relevance', () => {
    for (const x of ['', 'ativos', 'sem-resposta', 'antigas', 'RECENTES']) expect(searchOrder(x, true)).toBe('relevancia')
  })
})

describe('trending window', () => {
  it('only exists on trending, and only 7d goes into the address (24h is the relay\'s default)', () => {
    expect(orderWindow('em-alta', '7d')).toBe('7d')
    expect(orderWindow('em-alta', '24h')).toBeUndefined()
    expect(orderWindow('em-alta', undefined)).toBeUndefined()
    expect(orderWindow('em-alta', '30d')).toBeUndefined()
    for (const o of ['melhores', 'recentes', 'ativos', 'antigas', 'relevancia', 'sem-resposta']) expect(orderWindow(o, '7d')).toBeUndefined()
  })
})
