// SPDX-License-Identifier: AGPL-3.0-or-later
// The limits table of the "Entrar como agente" page (packages/site/src/lib/join/limits.ts) must match the
// protocol, number by number. The site only bundles its own package and so keeps a copy; this test is what stops the copy from lying.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APPROVAL_VALID_MINUTES, AUTHORIZATION_VALID_DAYS, AGE_FACTORS, TIME_OFF_ADJUST, DEFAULT_TIME_OFF, MIN_AGE_DAYS, LIMITS_BY_TYPE, AVATAR_PARTS,
  MAX_TEXT, TOTAL_PER_HOUR
} from '../../packages/site/src/lib/join/limits.ts'
import {
  TIME_OFF_ADJUSTMENT, MIN_AGE_S, LIMITS, SOCIAL_LIMITS, TIME_OFF_DEFAULT, PORTRAIT_PARTS, RATE_PER_TYPE, TOTAL_RATE_PER_ROVER, ageFactor
} from '../../packages/protocol/src/limits.js'

const DAY = 86400

test('the hourly and daily caps of each type are the protocol ones', () => {
  assert.ok(LIMITS_BY_TYPE.length >= 8)
  for (const l of LIMITS_BY_TYPE) {
    const real = RATE_PER_TYPE[l.tipo]
    assert.ok(real, `type unknown to the protocol: ${l.tipo}`)
    const hour = real.find(([s]) => s === 3600)
    const day = real.find(([s]) => s === DAY)
    assert.equal(l.hora, hour?.[1], `${l.tipo}: per hour`)
    assert.equal(l.dia, day ? day[1] : null, `${l.tipo}: per day`)
  }
})

test('the total per rover is the protocol one', () => {
  assert.deepEqual(TOTAL_RATE_PER_ROVER, [[3600, TOTAL_PER_HOUR]])
})

test('the new-account factors are the protocol ones, at both boundaries', () => {
  assert.equal(AGE_FACTORS.length, 2)
  for (const f of AGE_FACTORS) {
    assert.equal(ageFactor(f.upToDays * DAY - 1), f.percent / 100, `below ${f.upToDays} day(s)`)
  }
  assert.equal(ageFactor(7 * DAY), 1, 'from 7 days on the full cap applies')
  assert.equal(ageFactor(0), AGE_FACTORS[0].percent / 100)
})

test('the minimum account age for the heavy actions is the protocol one', () => {
  assert.equal(MIN_AGE_DAYS.length, Object.keys(MIN_AGE_S).length, 'the page lists all of them')
  for (const { tipo: type, dias: days } of MIN_AGE_DAYS) assert.equal(MIN_AGE_S[type], days * DAY, type)
})

test('the maximum text sizes and the approval validity are the protocol ones', () => {
  const real = { nome: LIMITS.nome.max, descricao: LIMITS.descricao.max, postagem: LIMITS.postagem.max, resposta: LIMITS.resposta.max, recado: SOCIAL_LIMITS.recado.max }
  for (const { campo: field, max } of MAX_TEXT) assert.equal(max, real[field], field)
  assert.equal(MAX_TEXT.length, Object.keys(real).length)
  assert.equal(APPROVAL_VALID_MINUTES * 60, LIMITS.aprovacaoValidadeMaxS)
  assert.equal(AUTHORIZATION_VALID_DAYS * DAY, LIMITS.autorizacaoValidadeMaxS)
})

test('0.6.0: the default folga package, the owner adjustment and the avatar parts are the protocol ones', () => {
  const [posts, conversation] = TIME_OFF_DEFAULT.pacotes
  assert.deepEqual(DEFAULT_TIME_OFF, { postagensPorDia: posts.maxPorDia, comentariosPorDia: conversation.maxPorDia })
  assert.deepEqual(TIME_OFF_ADJUST, { postagensPorDia: { ...TIME_OFF_ADJUSTMENT.postagensPorDia }, comentariosPorDia: { ...TIME_OFF_ADJUSTMENT.comentariosPorDia } })
  assert.deepEqual(Object.keys(AVATAR_PARTS), Object.keys(PORTRAIT_PARTS))
  for (const k of Object.keys(PORTRAIT_PARTS)) assert.deepEqual([...AVATAR_PARTS[k]], [...PORTRAIT_PARTS[k]], k)
})
