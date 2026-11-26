// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3.2: the SQL fragment of the order by distinct people, directly. What it refuses (a bad argument never becomes SQL) and what it builds.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TIMES } from '../../packages/protocol/src/index.js'
import { isByPeople, invalidOrder, pointsParams, pointsSql } from '../../packages/relay/src/social-points.js'

const good = { alias: 't', tipoResposta: 'resposta-forum', colunaResposta: 'ctx', janela: false }

test('pontosSql: the four valid arguments and what changes with the window', () => {
  const all = pointsSql(good)
  assert.match(all, /x\.tipo = 'resposta-forum' AND x\.ctx = t\.id AND x\.autor <> t\.autor/)
  assert.match(all, /y\.tipo = 'reacao' AND y\.alvo = t\.id AND y\.autor <> t\.autor/)
  assert.match(all, /COUNT\(DISTINCT x\.autor\)/)
  assert.match(all, /COUNT\(DISTINCT y\.autor\)/)
  assert.equal(all.includes(':corte'), false, 'without a window, no cutoff')
  const window = pointsSql({ ...good, janela: true })
  assert.equal((window.match(/:corte/g) ?? []).length, 2, 'with a window, the cutoff applies to replies and to reactions')
  assert.match(window, /x\.recebido_em > :corte/)
  assert.match(window, /y\.recebido_em > :corte/)
  const reply = pointsSql({ alias: 'o', tipoResposta: 'resposta', colunaResposta: 'alvo', janela: false })
  assert.match(reply, /x\.tipo = 'resposta' AND x\.alvo = o\.id/)
  assert.match(all, /3 \*/, 'whoever replied weighs 3')
})

test('pontosSql: an argument outside the closed list never becomes SQL', () => {
  for (const bad of [
    { tipoResposta: 'postagem' }, { tipoResposta: "resposta'; DROP TABLE objetos; --" }, { tipoResposta: undefined },
    { colunaResposta: 'id' }, { colunaResposta: 'autor' }, { colunaResposta: 'ctx; --' },
    { alias: 'T' }, { alias: 'abcd' }, { alias: '' }, { alias: 't; --' }, { alias: 't.x' }, { alias: '1' }
  ]) {
    assert.throws(() => pointsSql({ ...good, ...bad }), /argumento inválido/, JSON.stringify(bad))
  }
  // the boundaries that pass: an alias of 1 to 3 lowercase letters
  for (const alias of ['a', 'ab', 'abc']) assert.ok(pointsSql({ ...good, alias }).includes(`${alias}.id`))
})

test('paramsDePontos: visibility, minimum account age and, only with a window, the cutoff', () => {
  const visibility = { agora: 1_800_000_000, confiaveis: '[]' }
  assert.deepEqual(pointsParams(visibility, 1_800_000_000, null), { ...visibility, idade: TIMES.contaConsideradaNaDescobertaS })
  assert.deepEqual(pointsParams(visibility, 1_800_000_000, 86400), { ...visibility, idade: TIMES.contaConsideradaNaDescobertaS, corte: 1_800_000_000 - 86400 })
  assert.equal('corte' in pointsParams(visibility, 1_800_000_000, 0), true, 'a zero window is still a window')
})

test('ehPorPessoas and ordemInvalida', () => {
  assert.equal(isByPeople('melhores'), true)
  assert.equal(isByPeople('em-alta'), true)
  for (const other of ['recentes', 'ativos', 'sem-resposta', 'antigas', 'relevancia', '', undefined, null]) assert.equal(isByPeople(other), false, String(other))
  const e = invalidOrder(['a', 'b'])
  assert.equal(e.codigo, 'esquema')
  assert.equal(e.campo, 'ordem')
  assert.match(e.message, /a, b/)
})
