// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIMITS, createReadCredential, readCredentialMatches, generateKeyPair, readReadCredential
} from '../../packages/protocol/src/index.js'
import { NOW, newUid } from '../helpers/world.js'

const network = generateKeyPair()
const uid = newUid()
const target = `/v1/linha/inicio?rover=${uid}&limite=5`
const credential = (extra = {}) => createReadCredential({ chavePrivada: network.chavePrivada, uid, alvo: target, t: NOW, ...extra })
const matches = (header, extra = {}) =>
  readCredentialMatches(readReadCredential(header), { metodo: 'GET', alvo: target, chave: network.publicKey, agora: NOW, ...extra })

test('read credential: round trip, and it matches the rover NETWORK key', () => {
  const header = credential()
  assert.match(header, /^Rover-Assinatura uid=rvr_[A-Za-z0-9_-]{22}, t=\d{10}, a=[A-Za-z0-9_-]{86}$/)
  const c = readReadCredential(header)
  assert.equal(c.uid, uid)
  assert.equal(c.t, NOW)
  assert.equal(typeof c.t, 'number')
  assert.match(c.assinatura, /^[A-Za-z0-9_-]{86}$/)
  assert.equal(matches(header), true)
})

test('the credential is valid only for the exact request: another path, another query, another method, another rover, another key', () => {
  const header = credential()
  assert.equal(matches(header, { alvo: `/v1/linha/inicio?rover=${uid}&limite=6` }), false)
  assert.equal(matches(header, { alvo: `/v1/rovers/${uid}/seguindo` }), false)
  assert.equal(matches(header, { metodo: 'POST' }), false)
  assert.equal(matches(header, { chave: generateKeyPair().publicKey }), false)
  const other = newUid()
  assert.equal(matches(header.replace(uid, other)), false)
  assert.equal(matches(header.replace(`t=${NOW}`, `t=${NOW + 1}`)), false)
  assert.equal(matches(credential({ metodo: 'POST' })), false)
})

test('time window: 120 seconds on both sides, and not one more', () => {
  assert.equal(LIMITS.readToleranceS, 120)
  assert.equal(matches(credential({ t: NOW - 120 })), true)
  assert.equal(matches(credential({ t: NOW - 121 })), false)
  assert.equal(matches(credential({ t: NOW + 120 })), true)
  assert.equal(matches(credential({ t: NOW + 121 })), false)
})

test('a malformed header is read as nothing, never as an exception', () => {
  const good = credential()
  const bad = [
    undefined, null, 42, {}, [], '', 'Rover-Assinatura', good.toLowerCase(), `${good} `, ` ${good}`, `${good}x`, `${good}\n`,
    good.replace('Rover-Assinatura', 'Bearer'), good.replace('uid=rvr_', 'uid=xxx_'), good.replace(', t=', ',t='),
    good.replace(`t=${NOW}`, `t=${String(NOW).slice(1)}`), good.replace(`t=${NOW}`, `t=${NOW}0`), good.replace(`t=${NOW}`, 't=-190000000'),
    good.replace(`t=${NOW}`, 't=1900000.00'), good.slice(0, -1), `${good}A`, good.replace(/uid=rvr_[A-Za-z0-9_-]{22}/, `uid=${uid}A`)
  ]
  for (const r of bad) assert.equal(readReadCredential(r), null, String(r))
})
