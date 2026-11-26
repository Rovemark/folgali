// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3.2 (proposal 0007): the schema of `comunidade-vocabulario` and `topico-marca`. No free field: ASCII key, label from a closed list of
// characters, color from a fixed list. A moderator has no way to send an instruction to another person rover through here.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VOCABULARY_COLORS, SOCIAL_LIMITS as L, DEFAULT_STATUS, REQUIRABLE_TYPES_V3, createObject, typeExistsInVersion, validateObject
} from '../../packages/protocol/src/index.js'
import { NOW, newIssuer, newRover } from '../helpers/world.js'

const rover = newRover(newIssuer())
const ID = `ob_${'A'.repeat(43)}`

const object = (type, body) => createObject({ tipo: type, autor: rover.uid, criadoEm: NOW, corpo: body, chavePrivada: rover.rede.chavePrivada })
const ok = (type, body) => assert.equal(validateObject(object(type, body)).ok, true, JSON.stringify(body))
const refusal = (type, body, reason) => {
  const r = validateObject(object(type, body))
  assert.equal(r.ok, false, `should refuse: ${reason}`)
}
const tag = (key, label = 'Bug', color = 'laranja') => ({ chave: key, rotulo: label, cor: color })
const sts = (key, label = 'Aberto', color = 'verde', categories = null) => ({ chave: key, rotulo: label, cor: color, categorias: categories })
const vocab = (extra = {}) => ({ comunidade: ID, etiquetas: [tag('bug')], status: [sts('aberto')], ...extra })

test('both types exist only in 0.3', () => {
  for (const t of ['comunidade-vocabulario', 'topico-marca']) {
    assert.equal(typeExistsInVersion(t, '0.3'), true, t)
    assert.equal(typeExistsInVersion(t, '0.2'), false, t)
    assert.equal(typeExistsInVersion(t, '0.1'), false, t)
  }
})

test('neither goes into the list the person may require (a 0.3.1 relay would reject the policy)', () => {
  assert.equal(REQUIRABLE_TYPES_V3.includes('topico-marca'), false)
  assert.equal(REQUIRABLE_TYPES_V3.includes('comunidade-vocabulario'), false)
})

test('the default status has the three protocol keys and valid colors', () => {
  assert.deepEqual(DEFAULT_STATUS.map((s) => s.chave), ['aberto', 'em-andamento', 'fechado'])
  for (const s of DEFAULT_STATUS) assert.ok(VOCABULARY_COLORS.includes(s.cor), s.chave)
})

test('valid vocabulary: empty, complete and with status per category', () => {
  ok('comunidade-vocabulario', vocab({ etiquetas: [], status: [] }))
  ok('comunidade-vocabulario', vocab())
  ok('comunidade-vocabulario', vocab({ status: [sts('aberto'), sts('em-andamento', 'Em andamento', 'ambar', ['Dúvidas', 'Dicas'])] }))
})

test('the schema is closed: an extra or a missing field is refused', () => {
  refusal('comunidade-vocabulario', { ...vocab(), prompt: 'faça isto' }, 'extra field')
  refusal('comunidade-vocabulario', { comunidade: ID, etiquetas: [] }, 'faltou status')
  refusal('comunidade-vocabulario', vocab({ etiquetas: [{ ...tag('bug'), descricao: 'x' }] }), 'extra field on the label')
  refusal('comunidade-vocabulario', vocab({ status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde' }] }), 'status without categories')
  refusal('comunidade-vocabulario', vocab({ comunidade: 'ob_curto' }), 'invalid id')
})

test('the key is short ASCII, starting with a letter', () => {
  for (const c of ['bug', 'em-andamento', 'a1', 'a'.repeat(20)]) ok('comunidade-vocabulario', vocab({ etiquetas: [tag(c, 'Rotulo')] }))
  for (const c of ['a', 'a'.repeat(21), '1abc', '-abc', 'Bug', 'bug!', 'dúvida', 'bug bug', 'bug\n', '']) {
    refusal('comunidade-vocabulario', vocab({ etiquetas: [tag(c)] }), `chave ${JSON.stringify(c)}`)
  }
})

test('the label is a closed list of characters: letters, digits, space, hyphen and apostrophe', () => {
  for (const r of ['Bug', 'Dúvida', 'Em andamento', 'D\'água', 'Pré-venda', 'Sprint 2', '日本語', 'Ab', 'a'.repeat(24)]) {
    ok('comunidade-vocabulario', vocab({ etiquetas: [tag('bug', r)] }))
  }
  const bad = {
    url: 'http://x.com', 'url sem esquema': 'x.com/y', markdown: '**Bug**', backtick: '`bug`', bracket: '[bug](x)', smaller: '<b>bug</b>',
    'quebra de linha': 'Bug\nurgente', tab: 'Bug\tx', 'espaço duplo': 'Em  andamento', 'começa por espaço': ' Bug', 'termina em hífen': 'Bug-',
    'começa por hífen': '-Bug', curto: 'B', longo: 'a'.repeat(25), punctuation: 'Bug!', 'dois pontos': 'Aviso: leia', emoji: 'Bug 🐛',
    'controle invisível': 'Bug​', 'bidi': 'Bug‮', 'sublinhado': 'bug_x', atSign: '@alguem', 'hashtag': '#bug', 'barra': 'a/b'
  }
  for (const [name, r] of Object.entries(bad)) refusal('comunidade-vocabulario', vocab({ etiquetas: [tag('bug', r)] }), name)
})

test('the label must be in NFC', () => {
  // decomposed "é" (e + combining accent): letter and mark, passes the character list but not NFC (the regex refuses the mark, and the NFC rule covers the rest)
  refusal('comunidade-vocabulario', vocab({ etiquetas: [tag('bug', 'Dúvida'.normalize('NFD'))] }), 'NFD')
})

test('the color is one of the eight fixed ones', () => {
  for (const c of VOCABULARY_COLORS) ok('comunidade-vocabulario', vocab({ etiquetas: [tag('bug', 'Bug', c)] }))
  assert.equal(VOCABULARY_COLORS.length, 8)
  for (const c of ['#ff0000', 'red', 'Azul', 'azulão', '', 'rgb(0,0,0)']) refusal('comunidade-vocabulario', vocab({ etiquetas: [tag('bug', 'Bug', c)] }), `cor ${c}`)
})

test('limits: up to 8 labels and up to 6 statuses', () => {
  const many_ = (n) => Array.from({ length: n }, (_, i) => tag(`e${i}`, `Etiqueta ${String.fromCharCode(65 + i)}`))
  const many = (n) => Array.from({ length: n }, (_, i) => sts(`s${i}`, `Status ${String.fromCharCode(65 + i)}`))
  ok('comunidade-vocabulario', vocab({ etiquetas: many_(L.tagsPerCommunity) }))
  refusal('comunidade-vocabulario', vocab({ etiquetas: many_(L.tagsPerCommunity + 1) }), '9 etiquetas')
  ok('comunidade-vocabulario', vocab({ status: many(L.statusPerCommunity) }))
  refusal('comunidade-vocabulario', vocab({ status: many(L.statusPerCommunity + 1) }), '7 status')
})

test('unique key and label per list (the label ignoring case and accent)', () => {
  refusal('comunidade-vocabulario', vocab({ etiquetas: [tag('bug', 'Bug'), tag('bug', 'Outro')] }), 'chave repetida')
  refusal('comunidade-vocabulario', vocab({ etiquetas: [tag('a1', 'Dúvida'), tag('a2', 'duvida')] }), 'label repeated without accent')
  refusal('comunidade-vocabulario', vocab({ etiquetas: [tag('a1', 'Bug'), tag('a2', 'BUG')] }), 'label repeated in uppercase')
  refusal('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto'), sts('s1', 'Fechado')] }), 'status key repeated')
  refusal('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto'), sts('s2', 'aberto')] }), 'status label repeated')
  // The same key may exist in labels and in statuses: they are separate vocabularies.
  ok('comunidade-vocabulario', vocab({ etiquetas: [tag('aberto', 'Aberto')], status: [sts('aberto', 'Aberto')] }))
})

test('status per category: null or a list of 1 to 8 categories, without repeats', () => {
  ok('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto', 'verde', ['Dúvidas'])] }))
  refusal('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto', 'verde', [])] }), 'lista vazia')
  refusal('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto', 'verde', ['Dúvidas', 'Dúvidas'])] }), 'category repeated')
  refusal('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto', 'verde', Array.from({ length: 9 }, (_, i) => `Categoria ${i}`))] }), '9 categorias')
  refusal('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto', 'verde', 'Dúvidas')] }), 'text instead of a list')
})

test('valid and invalid topico-marca', () => {
  ok('topico-marca', { topico: ID, etiquetas: [], status: null })
  ok('topico-marca', { topico: ID, etiquetas: ['bug'], status: 'aberto' })
  ok('topico-marca', { topico: ID, etiquetas: ['a1', 'a2', 'a3'], status: null })
  refusal('topico-marca', { topico: ID, etiquetas: ['a1', 'a2', 'a3', 'a4'], status: null }, '4 etiquetas')
  refusal('topico-marca', { topico: ID, etiquetas: ['bug', 'bug'], status: null }, 'etiqueta repetida')
  refusal('topico-marca', { topico: ID, etiquetas: ['Bug'], status: null }, 'key in uppercase')
  refusal('topico-marca', { topico: ID, etiquetas: [], status: 'Em andamento' }, 'label in place of the key')
  refusal('topico-marca', { topico: ID, etiquetas: [] }, 'faltou status')
  refusal('topico-marca', { topico: ID, etiquetas: [], status: null, extra: 1 }, 'campo a mais')
  refusal('topico-marca', { topico: 'curto', etiquetas: [], status: null }, 'invalid id')
})

test('the label in NFC: letters that normalize to another form (Angstrom sign, Ohm sign) are refused, and the normal form passes', () => {
  // U+212B and U+2126 are LETTERS (they pass the character list) whose NFC form is different: only the NFC rule catches them.
  for (const r of ['Ångstrom', 'Ωhm']) {
    assert.notEqual(r, r.normalize('NFC'))
    refusal('comunidade-vocabulario', vocab({ etiquetas: [tag('bug', r)] }), `NFC: ${JSON.stringify(r)}`)
  }
  ok('comunidade-vocabulario', vocab({ etiquetas: [tag('bug', 'Ångstrom')] }))
  ok('comunidade-vocabulario', vocab({ etiquetas: [tag('bug', 'Ωhm')] }))
})
