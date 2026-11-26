// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { TokenBucket } from '../../packages/relay/src/rate-limit.js'
import { objectOf } from '../helpers/world.js'
import { codeOf, errorOf, newWorld, publish, registeredRover } from '../helpers/test-relay.js'

const post = (text) => ({ texto: text, topicos: [] })

test('post: ten per hour per rover, the eleventh comes back with a wait time, and the window releases', () => {
  const m = newWorld()
  const r = registeredRover(m)
  for (let i = 0; i < 10; i++) assert.equal(publish(m, r, 'postagem', post(`p${i}`)).estado, 'aceito')
  const e = errorOf(() => publish(m, r, 'postagem', post('p10')))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.status, 429)
  assert.equal(e.retryAfterS, 3600)
  m.advance(1000)
  assert.equal(errorOf(() => publish(m, r, 'postagem', post('ainda não'))).retryAfterS, 2600)
  m.advance(2601)
  assert.equal(publish(m, r, 'postagem', post('agora sim')).estado, 'aceito')
})

test('post: the daily cap applies even when the hourly limit is free', () => {
  const m = newWorld()
  const r = registeredRover(m)
  for (let hour = 0; hour < 4; hour++) {
    for (let i = 0; i < 10; i++) publish(m, r, 'postagem', post(`h${hour} p${i}`))
    m.advance(3601)
  }
  assert.equal(codeOf(() => publish(m, r, 'postagem', post('quadragésima primeira'))), 'limite_de_taxa')
})

test('each type has its own quota: exceeding posts does not block reactions or follows', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const other = registeredRover(m)
  const target = publish(m, other, 'postagem', post('alvo'))
  for (let i = 0; i < 10; i++) publish(m, r, 'postagem', post(`p${i}`))
  assert.equal(codeOf(() => publish(m, r, 'postagem', post('estourou'))), 'limite_de_taxa')
  assert.equal(publish(m, r, 'reacao', { alvo: target.id, reacao: 'curtir' }).estado, 'aceito')
  assert.equal(publish(m, r, 'seguir', { alvo: other.uid }).estado, 'aceito')
})

test('the total cap per rover adds up all types', () => {
  const m = newWorld({ rates: { total: [[3600, 5]] } })
  const r = registeredRover(m) // the profile counts 1
  const other = registeredRover(m)
  publish(m, r, 'seguir', { alvo: other.uid })
  publish(m, r, 'postagem', post('a'))
  publish(m, r, 'postagem', post('b'))
  publish(m, r, 'deixar-de-seguir', { alvo: other.uid })
  assert.equal(codeOf(() => publish(m, r, 'postagem', post('sexta'))), 'limite_de_taxa')
})

test('the cap per issuer adds up all of its rovers', () => {
  const m = newWorld({ rates: { emissor: [[3600, 6]] } })
  const a = registeredRover(m) // 1
  const b = registeredRover(m) // 2
  publish(m, a, 'postagem', post('a1')) // 3
  publish(m, b, 'postagem', post('b1')) // 4
  publish(m, a, 'postagem', post('a2')) // 5
  publish(m, b, 'postagem', post('b2')) // 6
  assert.equal(codeOf(() => publish(m, a, 'postagem', post('a3'))), 'limite_de_taxa')
  assert.equal(codeOf(() => publish(m, b, 'postagem', post('b3'))), 'limite_de_taxa')
})

test('the quota belongs to whoever was ACCEPTED: garbage carrying someone else uid does not spend their quota', () => {
  const m = newWorld()
  const victim = registeredRover(m)
  const attacker = registeredRover(m)
  for (let i = 0; i < 30; i++) {
    const fake = objectOf({ ...attacker, uid: victim.uid }, 'postagem', post(`lixo ${i}`), { criadoEm: m.relogio.agora, previo: victim.cabeca })
    assert.equal(codeOf(() => m.rele.aceitar({ objeto: fake })), 'assinatura_invalida')
  }
  for (let i = 0; i < 10; i++) assert.equal(publish(m, victim, 'postagem', post(`legítima ${i}`)).estado, 'aceito')
})

test('an object refused by another rule does not count toward the quota either', () => {
  const m = newWorld()
  const r = registeredRover(m)
  for (let i = 0; i < 12; i++) assert.equal(codeOf(() => publish(m, r, 'postagem', post(`sem aprovação ${i}`), { aprovada: false })), 'sem_aprovacao')
  for (let i = 0; i < 10; i++) assert.equal(publish(m, r, 'postagem', post(`ok ${i}`)).estado, 'aceito')
})

test('a duplicate does not spend quota', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const p = publish(m, r, 'postagem', post('uma só'))
  const env = { objeto: m.rele.objeto(p.id).objeto, aprovacao: m.rele.objeto(p.id).aprovacao }
  for (let i = 0; i < 30; i++) assert.equal(m.rele.aceitar(env).estado, 'duplicado')
  for (let i = 0; i < 9; i++) assert.equal(publish(m, r, 'postagem', post(`outra ${i}`)).estado, 'aceito')
})

test('token bucket: burst, refill and memory cap', () => {
  let now = 0
  const b = new TokenBucket({ capacity: 3, perSecond: 1, relogio: () => now, teto: 2 })
  assert.deepEqual([b.attempt('a').ok, b.attempt('a').ok, b.attempt('a').ok], [true, true, true])
  const denied = b.attempt('a')
  assert.equal(denied.ok, false)
  assert.equal(denied.waitS, 1)
  assert.equal(b.attempt('b').ok, true) // another origin is not affected
  now = 1
  assert.equal(b.attempt('a').ok, true) // one token came back
  assert.equal(b.attempt('a').ok, false)
  now = 100
  assert.deepEqual([b.attempt('a').ok, b.attempt('a').ok, b.attempt('a').ok, b.attempt('a').ok], [true, true, true, false]) // never goes past the capacity
  b.attempt('c')
  b.attempt('d')
  assert.ok(b.tamanho <= 2)
})

test('bucket: the wait grows with what is missing', () => {
  let now = 0
  const b = new TokenBucket({ capacity: 1, perSecond: 0.5, relogio: () => now })
  assert.equal(b.attempt('x').ok, true)
  assert.equal(b.attempt('x').waitS, 2)
  now = 1
  assert.equal(b.attempt('x').waitS, 1)
})
