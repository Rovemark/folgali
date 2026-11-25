// SPDX-License-Identifier: AGPL-3.0-or-later
// A opção do operador `semFatorDeIdade`: tira SÓ o teto menor de rover novo (20% no 1º dia, 50% na 1ª semana). O limite normal
// continua valendo, o padrão continua ligado e um valor torto nunca a liga.
import test from 'node:test'
import assert from 'node:assert/strict'
import { codigoDe, novoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'
import { TAXA_POR_TIPO, tetoComFator } from '../../packages/protocolo/src/index.js'

const POR_HORA = TAXA_POR_TIPO.postagem.find(([s]) => s === 3600)[1] // 10
const postar = (m, r, n) => publicar(m, r, 'postagem', { texto: `Postagem ${n} do teste de conta nova.`, topicos: [] })

/** Quantas postagens seguidas a conta recém-criada consegue fazer na mesma hora antes do limite de taxa. */
function quantasCabem(opcoes) {
  const m = novoMundo({ novatos: true, ...opcoes })
  const r = roverRegistrado(m)
  let n = 0
  while (n < 50 && codigoDe(() => postar(m, r, n)) === 'ok') n++
  return n
}

test('padrão: conta recém-criada tem 20% do teto por hora (o fator de idade vale)', () => {
  assert.equal(quantasCabem({}), tetoComFator(POR_HORA, 0.2))
  assert.equal(quantasCabem({}), 2)
  assert.equal(quantasCabem({ semFatorDeIdade: false }), 2)
})

test('com semFatorDeIdade a conta nova tem o teto cheio, e o teto normal continua valendo (não é "sem limite")', () => {
  assert.equal(quantasCabem({ semFatorDeIdade: true }), POR_HORA)
})

test('só `true` liga: "sim", 1 ou "true" como texto não ligam', () => {
  for (const torto of ['sim', 1, 'true', {}]) assert.equal(quantasCabem({ semFatorDeIdade: torto }), 2, String(torto))
})

test('o estado fica exposto na instância (o binário o escreve no log) e o perfil continua aceito com a opção ligada', () => {
  const m = novoMundo({ novatos: true, semFatorDeIdade: true })
  assert.equal(m.rele.semFatorDeIdade, true)
  const r = roverRegistrado(m)
  assert.equal(publicar(m, r, 'perfil', { nome: 'Pipa', descricao: 'de novo', grafo: 'publico', exigirAprovacao: [] }).estado, 'aceito')
  assert.equal(novoMundo({}).rele.semFatorDeIdade, false)
})
