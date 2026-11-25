// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { BaldeDeFichas } from '../../packages/rele/src/limite-taxa.js'
import { objetoDe } from '../ajuda/mundo.js'
import { codigoDe, erroDe, novoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const post = (texto) => ({ texto, topicos: [] })

test('postagem: dez por hora por rover, a décima primeira volta com tempo de espera, e a janela libera', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  for (let i = 0; i < 10; i++) assert.equal(publicar(m, r, 'postagem', post(`p${i}`)).estado, 'aceito')
  const e = erroDe(() => publicar(m, r, 'postagem', post('p10')))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.status, 429)
  assert.equal(e.retryAfterS, 3600)
  m.avancar(1000)
  assert.equal(erroDe(() => publicar(m, r, 'postagem', post('ainda não'))).retryAfterS, 2600)
  m.avancar(2601)
  assert.equal(publicar(m, r, 'postagem', post('agora sim')).estado, 'aceito')
})

test('postagem: o teto diário vale mesmo quando o horário está livre', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  for (let hora = 0; hora < 4; hora++) {
    for (let i = 0; i < 10; i++) publicar(m, r, 'postagem', post(`h${hora} p${i}`))
    m.avancar(3601)
  }
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', post('quadragésima primeira'))), 'limite_de_taxa')
})

test('cada tipo tem a sua cota: estourar postagem não trava reação nem seguir', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const outro = roverRegistrado(m)
  const alvo = publicar(m, outro, 'postagem', post('alvo'))
  for (let i = 0; i < 10; i++) publicar(m, r, 'postagem', post(`p${i}`))
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', post('estourou'))), 'limite_de_taxa')
  assert.equal(publicar(m, r, 'reacao', { alvo: alvo.id, reacao: 'curtir' }).estado, 'aceito')
  assert.equal(publicar(m, r, 'seguir', { alvo: outro.uid }).estado, 'aceito')
})

test('teto total por rover soma todos os tipos', () => {
  const m = novoMundo({ taxas: { total: [[3600, 5]] } })
  const r = roverRegistrado(m) // perfil conta 1
  const outro = roverRegistrado(m)
  publicar(m, r, 'seguir', { alvo: outro.uid })
  publicar(m, r, 'postagem', post('a'))
  publicar(m, r, 'postagem', post('b'))
  publicar(m, r, 'deixar-de-seguir', { alvo: outro.uid })
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', post('sexta'))), 'limite_de_taxa')
})

test('teto por emissor soma todos os rovers dele', () => {
  const m = novoMundo({ taxas: { emissor: [[3600, 6]] } })
  const a = roverRegistrado(m) // 1
  const b = roverRegistrado(m) // 2
  publicar(m, a, 'postagem', post('a1')) // 3
  publicar(m, b, 'postagem', post('b1')) // 4
  publicar(m, a, 'postagem', post('a2')) // 5
  publicar(m, b, 'postagem', post('b2')) // 6
  assert.equal(codigoDe(() => publicar(m, a, 'postagem', post('a3'))), 'limite_de_taxa')
  assert.equal(codigoDe(() => publicar(m, b, 'postagem', post('b3'))), 'limite_de_taxa')
})

test('a cota é de quem foi ACEITO: lixo com o uid de outro não gasta a cota dele', () => {
  const m = novoMundo()
  const vitima = roverRegistrado(m)
  const atacante = roverRegistrado(m)
  for (let i = 0; i < 30; i++) {
    const falso = objetoDe({ ...atacante, uid: vitima.uid }, 'postagem', post(`lixo ${i}`), { criadoEm: m.relogio.agora, previo: vitima.cabeca })
    assert.equal(codigoDe(() => m.rele.aceitar({ objeto: falso })), 'assinatura_invalida')
  }
  for (let i = 0; i < 10; i++) assert.equal(publicar(m, vitima, 'postagem', post(`legítima ${i}`)).estado, 'aceito')
})

test('objeto recusado por outra regra também não conta na cota', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  for (let i = 0; i < 12; i++) assert.equal(codigoDe(() => publicar(m, r, 'postagem', post(`sem aprovação ${i}`), { aprovada: false })), 'sem_aprovacao')
  for (let i = 0; i < 10; i++) assert.equal(publicar(m, r, 'postagem', post(`ok ${i}`)).estado, 'aceito')
})

test('duplicata não gasta cota', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const p = publicar(m, r, 'postagem', post('uma só'))
  const env = { objeto: m.rele.objeto(p.id).objeto, aprovacao: m.rele.objeto(p.id).aprovacao }
  for (let i = 0; i < 30; i++) assert.equal(m.rele.aceitar(env).estado, 'duplicado')
  for (let i = 0; i < 9; i++) assert.equal(publicar(m, r, 'postagem', post(`outra ${i}`)).estado, 'aceito')
})

test('balde de fichas: rajada, reposição e teto de memória', () => {
  let agora = 0
  const b = new BaldeDeFichas({ capacidade: 3, porSegundo: 1, relogio: () => agora, teto: 2 })
  assert.deepEqual([b.tentar('a').ok, b.tentar('a').ok, b.tentar('a').ok], [true, true, true])
  const negado = b.tentar('a')
  assert.equal(negado.ok, false)
  assert.equal(negado.esperaS, 1)
  assert.equal(b.tentar('b').ok, true) // outra origem não é afetada
  agora = 1
  assert.equal(b.tentar('a').ok, true) // uma ficha voltou
  assert.equal(b.tentar('a').ok, false)
  agora = 100
  assert.deepEqual([b.tentar('a').ok, b.tentar('a').ok, b.tentar('a').ok, b.tentar('a').ok], [true, true, true, false]) // nunca passa da capacidade
  b.tentar('c')
  b.tentar('d')
  assert.ok(b.tamanho <= 2)
})

test('balde: espera cresce com o que falta', () => {
  let agora = 0
  const b = new BaldeDeFichas({ capacidade: 1, porSegundo: 0.5, relogio: () => agora })
  assert.equal(b.tentar('x').ok, true)
  assert.equal(b.tentar('x').esperaS, 2)
  agora = 1
  assert.equal(b.tentar('x').esperaS, 1)
})
