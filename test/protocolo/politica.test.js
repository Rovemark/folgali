// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GRAFOS, TIPOS_AUTORIZAVEIS, TIPOS_EXIGIVEIS, TIPOS_DE_OBJETO, exigeAprovacao, grafoMostraContagens, grafoMostraListas, maisRestritivo, politicaEfetiva
} from '../../packages/protocolo/src/index.js'

test('os três níveis de grafo, do mais aberto ao mais fechado', () => {
  assert.deepEqual([...GRAFOS], ['publico', 'contagens', 'privado'])
  assert.deepEqual([...TIPOS_EXIGIVEIS], ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia'])
  assert.deepEqual([...TIPOS_AUTORIZAVEIS], ['postagem', 'resposta'])
})

test('maisRestritivo: vale o mais fechado, em qualquer ordem dos dois', () => {
  const esperado = {
    'publico publico': 'publico', 'publico contagens': 'contagens', 'publico privado': 'privado',
    'contagens publico': 'contagens', 'contagens contagens': 'contagens', 'contagens privado': 'privado',
    'privado publico': 'privado', 'privado contagens': 'privado', 'privado privado': 'privado'
  }
  for (const [par, resultado] of Object.entries(esperado)) {
    const [a, b] = par.split(' ')
    assert.equal(maisRestritivo(a, b), resultado, par)
  }
})

test('exigeAprovacao: perfil, postagem e resposta sempre; as ações livres só quando a política manda', () => {
  for (const t of ['perfil', 'postagem', 'resposta']) {
    assert.equal(exigeAprovacao(t), true, t)
    assert.equal(exigeAprovacao(t, []), true, t)
    assert.equal(exigeAprovacao(t, ['seguir']), true, t)
  }
  for (const t of ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia', 'remocao-pelo-autor']) {
    assert.equal(exigeAprovacao(t), false, t)
    assert.equal(exigeAprovacao(t, []), false, t)
  }
  for (const t of TIPOS_EXIGIVEIS) {
    assert.equal(exigeAprovacao(t, [t]), true, t)
    assert.equal(exigeAprovacao(t, TIPOS_EXIGIVEIS.filter((x) => x !== t)), false, t)
  }
  // remoção pelo autor nunca é exigível: a pessoa e o rover sempre podem apagar o que publicaram
  assert.equal(exigeAprovacao('remocao-pelo-autor', ['seguir']), false)
  assert.equal(TIPOS_EXIGIVEIS.includes('remocao-pelo-autor'), false)
  // todo tipo do protocolo tem uma resposta (nenhum cai em "indefinido")
  for (const t of TIPOS_DE_OBJETO) assert.equal(typeof exigeAprovacao(t, []), 'boolean', t)
})

test('politicaEfetiva: sem declaração da pessoa vale o rover; com ela, o mais restritivo e a união das exigências', () => {
  const rover = { grafo: 'publico', exigirAprovacao: ['reacao'] }
  assert.deepEqual(politicaEfetiva(rover, null), { grafo: 'publico', exigirAprovacao: ['reacao'] })
  assert.deepEqual(politicaEfetiva(rover, undefined), { grafo: 'publico', exigirAprovacao: ['reacao'] })
  assert.deepEqual(politicaEfetiva(rover, { grafo: 'privado', exigirAprovacao: ['seguir', 'reacao'] }), { grafo: 'privado', exigirAprovacao: ['reacao', 'seguir'] })
  // o rover não desfaz o que a pessoa fechou, e a pessoa não desfaz o que o rover fechou
  assert.equal(politicaEfetiva({ grafo: 'publico', exigirAprovacao: [] }, { grafo: 'privado', exigirAprovacao: [] }).grafo, 'privado')
  assert.equal(politicaEfetiva({ grafo: 'privado', exigirAprovacao: [] }, { grafo: 'publico', exigirAprovacao: [] }).grafo, 'privado')
  assert.equal(politicaEfetiva({ grafo: 'contagens', exigirAprovacao: [] }, { grafo: 'publico', exigirAprovacao: [] }).grafo, 'contagens')
  assert.equal(politicaEfetiva({ grafo: 'publico', exigirAprovacao: [] }, { grafo: 'contagens', exigirAprovacao: [] }).grafo, 'contagens')
  // exigência de quem quer que seja vale; sem repetir, em ordem estável
  assert.deepEqual(politicaEfetiva({ grafo: 'publico', exigirAprovacao: ['denuncia', 'seguir'] }, { grafo: 'publico', exigirAprovacao: ['seguir', 'deixar-de-seguir'] }).exigirAprovacao, ['deixar-de-seguir', 'denuncia', 'seguir'])
  assert.deepEqual(politicaEfetiva({ grafo: 'publico', exigirAprovacao: [] }, { grafo: 'publico', exigirAprovacao: ['seguir'] }).exigirAprovacao, ['seguir'])
  assert.deepEqual(politicaEfetiva({ grafo: 'publico', exigirAprovacao: [] }, { grafo: 'publico', exigirAprovacao: [] }).exigirAprovacao, [])
})

test('politicaEfetiva devolve cópias: mexer no resultado não mexe nos dados de quem chamou', () => {
  const rover = { grafo: 'publico', exigirAprovacao: ['seguir'] }
  const r = politicaEfetiva(rover, null)
  r.exigirAprovacao.push('reacao')
  assert.deepEqual(rover.exigirAprovacao, ['seguir'])
  assert.deepEqual(politicaEfetiva(rover, null).exigirAprovacao, ['seguir'])
  assert.deepEqual(politicaEfetiva({ grafo: 'publico', exigirAprovacao: [] }, null).exigirAprovacao, [])
})

test('o que cada nível mostra a quem não é o próprio rover', () => {
  assert.deepEqual(['publico', 'contagens', 'privado'].map(grafoMostraListas), [true, false, false])
  assert.deepEqual(['publico', 'contagens', 'privado'].map(grafoMostraContagens), [true, true, false])
})
