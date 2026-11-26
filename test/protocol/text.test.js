// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { countChars, detectPersonalData, validateText } from '../../packages/protocol/src/index.js'

const ok = (t, r = { max: 200, multilinha: true }) => assert.equal(validateText(t, r), null, JSON.stringify(t))
const bad = (t, excerpt, r = { max: 200, multilinha: true }) => {
  const m = validateText(t, r)
  assert.ok(m, `should refuse ${JSON.stringify(t)}`)
  if (excerpt) assert.match(m, excerpt)
  assert.ok(!m.includes(t) || t.length < 4, 'the message must not echo the text')
}

test('normal text passes, with accents, emoji and line breaks', () => {
  ok('Olá, mundo! Aprendi hoje que ação é com cedilha.')
  ok('linha um\nlinha dois\n\nlinha quatro')
  ok('bom dia 🙂 e uma família 👨‍👩‍👧 juntos')
  ok('teclas 1️⃣ e ❤️')
  ok('日本語のテキストも, e العربية também')
})

test('length counts characters, not UTF-16 units', () => {
  assert.equal(countChars('🙂🙂'), 2)
  ok('🙂'.repeat(5), { max: 5 })
  bad('🙂'.repeat(6), /passa de 5/, { max: 5 })
  bad('', /vazio/, { min: 1, max: 5 })
  bad('ab', /pelo menos 3/, { min: 3, max: 5 })
  ok('', { min: 0, max: 5 })
})

test('default values: a single line, empty allowed, no links', () => {
  assert.equal(validateText('', { max: 5 }), null)
  assert.match(validateText('a\nb', { max: 5 }), /controle/)
  assert.match(validateText('http://x', { max: 50 }), /não pode ter links/)
})

test('text only: wrong type and broken Unicode', () => {
  for (const v of [5, null, undefined, {}, [], true]) assert.ok(validateText(v, { max: 10 }))
  bad('a\uD800b', /quebrado/)
})

test('NFC is mandatory', () => {
  bad('cafe\u0301', /NFC/)
  ok('caf\u00e9')
})

test('does not start or end with a space or line break', () => {
  bad(' oi', /começar nem terminar/)
  bad('oi ', /começar nem terminar/)
  bad('oi\n', /começar nem terminar/)
})

test('control characters and unusual spaces are refused', () => {
  for (const c of ['\t', '\r', '\u0000', '\u007F', '\u0085', '\u00A0', '\u2003', '\u3000', '\u2028', '\u2029', '\uFEFF']) {
    bad(`a${c}b`, null)
  }
  bad('uma\nquebra', /controle/, { max: 50, multilinha: false })
})

test('invisible characters are refused: zero width, bidi, soft hyphen, tags, selectors, fillers', () => {
  const invisible = [
    '\u200B', '\u200C', '\u200E', '\u200F', '\u202A', '\u202E', '\u2066', '\u2069', '\u2060', '\u00AD', '\u061C',
    '\u034F', '\u115F', '\u1160', '\u3164', '\uFFA0', '\u2800', '\u180E', '\uFE00', '\uFE0E', '\u{E0100}', '\u{E0041}', '\uFFFD', '\uE000'
  ]
  for (const c of invisible) bad(`a${c}b`, /invisível|controle/)
})

test('ZWJ is valid only when joining two emojis', () => {
  ok('👩‍💻')
  bad('a\u200Db', /invisível/)
  bad('👩\u200D', /invisível|terminar/)
  bad('\u200D👩', /invisível/)
  bad('👩 \u200D 💻', /invisível/)
})

test('FE0F only after an emoji or a key', () => {
  ok('❤️')
  ok('#️⃣')
  bad('a\uFE0F', /invisível/)
})

test('stacked accent marks (zalgo) are refused, three pass', () => {
  ok('x\u0300\u0301\u0302')
  bad('x\u0300\u0301\u0302\u0303', /empilhadas/)
})

test('too many line breaks', () => {
  ok('a\n\n\nb')
  bad('a\n\n\n\nb', /quebras de linha demais/)
})

test('no HTML', () => {
  for (const t of ['<b>oi</b>', 'oi <script>x</script>', '<!-- x -->', '<?xml', 'a </div> b', 'oi &#60;b&#62;', 'a &amp; b', '&lt;b&gt;']) bad(t, /HTML/)
  ok('2 < 3 e 5 > 4')
  ok('preço R$ 5 & pouco')
})

test('links: link limit and dangerous schemes', () => {
  ok('veja https://exemplo.org/a e https://exemplo.org/b', { max: 200, urls: 2 })
  bad('a https://x.org b https://y.org c https://z.org', /links demais/, { max: 200, urls: 2 })
  bad('a https://x.org', /não pode ter links/, { max: 200 })
  bad('clique javascript:alert(1)', /perigoso/, { max: 200 })
  bad('clique JaVaScRiPt :alert(1)', /perigoso/, { max: 200 })
  bad('vbscript:x', /perigoso/, { max: 200 })
  ok('uma palavra: javascript é uma linguagem')
})

test('personal data and secrets', () => {
  const cases = {
    'me escreve em fulano@exemplo.com.br': /e-mail/,
    'liga 11 91234-5678': /número longo/,
    'cpf 123.456.789-09': /número longo/,
    'cartão 4111 1111 1111 1111': /número longo/,
    'fica em /Users/maria/Documents': /pasta de usuário/,
    'C:\\Users\\joao\\Desktop': /pasta de usuário/,
    '-----BEGIN PRIVATE KEY-----': /segredo/,
    'chave sk-abcdefghijklmnop1234': /segredo/,
    'AKIAABCDEFGHIJKLMNOP': /segredo/,
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789': /segredo/,
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc': /segredo/,
    [`token ${'A1b2'.repeat(12)}`]: /segredo/
  }
  for (const [t, re] of Object.entries(cases)) bad(t, re, { max: 300 })
  assert.equal(validateText('fulano@exemplo.com', { max: 100, allowPersonalData: true }), null)
})

test('the network own ids are not taken for secrets, and short numbers pass', () => {
  ok(`veja ob_${'A'.repeat(43)} e rvr_${'B'.repeat(22)}`)
  ok('em 2026 teve 12 rovers e 300 posts')
  ok('versão 1.2.3 do protocolo')
})

test('detectPersonalData returns null on clean text', () => {
  assert.equal(detectPersonalData('um texto limpo sobre rovers'), null)
  assert.match(detectPersonalData('a@b.co'), /e-mail/)
})

test('adversarial text of 1500 characters does not hang the validator (no explosive backtracking)', () => {
  const adversaries = [
    '1'.repeat(1500),
    '1 '.repeat(750).trim(),
    '1.'.repeat(750).slice(0, -1),
    'a'.repeat(1500),
    'a@'.repeat(750),
    `${'a'.repeat(60)}@${'b'.repeat(1400)}`,
    `${'a'.repeat(1400)}.`,
    'x́'.repeat(750),
    `${'-'.repeat(1499)}A`,
    '<'.repeat(1500),
    'http://'.repeat(200)
  ]
  const home = process.hrtime.bigint()
  for (const t of adversaries) validateText(t, { max: 1500, multilinha: true, urls: 2 })
  const ms = Number((process.hrtime.bigint() - home) / 1_000_000n)
  assert.ok(ms < 1000, `took ${ms} ms`)
})
