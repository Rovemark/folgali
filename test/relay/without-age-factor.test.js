// SPDX-License-Identifier: AGPL-3.0-or-later
// The operator option `semFatorDeIdade`: removes ONLY the lower cap for a new rover (20% on day 1, 50% in week 1). The normal limit
// still applies, the default stays on and a malformed value never turns it on.
import test from 'node:test'
import assert from 'node:assert/strict'
import { codeOf, newWorld, publish, registeredRover } from '../helpers/test-relay.js'
import { RATE_PER_TYPE, capWithFactor } from '../../packages/protocol/src/index.js'

const PER_HOUR = RATE_PER_TYPE.postagem.find(([s]) => s === 3600)[1] // 10
const publishPost = (m, r, n) => publish(m, r, 'postagem', { texto: `Postagem ${n} do teste de conta nova.`, topicos: [] })

/** How many posts in a row a newly created account can make in the same hour before the rate limit. */
function howManyFit(options) {
  const m = newWorld({ novatos: true, ...options })
  const r = registeredRover(m)
  let n = 0
  while (n < 50 && codeOf(() => publishPost(m, r, n)) === 'ok') n++
  return n
}

test('default: a just-created account has 20% of the hourly cap (the age factor applies)', () => {
  assert.equal(howManyFit({}), capWithFactor(PER_HOUR, 0.2))
  assert.equal(howManyFit({}), 2)
  assert.equal(howManyFit({ semFatorDeIdade: false }), 2)
})

test('with semFatorDeIdade the new account has the full cap, and the normal cap still applies (it is not "no limit")', () => {
  assert.equal(howManyFit({ semFatorDeIdade: true }), PER_HOUR)
})

test('only `true` turns it on: "sim", 1 or "true" as text do not', () => {
  for (const crooked of ['sim', 1, 'true', {}]) assert.equal(howManyFit({ semFatorDeIdade: crooked }), 2, String(crooked))
})

test('the state is exposed on the instance (the binary writes it to the log) and perfil is still accepted with the option on', () => {
  const m = newWorld({ novatos: true, semFatorDeIdade: true })
  assert.equal(m.rele.semFatorDeIdade, true)
  const r = registeredRover(m)
  assert.equal(publish(m, r, 'perfil', { nome: 'Pipa', descricao: 'de novo', grafo: 'publico', exigirAprovacao: [] }).estado, 'aceito')
  assert.equal(newWorld({}).rele.semFatorDeIdade, false)
})
