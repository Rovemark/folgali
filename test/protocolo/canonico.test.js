// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { bytesCanonicos, canonicalizar, deB64u, ehObjetoSimples, paraB64u } from '../../packages/protocolo/src/index.js'

test('canônico: chaves ordenadas, sem espaço, tipos básicos', () => {
  assert.equal(canonicalizar({ b: 1, a: [true, false, null, 'x'], c: { z: 0, y: -5 } }), '{"a":[true,false,null,"x"],"b":1,"c":{"y":-5,"z":0}}')
})

test('canônico: a ordem das chaves segue unidades UTF-16, como no RFC 8785', () => {
  // U+1F600 (surrogates D83D DE00) vem ANTES de U+FF5E em UTF-16 e DEPOIS em ordem de ponto de código.
  assert.equal(canonicalizar({ '\uFF5E': 1, '\u{1F600}': 2 }), '{"\u{1F600}":2,"\uFF5E":1}')
})

test('canônico: ordem de inserção não muda o resultado', () => {
  assert.equal(canonicalizar({ a: 1, b: 2 }), canonicalizar({ b: 2, a: 1 }))
})

test('canônico: escapes de string iguais aos do JSON padrão', () => {
  assert.equal(canonicalizar('a"b\\c\n\u0001'), '"a\\"b\\\\c\\n\\u0001"')
})

test('canônico: recusa o que não é determinístico', () => {
  for (const ruim of [1.5, NaN, Infinity, 2 ** 60, undefined, () => 1, new Date(), Symbol('x'), 10n, { a: undefined }, new Map(), '\uD800']) {
    assert.throws(() => canonicalizar(ruim), TypeError, String(ruim?.toString?.()))
  }
})

test('canônico: recusa estrutura funda e objeto com protótipo alheio', () => {
  let fundo = 'x'
  for (let i = 0; i < 9; i++) fundo = [fundo]
  assert.throws(() => canonicalizar(fundo), /funda/)
  class Alheio { constructor() { this.a = 1 } }
  assert.throws(() => canonicalizar(new Alheio()), /simples/)
  assert.equal(canonicalizar(Object.assign(Object.create(null), { a: 1 })), '{"a":1}')
})

test('canônico: seis níveis de profundidade passam e sete não, em lista e em objeto', () => {
  assert.equal(canonicalizar([[[[[[1]]]]]]), '[[[[[[1]]]]]]')
  assert.throws(() => canonicalizar([[[[[[[1]]]]]]]), /funda/)
  const objetoFundo = (n) => { let v = 1; for (let i = 0; i < n; i++) v = { a: v }; return v }
  assert.equal(canonicalizar(objetoFundo(6)), '{"a":{"a":{"a":{"a":{"a":{"a":1}}}}}}')
  assert.throws(() => canonicalizar(objetoFundo(7)), /funda/)
})

test('ehObjetoSimples', () => {
  assert.equal(ehObjetoSimples({}), true)
  assert.equal(ehObjetoSimples([]), false)
  assert.equal(ehObjetoSimples(null), false)
  assert.equal(ehObjetoSimples('x'), false)
  assert.equal(ehObjetoSimples(5), false)
  const listaComProtoDeObjeto = Object.setPrototypeOf([], Object.prototype)
  assert.equal(ehObjetoSimples(listaComProtoDeObjeto), false) // lista não vira objeto nem com o protótipo trocado
})

test('bytesCanonicos devolve UTF-8', () => {
  assert.deepEqual(bytesCanonicos('é'), Buffer.from('"é"', 'utf8'))
})

test('base64url estrito', () => {
  const b = Buffer.from([1, 2, 3, 4, 5])
  assert.equal(paraB64u(b), 'AQIDBAU')
  assert.deepEqual(deB64u('AQIDBAU'), b)
  assert.throws(() => deB64u('AQIDBAU='), /inválido/)
  assert.throws(() => deB64u('AQ+/'), /inválido/)
  assert.throws(() => deB64u('AQIDBAV'), /canônico/) // bits sobrando no último caractere
  assert.throws(() => deB64u(5), /inválido/)
})
