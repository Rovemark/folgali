// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalBytes, canonicalize, fromB64u, isPlainObject, toB64u } from '../../packages/protocol/src/index.js'

test('canonical: sorted keys, no spaces, basic types', () => {
  assert.equal(canonicalize({ b: 1, a: [true, false, null, 'x'], c: { z: 0, y: -5 } }), '{"a":[true,false,null,"x"],"b":1,"c":{"y":-5,"z":0}}')
})

test('canonical: key order follows UTF-16 units, as in RFC 8785', () => {
  // U+1F600 (surrogates D83D DE00) comes BEFORE U+FF5E in UTF-16 and AFTER in code point order.
  assert.equal(canonicalize({ '\uFF5E': 1, '\u{1F600}': 2 }), '{"\u{1F600}":2,"\uFF5E":1}')
})

test('canonical: insertion order does not change the result', () => {
  assert.equal(canonicalize({ a: 1, b: 2 }), canonicalize({ b: 2, a: 1 }))
})

test('canonical: string escapes equal to standard JSON ones', () => {
  assert.equal(canonicalize('a"b\\c\n\u0001'), '"a\\"b\\\\c\\n\\u0001"')
})

test('canonical: refuses what is not deterministic', () => {
  for (const bad of [1.5, NaN, Infinity, 2 ** 60, undefined, () => 1, new Date(), Symbol('x'), 10n, { a: undefined }, new Map(), '\uD800']) {
    assert.throws(() => canonicalize(bad), TypeError, String(bad?.toString?.()))
  }
})

test('canonical: refuses deep structures and objects with a foreign prototype', () => {
  let background = 'x'
  for (let i = 0; i < 9; i++) background = [background]
  assert.throws(() => canonicalize(background), /funda/)
  class Foreign { constructor() { this.a = 1 } }
  assert.throws(() => canonicalize(new Foreign()), /simples/)
  assert.equal(canonicalize(Object.assign(Object.create(null), { a: 1 })), '{"a":1}')
})

test('canonical: six levels of depth pass and seven do not, in lists and in objects', () => {
  assert.equal(canonicalize([[[[[[1]]]]]]), '[[[[[[1]]]]]]')
  assert.throws(() => canonicalize([[[[[[[1]]]]]]]), /funda/)
  const backgroundObject = (n) => { let v = 1; for (let i = 0; i < n; i++) v = { a: v }; return v }
  assert.equal(canonicalize(backgroundObject(6)), '{"a":{"a":{"a":{"a":{"a":{"a":1}}}}}}')
  assert.throws(() => canonicalize(backgroundObject(7)), /funda/)
})

test('ehObjetoSimples', () => {
  assert.equal(isPlainObject({}), true)
  assert.equal(isPlainObject([]), false)
  assert.equal(isPlainObject(null), false)
  assert.equal(isPlainObject('x'), false)
  assert.equal(isPlainObject(5), false)
  const listWithObjectProto = Object.setPrototypeOf([], Object.prototype)
  assert.equal(isPlainObject(listWithObjectProto), false) // a list does not become an object even with the prototype swapped
})

test('canonicalBytes returns UTF-8', () => {
  assert.deepEqual(canonicalBytes('é'), Buffer.from('"é"', 'utf8'))
})

test('strict base64url', () => {
  const b = Buffer.from([1, 2, 3, 4, 5])
  assert.equal(toB64u(b), 'AQIDBAU')
  assert.deepEqual(fromB64u('AQIDBAU'), b)
  assert.throws(() => fromB64u('AQIDBAU='), /inválido/)
  assert.throws(() => fromB64u('AQ+/'), /inválido/)
  assert.throws(() => fromB64u('AQIDBAV'), /canônico/) // spare bits in the last character
  assert.throws(() => fromB64u(5), /inválido/)
})
