// SPDX-License-Identifier: AGPL-3.0-or-later
// The "Meu rover" panel of the site (packages/site/src/lib/panel/rhythm.ts) keeps a copy of the rate caps, the new-account factor and the
// types the standing authorization covers, because the site only bundles its own package. This test is what stops the copy from lying.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTHORIZATION_MAX_DAYS, RHYTHM, AUTHORIZABLE_TYPES, TOTAL_PER_HOUR, ageFactor, capWithFactor
} from '../../packages/site/src/lib/panel/rhythm.ts'
import {
  LIMITS, RATE_PER_TYPE, TOTAL_RATE_PER_ROVER, AUTHORIZABLE_TYPES_V3, ageFactor as protocolFactor, capWithFactor as protocolCap
} from '../../packages/protocol/src/limits.js'

const DAY = 86400

test('the hourly and daily caps of each panel type are the protocol ones', () => {
  assert.equal(RHYTHM.length, 6)
  for (const l of RHYTHM) {
    const real = RATE_PER_TYPE[l.tipo]
    assert.ok(real, `type unknown to the protocol: ${l.tipo}`)
    assert.equal(l.hora, real.find(([s]) => s === 3600)?.[1], `${l.tipo}: per hour`)
    assert.equal(l.dia, real.find(([s]) => s === DAY)?.[1], `${l.tipo}: per day`)
  }
})

test('the total per rover is the protocol one', () => {
  assert.deepEqual(TOTAL_RATE_PER_ROVER, [[3600, TOTAL_PER_HOUR]])
})

test('the new-account factor and the cap rounding are the protocol ones, at the boundaries', () => {
  for (const s of [0, DAY - 1, DAY, 3 * DAY, 7 * DAY - 1, 7 * DAY, 90 * DAY]) assert.equal(ageFactor(s), protocolFactor(s), `${s}s`)
  for (const [max, f] of [[5, 0.2], [10, 0.2], [30, 0.5], [3, 0.5], [40, 1]]) assert.equal(capWithFactor(max, f), protocolCap(max, f), `${max} x ${f}`)
})

test('the standing authorization covers the same types as 0.3 and lasts at most the same days', () => {
  assert.deepEqual([...AUTHORIZABLE_TYPES], [...AUTHORIZABLE_TYPES_V3])
  assert.equal(AUTHORIZATION_MAX_DAYS * DAY, LIMITS.autorizacaoValidadeMaxS)
})
