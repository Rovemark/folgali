// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3.2: o fragmento SQL da ordem por pessoas distintas, direto. O que ele recusa (argumento ruim nunca vira SQL) e o que ele monta.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TEMPOS } from '../../packages/protocolo/src/index.js'
import { ehPorPessoas, ordemInvalida, paramsDePontos, pontosSql } from '../../packages/rele/src/social-pontos.js'

const bom = { alias: 't', tipoResposta: 'resposta-forum', colunaResposta: 'ctx', janela: false }

test('pontosSql: os quatro argumentos válidos e o que muda com a janela', () => {
  const todo = pontosSql(bom)
  assert.match(todo, /x\.tipo = 'resposta-forum' AND x\.ctx = t\.id AND x\.autor <> t\.autor/)
  assert.match(todo, /y\.tipo = 'reacao' AND y\.alvo = t\.id AND y\.autor <> t\.autor/)
  assert.match(todo, /COUNT\(DISTINCT x\.autor\)/)
  assert.match(todo, /COUNT\(DISTINCT y\.autor\)/)
  assert.equal(todo.includes(':corte'), false, 'sem janela, nada de corte')
  const janela = pontosSql({ ...bom, janela: true })
  assert.equal((janela.match(/:corte/g) ?? []).length, 2, 'com janela, o corte vale para respostas e para reações')
  assert.match(janela, /x\.recebido_em > :corte/)
  assert.match(janela, /y\.recebido_em > :corte/)
  const resposta = pontosSql({ alias: 'o', tipoResposta: 'resposta', colunaResposta: 'alvo', janela: false })
  assert.match(resposta, /x\.tipo = 'resposta' AND x\.alvo = o\.id/)
  assert.match(todo, /3 \*/, 'quem respondeu pesa 3')
})

test('pontosSql: argumento fora da lista fechada nunca vira SQL', () => {
  for (const ruim of [
    { tipoResposta: 'postagem' }, { tipoResposta: "resposta'; DROP TABLE objetos; --" }, { tipoResposta: undefined },
    { colunaResposta: 'id' }, { colunaResposta: 'autor' }, { colunaResposta: 'ctx; --' },
    { alias: 'T' }, { alias: 'abcd' }, { alias: '' }, { alias: 't; --' }, { alias: 't.x' }, { alias: '1' }
  ]) {
    assert.throws(() => pontosSql({ ...bom, ...ruim }), /argumento inválido/, JSON.stringify(ruim))
  }
  // as fronteiras que passam: alias de 1 a 3 letras minúsculas
  for (const alias of ['a', 'ab', 'abc']) assert.ok(pontosSql({ ...bom, alias }).includes(`${alias}.id`))
})

test('paramsDePontos: visibilidade, idade mínima da conta e, só com janela, o corte', () => {
  const visib = { agora: 1_800_000_000, confiaveis: '[]' }
  assert.deepEqual(paramsDePontos(visib, 1_800_000_000, null), { ...visib, idade: TEMPOS.contaConsideradaNaDescobertaS })
  assert.deepEqual(paramsDePontos(visib, 1_800_000_000, 86400), { ...visib, idade: TEMPOS.contaConsideradaNaDescobertaS, corte: 1_800_000_000 - 86400 })
  assert.equal('corte' in paramsDePontos(visib, 1_800_000_000, 0), true, 'janela zero ainda é janela')
})

test('ehPorPessoas e ordemInvalida', () => {
  assert.equal(ehPorPessoas('melhores'), true)
  assert.equal(ehPorPessoas('em-alta'), true)
  for (const outra of ['recentes', 'ativos', 'sem-resposta', 'antigas', 'relevancia', '', undefined, null]) assert.equal(ehPorPessoas(outra), false, String(outra))
  const e = ordemInvalida(['a', 'b'])
  assert.equal(e.codigo, 'esquema')
  assert.equal(e.campo, 'ordem')
  assert.match(e.message, /a, b/)
})
