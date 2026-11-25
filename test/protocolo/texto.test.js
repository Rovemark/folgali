// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { contarCaracteres, detectarDadoPessoal, validarTexto } from '../../packages/protocolo/src/index.js'

const ok = (t, r = { max: 200, multilinha: true }) => assert.equal(validarTexto(t, r), null, JSON.stringify(t))
const ruim = (t, trecho, r = { max: 200, multilinha: true }) => {
  const m = validarTexto(t, r)
  assert.ok(m, `deveria recusar ${JSON.stringify(t)}`)
  if (trecho) assert.match(m, trecho)
  assert.ok(!m.includes(t) || t.length < 4, 'a mensagem não pode ecoar o texto')
}

test('texto normal passa, com acento, emoji e quebra de linha', () => {
  ok('Olá, mundo! Aprendi hoje que ação é com cedilha.')
  ok('linha um\nlinha dois\n\nlinha quatro')
  ok('bom dia 🙂 e uma família 👨‍👩‍👧 juntos')
  ok('teclas 1️⃣ e ❤️')
  ok('日本語のテキストも, e العربية também')
})

test('tamanho conta caracteres, não unidades UTF-16', () => {
  assert.equal(contarCaracteres('🙂🙂'), 2)
  ok('🙂'.repeat(5), { max: 5 })
  ruim('🙂'.repeat(6), /passa de 5/, { max: 5 })
  ruim('', /vazio/, { min: 1, max: 5 })
  ruim('ab', /pelo menos 3/, { min: 3, max: 5 })
  ok('', { min: 0, max: 5 })
})

test('valores padrão: uma linha só, vazio permitido, sem links', () => {
  assert.equal(validarTexto('', { max: 5 }), null)
  assert.match(validarTexto('a\nb', { max: 5 }), /controle/)
  assert.match(validarTexto('http://x', { max: 50 }), /não pode ter links/)
})

test('só texto: tipo errado e Unicode quebrado', () => {
  for (const v of [5, null, undefined, {}, [], true]) assert.ok(validarTexto(v, { max: 10 }))
  ruim('a\uD800b', /quebrado/)
})

test('NFC é obrigatório', () => {
  ruim('cafe\u0301', /NFC/)
  ok('caf\u00e9')
})

test('não começa nem termina com espaço ou quebra de linha', () => {
  ruim(' oi', /começar nem terminar/)
  ruim('oi ', /começar nem terminar/)
  ruim('oi\n', /começar nem terminar/)
})

test('controle e espaços diferentes do comum são recusados', () => {
  for (const c of ['\t', '\r', '\u0000', '\u007F', '\u0085', '\u00A0', '\u2003', '\u3000', '\u2028', '\u2029', '\uFEFF']) {
    ruim(`a${c}b`, null)
  }
  ruim('uma\nquebra', /controle/, { max: 50, multilinha: false })
})

test('invisíveis são recusados: largura zero, bidi, soft hyphen, tags, seletores, preenchimentos', () => {
  const invisiveis = [
    '\u200B', '\u200C', '\u200E', '\u200F', '\u202A', '\u202E', '\u2066', '\u2069', '\u2060', '\u00AD', '\u061C',
    '\u034F', '\u115F', '\u1160', '\u3164', '\uFFA0', '\u2800', '\u180E', '\uFE00', '\uFE0E', '\u{E0100}', '\u{E0041}', '\uFFFD', '\uE000'
  ]
  for (const c of invisiveis) ruim(`a${c}b`, /invisível|controle/)
})

test('ZWJ só vale ligando dois emojis', () => {
  ok('👩‍💻')
  ruim('a\u200Db', /invisível/)
  ruim('👩\u200D', /invisível|terminar/)
  ruim('\u200D👩', /invisível/)
  ruim('👩 \u200D 💻', /invisível/)
})

test('FE0F só depois de emoji ou tecla', () => {
  ok('❤️')
  ok('#️⃣')
  ruim('a\uFE0F', /invisível/)
})

test('marcas de acentuação empilhadas (zalgo) são recusadas, três passam', () => {
  ok('x\u0300\u0301\u0302')
  ruim('x\u0300\u0301\u0302\u0303', /empilhadas/)
})

test('quebras de linha em excesso', () => {
  ok('a\n\n\nb')
  ruim('a\n\n\n\nb', /quebras de linha demais/)
})

test('sem HTML', () => {
  for (const t of ['<b>oi</b>', 'oi <script>x</script>', '<!-- x -->', '<?xml', 'a </div> b', 'oi &#60;b&#62;', 'a &amp; b', '&lt;b&gt;']) ruim(t, /HTML/)
  ok('2 < 3 e 5 > 4')
  ok('preço R$ 5 & pouco')
})

test('links: limite de links e esquemas perigosos', () => {
  ok('veja https://exemplo.org/a e https://exemplo.org/b', { max: 200, urls: 2 })
  ruim('a https://x.org b https://y.org c https://z.org', /links demais/, { max: 200, urls: 2 })
  ruim('a https://x.org', /não pode ter links/, { max: 200 })
  ruim('clique javascript:alert(1)', /perigoso/, { max: 200 })
  ruim('clique JaVaScRiPt :alert(1)', /perigoso/, { max: 200 })
  ruim('vbscript:x', /perigoso/, { max: 200 })
  ok('uma palavra: javascript é uma linguagem')
})

test('dado pessoal e segredo', () => {
  const casos = {
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
  for (const [t, re] of Object.entries(casos)) ruim(t, re, { max: 300 })
  assert.equal(validarTexto('fulano@exemplo.com', { max: 100, permitirDadoPessoal: true }), null)
})

test('ids da própria rede não são tomados por segredo, e números curtos passam', () => {
  ok(`veja ob_${'A'.repeat(43)} e rvr_${'B'.repeat(22)}`)
  ok('em 2026 teve 12 rovers e 300 posts')
  ok('versão 1.2.3 do protocolo')
})

test('detectarDadoPessoal devolve null no texto limpo', () => {
  assert.equal(detectarDadoPessoal('um texto limpo sobre rovers'), null)
  assert.match(detectarDadoPessoal('a@b.co'), /e-mail/)
})

test('texto adversarial de 1500 caracteres não trava o validador (sem backtracking explosivo)', () => {
  const adversarios = [
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
  const inicio = process.hrtime.bigint()
  for (const t of adversarios) validarTexto(t, { max: 1500, multilinha: true, urls: 2 })
  const ms = Number((process.hrtime.bigint() - inicio) / 1_000_000n)
  assert.ok(ms < 1000, `levou ${ms} ms`)
})
