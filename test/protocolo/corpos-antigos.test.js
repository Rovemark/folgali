// SPDX-License-Identifier: AGPL-3.0-or-later
// Os corpos da 0.1 e da 0.2 continuam como eram (relé 0.3 aceita o que já existe), com as regras de texto antigas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { criarObjeto, validarObjeto } from '../../packages/protocolo/src/index.js'
import { AGORA, novoEmissor, novoRover } from '../ajuda/mundo.js'

const rover = novoRover(novoEmissor())
const ID = `ob_${'A'.repeat(43)}`
const feito = (v, tipo, corpo) => criarObjeto({ v, tipo, autor: rover.uid, criadoEm: AGORA, corpo, chavePrivada: rover.rede.chavePrivada })
const recusa = (o, campo) => {
  const r = validarObjeto(o)
  assert.equal(r.ok, false)
  assert.equal(r.erro.codigo, 'esquema')
  assert.equal(r.erro.campo, campo)
}

for (const v of ['0.1', '0.2']) {
  test(`corpos ${v}: postagem e resposta aceitam quebra de linha, título e nome não; tópicos únicos e no máximo 3`, () => {
    const post = (extra) => feito(v, 'postagem', { texto: 'uma\nduas', topicos: [], ...extra })
    assert.equal(validarObjeto(post({})).ok, true)
    recusa(post({ titulo: 'uma\nduas' }), 'objeto.corpo.titulo')
    assert.equal(validarObjeto(post({ titulo: 'um título' })).ok, true)
    assert.equal(validarObjeto(post({ topicos: ['a1', 'b2', 'c3'] })).ok, true)
    recusa(post({ topicos: ['a1', 'b2', 'c3', 'd4'] }), 'objeto.corpo.topicos')
    recusa(post({ topicos: ['a1', 'a1'] }), 'objeto.corpo.topicos')
    recusa(post({ topicos: ['A1'] }), 'objeto.corpo.topicos[0]')
    assert.equal(validarObjeto(feito(v, 'resposta', { alvo: ID, texto: 'uma\nduas' })).ok, true)
    recusa(feito(v, 'resposta', { alvo: ID, texto: 'a http://x.com b http://y.com c http://z.com' }), 'objeto.corpo.texto')
    assert.equal(validarObjeto(feito(v, 'resposta', { alvo: ID, texto: 'a http://x.com b ftp://y.org' })).ok, true, 'a regra antiga aceita 2 links de qualquer esquema')
    recusa(feito(v, 'resposta', { alvo: ID, texto: 'a\n\n\n\nb' }), 'objeto.corpo.texto')
  })

  test(`corpos ${v}: reação, denúncia e remoção mantêm os valores da época`, () => {
    for (const reacao of ['curtir', 'util']) assert.equal(validarObjeto(feito(v, 'reacao', { alvo: ID, reacao })).ok, true)
    recusa(feito(v, 'reacao', { alvo: ID, reacao: 'amei' }), 'objeto.corpo.reacao')
    for (const motivo of ['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'outro']) {
      const o = criarObjeto({ v, tipo: 'denuncia', autor: rover.uid, criadoEm: AGORA, previo: null, corpo: { alvo: ID, motivo }, chavePrivada: rover.rede.chavePrivada })
      assert.equal(validarObjeto(o).ok, true, motivo)
    }
    for (const motivo of ['menores', 'fora-do-tema', 'personificacao']) {
      const o = criarObjeto({ v, tipo: 'denuncia', autor: rover.uid, criadoEm: AGORA, previo: null, corpo: { alvo: ID, motivo }, chavePrivada: rover.rede.chavePrivada })
      assert.equal(validarObjeto(o).ok, false, `${motivo} só existe na 0.3`)
    }
    assert.equal(validarObjeto(feito(v, 'remocao-pelo-autor', { alvo: ID })).ok, true)
  })
}

test('os motivos novos de denúncia existem na 0.3', () => {
  for (const motivo of ['menores', 'fora-do-tema', 'personificacao', 'spam', 'outro']) {
    const o = criarObjeto({ tipo: 'denuncia', autor: rover.uid, criadoEm: AGORA, previo: null, corpo: { alvo: ID, motivo }, chavePrivada: rover.rede.chavePrivada })
    assert.equal(validarObjeto(o).ok, true, motivo)
  }
  const ruim = criarObjeto({ tipo: 'denuncia', autor: rover.uid, criadoEm: AGORA, previo: null, corpo: { alvo: ID, motivo: 'chato' }, chavePrivada: rover.rede.chavePrivada })
  assert.equal(validarObjeto(ruim).ok, false)
})
