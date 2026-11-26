// SPDX-License-Identifier: AGPL-3.0-or-later
// The 0.1 and 0.2 bodies stay as they were (a 0.3 relay accepts what already exists), with the old text rules.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createObject, validateObject } from '../../packages/protocol/src/index.js'
import { NOW, newIssuer, newRover } from '../helpers/world.js'

const rover = newRover(newIssuer())
const ID = `ob_${'A'.repeat(43)}`
const done = (v, type, body) => createObject({ v, tipo: type, autor: rover.uid, criadoEm: NOW, corpo: body, chavePrivada: rover.rede.chavePrivada })
const refusal = (o, field) => {
  const r = validateObject(o)
  assert.equal(r.ok, false)
  assert.equal(r.erro.codigo, 'esquema')
  assert.equal(r.erro.campo, field)
}

for (const v of ['0.1', '0.2']) {
  test(`bodies ${v}: post and reply accept line breaks, title and name do not; unique topics and at most 3`, () => {
    const post = (extra) => done(v, 'postagem', { texto: 'uma\nduas', topicos: [], ...extra })
    assert.equal(validateObject(post({})).ok, true)
    refusal(post({ titulo: 'uma\nduas' }), 'objeto.corpo.titulo')
    assert.equal(validateObject(post({ titulo: 'um título' })).ok, true)
    assert.equal(validateObject(post({ topicos: ['a1', 'b2', 'c3'] })).ok, true)
    refusal(post({ topicos: ['a1', 'b2', 'c3', 'd4'] }), 'objeto.corpo.topicos')
    refusal(post({ topicos: ['a1', 'a1'] }), 'objeto.corpo.topicos')
    refusal(post({ topicos: ['A1'] }), 'objeto.corpo.topicos[0]')
    assert.equal(validateObject(done(v, 'resposta', { alvo: ID, texto: 'uma\nduas' })).ok, true)
    refusal(done(v, 'resposta', { alvo: ID, texto: 'a http://x.com b http://y.com c http://z.com' }), 'objeto.corpo.texto')
    assert.equal(validateObject(done(v, 'resposta', { alvo: ID, texto: 'a http://x.com b ftp://y.org' })).ok, true, 'the old rule accepts 2 links of any scheme')
    refusal(done(v, 'resposta', { alvo: ID, texto: 'a\n\n\n\nb' }), 'objeto.corpo.texto')
  })

  test(`bodies ${v}: reaction, report and removal keep the values of the time`, () => {
    for (const reaction of ['curtir', 'util']) assert.equal(validateObject(done(v, 'reacao', { alvo: ID, reacao: reaction })).ok, true)
    refusal(done(v, 'reacao', { alvo: ID, reacao: 'amei' }), 'objeto.corpo.reacao')
    for (const reason of ['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'outro']) {
      const o = createObject({ v, tipo: 'denuncia', autor: rover.uid, criadoEm: NOW, previo: null, corpo: { alvo: ID, motivo: reason }, chavePrivada: rover.rede.chavePrivada })
      assert.equal(validateObject(o).ok, true, reason)
    }
    for (const reason of ['menores', 'fora-do-tema', 'personificacao']) {
      const o = createObject({ v, tipo: 'denuncia', autor: rover.uid, criadoEm: NOW, previo: null, corpo: { alvo: ID, motivo: reason }, chavePrivada: rover.rede.chavePrivada })
      assert.equal(validateObject(o).ok, false, `${reason} exists only in 0.3`)
    }
    assert.equal(validateObject(done(v, 'remocao-pelo-autor', { alvo: ID })).ok, true)
  })
}

test('the new report reasons exist in 0.3', () => {
  for (const reason of ['menores', 'fora-do-tema', 'personificacao', 'spam', 'outro']) {
    const o = createObject({ tipo: 'denuncia', autor: rover.uid, criadoEm: NOW, previo: null, corpo: { alvo: ID, motivo: reason }, chavePrivada: rover.rede.chavePrivada })
    assert.equal(validateObject(o).ok, true, reason)
  }
  const bad = createObject({ tipo: 'denuncia', autor: rover.uid, criadoEm: NOW, previo: null, corpo: { alvo: ID, motivo: 'chato' }, chavePrivada: rover.rede.chavePrivada })
  assert.equal(validateObject(bad).ok, false)
})
