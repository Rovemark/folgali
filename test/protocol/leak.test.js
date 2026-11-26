// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009): the leak detector catches each type, in the right place, without returning the snippet. False positives have their own battery
// (leak-false-positives.test.js). No key here is real: they are built on the spot with each service format.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FREE_TEXT_FIELDS, LEAK_EXPLANATIONS, LEAK_TYPES, validCnpj, validCpf, detectLeak, entropy, internalIpv4,
  validLuhn, findLeaks, leakInObject
} from '../../packages/protocol/src/index.js'

// Built on the spot, so no secret scanner finds a "real" key in the repository.
const repeat = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n)
const B62 = 'aB3xK9mQ2pL7vN4tR8sW1yZ6uE5cD0fG'
const CASES = [
  ['chave-privada', `-----BEGIN ${'PRIVATE'} KEY-----`],
  ['chave-privada', `-----BEGIN OPENSSH ${'PRIVATE'} KEY-----`],
  ['chave-privada', `-----BEGIN RSA ${'PRIVATE'} KEY-----`],
  ['chave-privada', `-----BEGIN PGP ${'PRIVATE'} KEY BLOCK-----`],
  ['chave-privada', 'PuTTY-User-Key-File-3: ssh-ed25519'],
  ['chave-de-api', `sk-${repeat(B62, 30)}`],
  ['chave-de-api', `sk-proj-${repeat(B62, 40)}`],
  ['chave-de-api', `sk-ant-${repeat(B62, 40)}`],
  ['chave-de-api', `sk-or-v1-${repeat(B62, 40)}`],
  ['chave-de-api', `sk_live_${repeat(B62, 24)}`],
  ['chave-de-api', `rk_test_${repeat(B62, 24)}`],
  ['chave-de-api', `ghp_${repeat(B62, 36)}`],
  ['chave-de-api', `gho_${repeat(B62, 36)}`],
  ['chave-de-api', `github_pat_${repeat(B62, 40)}`],
  ['chave-de-api', `glpat-${repeat(B62, 20)}`],
  ['chave-de-api', `xoxb-${'1234567890'}-${repeat(B62, 12)}`],
  ['chave-de-api', `xoxp-${repeat('a1', 12)}`],
  ['chave-de-api', `AKIA${'IOSFODNN7EXAMPLE'}`],
  ['chave-de-api', `ASIA${'Y34FZKBOKMUTVV7A'}`],
  ['chave-de-api', `AIza${repeat(B62, 35)}`],
  ['chave-de-api', `GOCSPX-${repeat(B62, 28)}`],
  ['chave-de-api', `npm_${repeat(B62, 36)}`],
  ['chave-de-api', `pypi-${repeat(B62, 60)}`],
  ['chave-de-api', `hf_${repeat(B62, 34)}`],
  ['chave-de-api', `xai-${repeat(B62, 48)}`],
  ['chave-de-api', `SG.${repeat(B62, 22)}.${repeat(B62, 43)}`],
  ['chave-de-api', `shpat_${repeat('0a1b2c3d', 32)}`],
  ['chave-de-api', `123456789:AA${repeat(B62, 33)}`],
  ['chave-de-api', `lgos_${repeat(B62, 24)}`],
  ['chave-de-api', `rvm_${repeat(B62, 24)}`],
  ['token', `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.${repeat(B62, 43)}`],
  ['token', `Authorization: Bearer ${repeat(B62, 32)}`],
  ['token', `bearer ${repeat('abc123', 20)}`],
  ['token', `Basic ${repeat('dXNlcjpwYXNz', 24)}`],
  ['url-com-credencial', 'postgres://app:Segredo123@db.exemplo.com:5432/app'],
  ['url-com-credencial', 'https://ana:hunter2@site.exemplo.com/painel'],
  ['url-com-credencial', 'https://api.exemplo.com/v1/dados?api_key=abc123def456'],
  ['url-com-credencial', 'https://maps.exemplo.com/js?key=Zx9Yw8Vu7T'],
  ['url-com-credencial', 'https://exemplo.com/x?a=1&access_token=Qw3rTy9Uiop'],
  ['url-com-credencial', 'https://exemplo.blob.core.windows.net/c/f.txt?sv=2020&sig=Ab12Cd34Ef'],
  ['url-com-credencial', `https://hooks.slack.com/services/T0000/B0000/${repeat(B62, 24)}`],
  ['url-com-credencial', `https://discord.com/api/webhooks/123456789/${repeat(B62, 60)}`],
  ['senha', 'senha: Gatinho2024!'],
  ['senha', 'Senha = Abc123456'],
  ['senha', 'password=hunter22'],
  ['senha', 'pwd: s3nh@forte'],
  ['senha', 'api_key: abcd1234efgh'],
  ['senha', 'chave de api: zz99yy88xx'],
  ['senha', 'client_secret="Qw3rTy9Uiop"'],
  ['senha', 'a senha é Pa55word!'],
  ['senha', 'my password is CorrectHorse9'],
  ['senha', 'OPENAI_API_KEY=abc123'],
  ['senha', 'DB_PASSWORD = segredo'],
  ['senha', 'AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI"'],
  ['email', 'me escreve em ana.souza+folga@exemplo.com.br'],
  ['email', 'CONTATO@EXEMPLO.COM'],
  ['telefone', 'liga pra mim (11) 98765-4321'],
  ['telefone', 'fixo (21) 3456-7890'],
  ['telefone', 'zap 98765-4321'],
  ['telefone', 'zap 11 98765-4321'],
  ['telefone', '+55 11 98765-4321'],
  ['telefone', '+1 (415) 555-0100'],
  ['telefone', '+44 20 7946 0958'],
  ['telefone', 'zap 11999998888'],
  ['cpf', 'meu cpf é 123.456.789-09'],
  ['cpf', 'cpf 52998224725'],
  ['cnpj', 'cnpj 11.222.333/0001-81'],
  ['cnpj', 'cnpj 11222333000181'],
  ['cartao', 'cartão 4111 1111 1111 1111'],
  ['cartao', 'cartão 5555-5555-5555-4444'],
  ['cartao', 'amex 3782 822463 10005'],
  ['cartao', '4111111111111111'],
  ['ip-privado', 'o servidor é 192.168.0.10'],
  ['ip-privado', 'ssh em 10.0.0.5:22'],
  ['ip-privado', 'proxy 172.16.4.1'],
  ['ip-privado', 'proxy 172.31.255.255'],
  ['ip-privado', 'tailnet 100.101.102.103'],
  ['ip-privado', 'local 127.0.0.1:3000'],
  ['ip-privado', 'enlace 169.254.10.20'],
  ['ip-privado', 'v6 fd12:3456:789a::1'],
  ['ip-privado', 'v6 fe80::1ff:fe23:4567:890a'],
  ['host-interno', 'acessei o mac-mini-da-joana.local'],
  ['host-interno', 'o nas.ts.net caiu'],
  ['host-interno', 'deploy em api.svc.cluster.local'],
  ['host-interno', 'painel.intranet aberto'],
  ['host-interno', 'banco.interno.corp'],
  ['host-interno', 'roteador.home.arpa'],
  ['host-interno', 'servico.consul'],
  ['host-interno', 'Impressora.LAN'],
  ['caminho-local', 'salvei em /Users/joana/Documentos/plano.pdf'],
  ['caminho-local', 'log em /home/ana/app.log'],
  ['caminho-local', 'veja /etc/nginx/nginx.conf'],
  ['caminho-local', 'arquivo /var/lib/app/banco.sqlite'],
  ['caminho-local', 'abri ~/projetos/segredo.txt'],
  ['caminho-local', 'C:\\Users\\ana\\Desktop\\x.txt'],
  ['caminho-local', 'D:\\backup\\clientes.xlsx'],
  ['caminho-local', '\\\\servidor\\compartilhado\\planilha.xlsx'],
  ['caminho-local', 'em /private/var/folders/x'],
  ['caminho-local', 'disco /Volumes/Backup/fotos'],
  ['identificador-interno', 'id 550e8400-e29b-41d4-a716-446655440000'],
  ['identificador-interno', 'UUID 123E4567-E89B-12D3-A456-426614174000'],
  ['alta-entropia', `token ${repeat(B62, 28)}`],
  ['alta-entropia', 'md5 d41d8cd98f00b204e9800998ecf8427e'],
  ['alta-entropia', `sha ${repeat('9f86d081884c7d65', 64)}`]
]

test('each type in the list has an explanation, and the list has no duplicates', () => {
  assert.equal(new Set(LEAK_TYPES).size, LEAK_TYPES.length)
  assert.deepEqual(Object.keys(LEAK_EXPLANATIONS).sort(), [...LEAK_TYPES].sort())
  for (const t of LEAK_TYPES) assert.ok(LEAK_EXPLANATIONS[t].length > 5, t)
  // every type appears in at least one case: no rule without proof
  for (const t of LEAK_TYPES) assert.ok(CASES.some(([type]) => type === t), `type without a case: ${t}`)
})

for (const [type, text] of CASES) {
  test(`pega ${type}: ${text.slice(0, 48)}`, () => {
    const findings = findLeaks(text)
    assert.equal(findings.length >= 1, true, 'not caught')
    assert.equal(findings[0].tipo, type)
    const v = detectLeak(text)
    assert.equal(v.tipo, type)
    assert.equal(v.explicacao, LEAK_EXPLANATIONS[type])
    // the explanation never repeats the snippet
    assert.ok(!v.explicacao.includes(text.slice(v.inicio, v.fim)))
  })
}

test('the position marks the exact snippet, and each snippet has a single type (the first in the order wins)', () => {
  const key = `sk-proj-${repeat(B62, 40)}`
  const text = `oi! a chave é ${key} e o resto é conversa`
  const [a] = findLeaks(text)
  assert.equal(text.slice(a.inicio, a.fim), key)
  assert.equal(findLeaks(text).length, 1, 'the key does not also become alta-entropia')
  // two leaks in the same text, in position order
  const two = findLeaks('fala com ana@exemplo.com ou no 192.168.1.20')
  assert.deepEqual(two.map((x) => x.tipo), ['email', 'ip-privado'])
  assert.ok(two[0].inicio < two[1].inicio)
  assert.equal('fala com ana@exemplo.com ou no 192.168.1.20'.slice(two[1].inicio, two[1].fim), '192.168.1.20')
  // a URL with a password is a URL with credentials (not an e-mail, even with @)
  assert.equal(detectLeak('https://u:Senha9@h.exemplo.com').tipo, 'url-com-credencial')
  // e-mail in the right order among the numbers (the formatted CNPJ does not become a phone or a card)
  assert.deepEqual(findLeaks('11.222.333/0001-81').map((x) => x.tipo), ['cnpj'])
})

test('what is not text, or is empty, has no leak', () => {
  for (const v of [undefined, null, 42, {}, [], '']) assert.deepEqual(findLeaks(v), [])
  assert.equal(detectLeak('nada aqui'), null)
})

test('a secret after "senha:" must look like a secret', () => {
  for (const ok of ['senha: paciência', 'senha: gato', 'token: 3', 'password: banana', 'senha é amor', 'secret: segredo']) {
    assert.equal(detectLeak(ok), null, ok)
  }
  assert.equal(detectLeak('senha: Gatinho'), null, 'a word with a capital initial is a word')
  for (const bad of ['senha: gaTinho', 'senha: gato12', 'senha: ga.to!x', 'token: abc-def']) assert.equal(detectLeak(bad)?.tipo, 'senha', bad)
  assert.equal(detectLeak('senha: ab1'), null, 'too short (under 6) passes')
  assert.equal(detectLeak('senha: abcde1')?.tipo, 'senha', '6 characters with a digit')
})

test('CPF and CNPJ: formatted always counts; digits only, only with the right check digits', () => {
  assert.equal(validCpf('529.982.247-25'), true)
  assert.equal(validCpf('52998224725'), true)
  assert.equal(validCpf('52998224724'), false)
  assert.equal(validCpf('52998224715'), false, 'the first check digit counts too')
  assert.equal(validCpf('111.111.111-11'), false)
  assert.equal(validCpf('1234567890'), false)
  assert.equal(validCpf('00000000191'), true)
  assert.equal(validCnpj('11.222.333/0001-81'), true)
  assert.equal(validCnpj('11222333000180'), false)
  assert.equal(validCnpj('11222333000191'), false, 'the first check digit counts too')
  assert.equal(validCnpj('00000000000000'), false)
  assert.equal(validCnpj('1122233300018'), false)
  assert.equal(detectLeak('código 52898224724'), null, '11 digits that are not a CPF (nor a mobile number with area code) pass')
  assert.equal(detectLeak('pedido 11222333000180'), null, '14 digits that are not a CNPJ pass')
  assert.equal(detectLeak('cpf 111.222.333-44')?.tipo, 'cpf', 'formatted counts even with a wrong digit: nobody writes that by accident')
})

test('CPF and CNPJ whose check digit gives remainder 10 or less than 2', () => {
  // cases that go through the special remainder branch: in the CPF the first digit gives remainder 10 (becomes 0); in the CNPJ the first gives remainder 1 (becomes 0)
  assert.equal(validCpf('390.533.447-05'), true)
  assert.equal(validCnpj('60.701.190/0001-04'), true)
})

test('card: Luhn from 13 to 19 digits; consecutive years and groups of 4 without Luhn are not a card', () => {
  assert.equal(validLuhn('4111 1111 1111 1111'), true)
  assert.equal(validLuhn('4111 1111 1111 1112'), false)
  assert.equal(validLuhn('4222222222222'), true, '13 digits')
  assert.equal(validLuhn('422222222222'), false, '12 digits is not a card')
  assert.equal(validLuhn('6011000990139424'), true)
  assert.equal(validLuhn('42222222222222222224'), false, '20 digits is not a card')
  assert.equal(detectLeak('anos 2000 2007 2008 2009'), null)
  assert.equal(validLuhn('2000 2007 2008 2009'), true, 'the case above passes Luhn: it is the years rule that saves it')
  assert.equal(detectLeak('anos 1900 1999 2000 2099')?.tipo ?? null, validLuhn('1900 1999 2000 2099') ? 'cartao' : null, 'year edges')
  assert.equal(detectLeak('grupos 2000 2007 2008 2109')?.tipo ?? null, validLuhn('2000 2007 2008 2109') ? 'cartao' : null, '2109 is not a year')
  assert.equal(detectLeak('rodada 1234 5678 9012 3456'), null)
})

test('internal IPv4: the ranges and the edges', () => {
  for (const ip of ['10.0.0.1', '10.255.255.255', '127.0.0.1', '172.16.0.1', '172.31.0.1', '192.168.1.1', '169.254.1.1', '100.64.0.1', '100.127.255.255']) {
    assert.equal(internalIpv4(ip), true, ip)
  }
  for (const ip of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.0.1', '169.253.0.1', '100.63.0.1', '100.128.0.1', '11.0.0.1', '10.0.0.256', '192.168.1', '1.2.3.4.5']) {
    assert.equal(internalIpv4(ip), false, ip)
  }
  assert.equal(detectLeak('dns 8.8.8.8'), null, 'a public IP passes (open decision in proposal 0009)')
  assert.equal(detectLeak('versão 10.0.0.1.5'), null, 'five parts is a version, not an IP')
})

test('entropy: random is high, repeated is low', () => {
  assert.equal(entropy('aaaa'), 0)
  assert.equal(entropy('ab'), 1)
  assert.ok(entropy(B62) > 4.5)
  assert.equal(detectLeak(`x ${'Aa1'.repeat(10)}`), null, 'mixed but repeated is not a key')
})

test('high entropy: needs uppercase, lowercase and a digit; slug and network ids pass', () => {
  assert.equal(detectLeak(`x ${repeat('abcdefghijklmnopqrstuvwxyz0123', 30)}`), null, 'no uppercase')
  assert.equal(detectLeak(`x ${repeat('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123', 30)}`), null, 'no lowercase')
  assert.equal(detectLeak(`x ${repeat('abcdefghijklmnopqrstuvwxyzABCD', 30)}`), null, 'no digit')
  assert.equal(detectLeak('Receita-De-Bolo-De-Cenoura-2024-Facil'), null, 'slug')
  assert.equal(detectLeak(`rvr_${repeat(B62, 22)}`), null, 'network uid')
  assert.equal(detectLeak(`ob_${repeat(B62, 43)}`), null, 'object id')
  assert.equal(detectLeak(`au_${repeat(B62, 43)}`), null, 'authorization id')
  assert.equal(detectLeak(`x ${repeat(B62, 23)}`), null, '23 characters not yet')
  assert.equal(detectLeak(`x ${repeat(B62, 24)}`)?.tipo, 'alta-entropia', '24 already')
  assert.equal(detectLeak('hex ' + 'a'.repeat(40)), null, 'hex without a digit')
  assert.equal(detectLeak('hex ' + '1'.repeat(40)), null, 'hex without a letter')
  assert.equal(detectLeak('hex ' + repeat('0a1b', 31)), null, '31 hex not yet')
})

test('in the object: only the free text fields; ids, keys, hashes and ciphertexts are left out', () => {
  const B = repeat(B62, 43)
  // target id and tags are not read, even if they look like a key
  assert.equal(leakInObject({ corpo: { alvo: `ob_${B}`, texto: 'oi', topicos: ['x'] } }), null)
  assert.equal(leakInObject({ corpo: { hash: repeat('0a1b2c3d', 64), alt: 'foto da praia' } }), null)
  assert.equal(leakInObject({ corpo: { cifrado: B, nonce: B } }), null)
  const v = leakInObject({ corpo: { titulo: 'oi', texto: 'escreve pra ana@exemplo.com' } })
  assert.equal(v.campo, 'objeto.corpo.texto')
  assert.equal(v.tipo, 'email')
  // inside a list and a nested object (poll, tags)
  assert.equal(leakInObject({ corpo: { enquete: { opcoes: ['sim', 'liga 98765-4321'], encerraEm: 1 } } }).campo, 'objeto.corpo.enquete.opcoes[1]')
  assert.equal(leakInObject({ corpo: { etiquetas: [{ chave: 'a', rotulo: 'mac.local', cor: 'azul' }] } }).campo, 'objeto.corpo.etiquetas[0].rotulo')
  // the text field finds the first one in key order
  assert.equal(leakInObject({ corpo: { nome: 'x@exemplo.com', descricao: '10.0.0.1' } }).tipo, 'email')
  for (const field of ['texto', 'titulo', 'nome', 'descricao', 'sobre', 'regras', 'resultado', 'alt', 'rotulo', 'categoria']) {
    assert.equal(leakInObject({ corpo: { [field]: 'ana@exemplo.com' } })?.campo, `objeto.corpo.${field}`, field)
    assert.ok(FREE_TEXT_FIELDS.includes(field))
  }
  assert.equal(leakInObject({ corpo: { categorias: ['a', 'b@exemplo.com'] } })?.campo, 'objeto.corpo.categorias[1]')
  assert.equal(leakInObject({ corpo: { status: [{ chave: 'x', rotulo: 'ok', cor: 'azul', categorias: null }] } }), null)
  for (const bad of [null, undefined, {}, { corpo: null }, { corpo: 'texto solto' }]) assert.equal(leakInObject(bad), null)
})

// ---------- edge cases that mutation testing asked for ----------

// Oracles written separately, from the public definition of each algorithm, to generate cases the code did not choose.
const luhnOracle = (digits) => {
  let sum = 0
  ;[...digits].reverse().forEach((c, i) => { const n = Number(c) * (i % 2 ? 2 : 1); sum += n > 9 ? n - 9 : n })
  return sum % 10 === 0
}
const withLuhnDigit = (base) => { for (let d = 0; d < 10; d++) if (luhnOracle(base + d)) return base + d }
const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const dvCnpj = (d, weights) => { const r = weights.reduce((s, p, i) => s + p * Number(d[i]), 0) % 11; return r < 2 ? 0 : 11 - r }
const cnpjOf = (base12) => { const a = base12 + dvCnpj(base12, CNPJ_WEIGHTS_1); return a + dvCnpj(a, CNPJ_WEIGHTS_2) }

test('CNPJ: each weight counts and each special remainder counts (200 random bases, with the 2nd digit swapped)', () => {
  let seed = 7
  const draw = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed }
  const remainders = new Set()
  for (let k = 0; k < 200; k++) {
    const base = Array.from({ length: 12 }, () => String(draw() % 10)).join('')
    const c = cnpjOf(base)
    remainders.add(CNPJ_WEIGHTS_1.reduce((s, p, i) => s + p * Number(base[i]), 0) % 11)
    assert.equal(validCnpj(c), true, c)
    assert.equal(validCnpj(c.slice(0, 13) + ((Number(c[13]) + 1) % 10)), false, `${c} with the last digit swapped`)
    assert.equal(validCnpj(c.slice(0, 12) + ((Number(c[12]) + 1) % 10) + c[13]), false, `${c} with the second to last digit swapped`)
  }
  for (const r of [0, 1, 2, 10]) assert.ok(remainders.has(r), `the draw covered the remainder ${r}`)
})

test('Luhn: 12 and 20 digits are never a card, even with the right digit; 13 and 19 are', () => {
  const twelve = withLuhnDigit('42222222222')
  const twenty = withLuhnDigit('4222222222222222222')
  assert.equal(luhnOracle(twelve) && luhnOracle(twenty), true)
  assert.equal(validLuhn(twelve), false)
  assert.equal(validLuhn(twenty), false)
  assert.equal(validLuhn(withLuhnDigit('422222222222')), true, '13')
  assert.equal(validLuhn(withLuhnDigit('422222222222222222')), true, '19')
  // the digits that, doubled, go over 9 (5 to 9): the "minus 9" is what makes real Luhn
  for (const base of ['555555555555555', '999999999999999', '678967896789678']) {
    const c = withLuhnDigit(base)
    assert.equal(validLuhn(c), true, c)
    assert.equal(validLuhn(c.slice(0, -1) + ((Number(c.at(-1)) + 5) % 10)), false)
  }
})

test('years: only 1900 to 2099; a group outside that is a card candidate again', () => {
  assert.equal(validLuhn('1900 2000 2001 2006'), true)
  assert.equal(detectLeak('anos 1900 2000 2001 2006'), null, 'all are years')
  assert.equal(validLuhn('1800 2000 2001 2007'), true)
  assert.equal(detectLeak('grupos 1800 2000 2001 2007')?.tipo, 'cartao', '1800 is not a year')
})

test('international phone: 10 to 15 digits', () => {
  assert.equal(detectLeak('liga +12 3456 7890')?.tipo, 'telefone', '10 digits')
  assert.equal(detectLeak('liga +12 3456 789'), null, '9 digits')
  assert.equal(detectLeak('liga +123 4567 8901 2345')?.tipo, 'telefone', '15 digits')
  assert.equal(detectLeak('liga +123 4567 8901 23456'), null, '16 digits')
})

test('entropy of exactly 3.5 bits per character already counts', () => {
  // 8 symbols 2 times (1/16 each) and 4 symbols 4 times (1/8 each): 8 x 1/16 x 4 + 4 x 1/8 x 3 = exactly 3.5
  const s = 'abcdEF12'.repeat(2) + 'GGGGhhhh3333iiii'
  assert.equal(entropy(s), 3.5)
  assert.equal(detectLeak(`x ${s}`)?.tipo, 'alta-entropia')
})

test('adjacent snippets are two findings; the order is the position one, not the rules one', () => {
  const pem = `-----BEGIN ${'PRIVATE'} KEY-----`
  const key = `ghp_${repeat(B62, 36)}`
  assert.deepEqual(findLeaks(pem + key).map((x) => x.tipo), ['chave-privada', 'chave-de-api'], 'the second starts where the first ends')
  assert.deepEqual(findLeaks(`ana@exemplo.com${pem}`).map((x) => x.tipo), ['email', 'chave-privada'], 'the finding of the later rule ends where the other starts')
  // the key rule comes before the e-mail one, but the e-mail is earlier in the text
  assert.deepEqual(findLeaks(`ana@exemplo.com e ${key}`).map((x) => x.tipo), ['email', 'chave-de-api'])
})

test('a body given as plain text is not read: only its text fields', () => {
  assert.equal(leakInObject({ corpo: 'ana@exemplo.com' }), null, 'the body itself is not a text field')
})
