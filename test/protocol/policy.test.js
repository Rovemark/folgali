// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GRAPHS, AUTHORIZABLE_TYPES, REQUIRABLE_TYPES, OBJECT_TYPES, requiresApproval, graphShowsCounts, graphShowsLists, mostRestrictive, effectivePolicy
} from '../../packages/protocol/src/index.js'

test('the three graph levels, from the most open to the most closed', () => {
  assert.deepEqual([...GRAPHS], ['publico', 'contagens', 'privado'])
  assert.deepEqual([...REQUIRABLE_TYPES], ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia'])
  assert.deepEqual([...AUTHORIZABLE_TYPES], ['postagem', 'resposta'])
})

test('mostRestrictive: the most closed one applies, in any order of the two', () => {
  const expected = {
    'publico publico': 'publico', 'publico contagens': 'contagens', 'publico privado': 'privado',
    'contagens publico': 'contagens', 'contagens contagens': 'contagens', 'contagens privado': 'privado',
    'privado publico': 'privado', 'privado contagens': 'privado', 'privado privado': 'privado'
  }
  for (const [pair, result] of Object.entries(expected)) {
    const [a, b] = pair.split(' ')
    assert.equal(mostRestrictive(a, b), result, pair)
  }
})

test('requiresApproval: profile, post and reply always; free actions only when the policy says so', () => {
  for (const t of ['perfil', 'postagem', 'resposta']) {
    assert.equal(requiresApproval(t), true, t)
    assert.equal(requiresApproval(t, []), true, t)
    assert.equal(requiresApproval(t, ['seguir']), true, t)
  }
  for (const t of ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia', 'remocao-pelo-autor']) {
    assert.equal(requiresApproval(t), false, t)
    assert.equal(requiresApproval(t, []), false, t)
  }
  for (const t of REQUIRABLE_TYPES) {
    assert.equal(requiresApproval(t, [t]), true, t)
    assert.equal(requiresApproval(t, REQUIRABLE_TYPES.filter((x) => x !== t)), false, t)
  }
  // removal by the author is never requirable: the person and the rover can always delete what they published
  assert.equal(requiresApproval('remocao-pelo-autor', ['seguir']), false)
  assert.equal(REQUIRABLE_TYPES.includes('remocao-pelo-autor'), false)
  // every protocol type has an answer (none falls into "undefined")
  for (const t of OBJECT_TYPES) assert.equal(typeof requiresApproval(t, []), 'boolean', t)
})

test('effectivePolicy: without a person declaration the rover one applies; with it, the most restrictive one and the union of the requirements', () => {
  const rover = { grafo: 'publico', exigirAprovacao: ['reacao'] }
  assert.deepEqual(effectivePolicy(rover, null), { grafo: 'publico', exigirAprovacao: ['reacao'] })
  assert.deepEqual(effectivePolicy(rover, undefined), { grafo: 'publico', exigirAprovacao: ['reacao'] })
  assert.deepEqual(effectivePolicy(rover, { grafo: 'privado', exigirAprovacao: ['seguir', 'reacao'] }), { grafo: 'privado', exigirAprovacao: ['reacao', 'seguir'] })
  // the rover does not undo what the person closed, and the person does not undo what the rover closed
  assert.equal(effectivePolicy({ grafo: 'publico', exigirAprovacao: [] }, { grafo: 'privado', exigirAprovacao: [] }).grafo, 'privado')
  assert.equal(effectivePolicy({ grafo: 'privado', exigirAprovacao: [] }, { grafo: 'publico', exigirAprovacao: [] }).grafo, 'privado')
  assert.equal(effectivePolicy({ grafo: 'contagens', exigirAprovacao: [] }, { grafo: 'publico', exigirAprovacao: [] }).grafo, 'contagens')
  assert.equal(effectivePolicy({ grafo: 'publico', exigirAprovacao: [] }, { grafo: 'contagens', exigirAprovacao: [] }).grafo, 'contagens')
  // a requirement from whoever it is applies; without repeats, in a stable order
  assert.deepEqual(effectivePolicy({ grafo: 'publico', exigirAprovacao: ['denuncia', 'seguir'] }, { grafo: 'publico', exigirAprovacao: ['seguir', 'deixar-de-seguir'] }).exigirAprovacao, ['deixar-de-seguir', 'denuncia', 'seguir'])
  assert.deepEqual(effectivePolicy({ grafo: 'publico', exigirAprovacao: [] }, { grafo: 'publico', exigirAprovacao: ['seguir'] }).exigirAprovacao, ['seguir'])
  assert.deepEqual(effectivePolicy({ grafo: 'publico', exigirAprovacao: [] }, { grafo: 'publico', exigirAprovacao: [] }).exigirAprovacao, [])
})

test('effectivePolicy returns copies: changing the result does not change the caller data', () => {
  const rover = { grafo: 'publico', exigirAprovacao: ['seguir'] }
  const r = effectivePolicy(rover, null)
  r.exigirAprovacao.push('reacao')
  assert.deepEqual(rover.exigirAprovacao, ['seguir'])
  assert.deepEqual(effectivePolicy(rover, null).exigirAprovacao, ['seguir'])
  assert.deepEqual(effectivePolicy({ grafo: 'publico', exigirAprovacao: [] }, null).exigirAprovacao, [])
})

test('what each level shows to anyone who is not the rover itself', () => {
  assert.deepEqual(['publico', 'contagens', 'privado'].map(graphShowsLists), [true, false, false])
  assert.deepEqual(['publico', 'contagens', 'privado'].map(graphShowsCounts), [true, true, false])
})
