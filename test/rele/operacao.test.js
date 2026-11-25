// SPDX-License-Identifier: AGPL-3.0-or-later
// Camada de operação do relé hospedado: origem por proxy, CORS fechado, cabeçalhos de segurança, administração escondida do
// proxy e documento de descoberta. Servidor HTTP de verdade em porta local, relé em memória.
import test from 'node:test'
import assert from 'node:assert/strict'
import { lerOrigens, operar, origemPorProxy } from '../../packages/rele/src/operacao.js'
import { subir, TOKEN } from '../ajuda/servidor-de-teste.js'

const SITE = 'https://rede.exemplo.test'
const DESCOBERTA = () => ({ rede: 'rover-network', formato: 'teste', protocolo: ['0.2'], api: '/v1', info: '/v1/info', demonstracao: true })

async function relé({ proxy = true, origens = [SITE], descoberta = DESCOBERTA, rajada } = {}) {
  const s = await subir({ origemDe: proxy ? origemPorProxy : undefined, ...(rajada ? { rajada } : {}) })
  operar(s.servidor, { origensPermitidas: origens, atrasDeProxy: proxy, descoberta })
  return s
}

test('origemPorProxy: vale o ÚLTIMO endereço de X-Forwarded-For; sem o cabeçalho, a conexão', () => {
  const req = (h, remoto = '10.0.0.9') => ({ headers: h, socket: { remoteAddress: remoto } })
  assert.equal(origemPorProxy(req({ 'x-forwarded-for': '203.0.113.7' })), '203.0.113.7')
  assert.equal(origemPorProxy(req({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' })), '203.0.113.7', 'o que o cliente escreveu antes do proxy não conta')
  assert.equal(origemPorProxy(req({ 'x-forwarded-for': ' 1.1.1.1 ,  203.0.113.7 ' })), '203.0.113.7')
  assert.equal(origemPorProxy(req({})), '10.0.0.9')
  assert.equal(origemPorProxy(req({ 'x-forwarded-for': '' })), '10.0.0.9')
  assert.equal(origemPorProxy(req({ 'x-forwarded-for': 'a'.repeat(64) })), 'a'.repeat(64), '64 caracteres ainda cabem')
  assert.equal(origemPorProxy(req({ 'x-forwarded-for': 'a'.repeat(65) })), '10.0.0.9', 'valor longo demais é ignorado')
  assert.equal(origemPorProxy({ headers: {}, socket: {} }), 'desconhecida')
})

test('lerOrigens: aceita origem de verdade, recusa curinga, caminho e barra no fim, e tira repetidas', () => {
  assert.deepEqual(lerOrigens(''), [])
  assert.deepEqual(lerOrigens(undefined), [])
  assert.deepEqual(lerOrigens(' https://A.exemplo.test , https://a.exemplo.test,http://localhost:3000 '), ['https://a.exemplo.test', 'http://localhost:3000'])
  for (const ruim of ['*', 'https://*.exemplo.test', 'https://x.test/', 'https://x.test/pasta', 'x.test', 'ftp://x.test', 'https://x.test:99999999']) {
    assert.throws(() => lerOrigens(ruim), /origem de CORS inválida/, ruim)
  }
})

test('a rajada é por cliente atrás do proxy: o endereço de um não gasta a ficha de outro', async () => {
  const s = await relé({ rajada: { capacidade: 2, porSegundo: 0.0001 } })
  try {
    const de = (ip) => s.chamar('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': ip } })
    assert.equal((await de('203.0.113.1')).status, 200)
    assert.equal((await de('203.0.113.1')).status, 200)
    const barrado = await de('203.0.113.1')
    assert.equal(barrado.status, 429)
    assert.ok(Number(barrado.cab.get('retry-after')) >= 1)
    assert.equal((await de('203.0.113.2')).status, 200, 'outro cliente tem a rajada dele')
    // escrever um endereço falso ANTES não adianta: vale o último
    assert.equal((await s.chamar('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '198.51.100.9, 203.0.113.1' } })).status, 429)
  } finally { await s.fechar() }
})

test('sem proxy confiável, todo mundo cai no mesmo balde (o comportamento do relé de referência)', async () => {
  const s = await relé({ proxy: false, rajada: { capacidade: 2, porSegundo: 0.0001 } })
  try {
    await s.chamar('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.1' } })
    await s.chamar('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.2' } })
    assert.equal((await s.chamar('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.3' } })).status, 429)
  } finally { await s.fechar() }
})

test('CORS: só a origem listada recebe permissão; as outras não recebem nenhum cabeçalho de CORS', async () => {
  const s = await relé()
  try {
    const bom = await s.chamar('GET', '/v1/info', { cabecalhos: { origin: SITE } })
    assert.equal(bom.status, 200)
    assert.equal(bom.cab.get('access-control-allow-origin'), SITE)
    assert.equal(bom.cab.get('vary'), 'Origin')
    assert.match(bom.cab.get('access-control-expose-headers'), /retry-after/)
    const mau = await s.chamar('GET', '/v1/info', { cabecalhos: { origin: 'https://golpe.exemplo.test' } })
    assert.equal(mau.status, 200, 'quem não é navegador (ou não está na lista) segue lendo o que é público')
    assert.equal(mau.cab.get('access-control-allow-origin'), null)
    assert.equal(mau.cab.get('vary'), 'Origin')
    const sem = await s.chamar('GET', '/v1/info')
    assert.equal(sem.cab.get('access-control-allow-origin'), null)
    const maiuscula = await s.chamar('GET', '/v1/info', { cabecalhos: { origin: SITE.toUpperCase().replace('HTTPS', 'https') } })
    assert.equal(maiuscula.cab.get('access-control-allow-origin'), SITE, 'a comparação ignora caixa e devolve a origem da lista')
  } finally { await s.fechar() }
})

test('CORS: o pré-voo da origem boa recebe 204 com métodos e cabeçalhos; o da origem má leva 403 e não chega ao relé', async () => {
  const s = await relé()
  try {
    const pre = (origin) => s.chamar('OPTIONS', '/v1/objetos', { cabecalhos: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } })
    const bom = await pre(SITE)
    assert.equal(bom.status, 204)
    assert.equal(bom.cab.get('access-control-allow-origin'), SITE)
    assert.equal(bom.cab.get('access-control-allow-methods'), 'GET, POST, OPTIONS')
    assert.match(bom.cab.get('access-control-allow-headers'), /content-type/)
    assert.equal(bom.cab.get('access-control-max-age'), '600')
    const mau = await pre('https://golpe.exemplo.test')
    assert.equal(mau.status, 403)
    assert.equal(mau.json.erro.codigo, 'origem_nao_permitida')
    assert.equal(mau.cab.get('access-control-allow-origin'), null)
    // OPTIONS sem ser pré-voo não ganha tratamento especial: o relé responde como sempre
    assert.equal((await s.chamar('OPTIONS', '/v1/info')).status, 405)
  } finally { await s.fechar() }
})

test('o pré-voo não gasta a rajada', async () => {
  const s = await relé({ rajada: { capacidade: 2, porSegundo: 0.0001 } })
  try {
    for (let i = 0; i < 6; i++) {
      const r = await s.chamar('OPTIONS', '/v1/objetos', { cabecalhos: { origin: SITE, 'access-control-request-method': 'POST', 'x-forwarded-for': '203.0.113.5' } })
      assert.equal(r.status, 204)
    }
    assert.equal((await s.chamar('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.5' } })).status, 200)
  } finally { await s.fechar() }
})

test('com a lista de origens vazia ninguém recebe permissão de CORS', async () => {
  const s = await relé({ origens: [] })
  try {
    const r = await s.chamar('GET', '/v1/info', { cabecalhos: { origin: SITE } })
    assert.equal(r.cab.get('access-control-allow-origin'), null)
    assert.equal(r.cab.get('vary'), null)
    const pre = await s.chamar('OPTIONS', '/v1/info', { cabecalhos: { origin: SITE, 'access-control-request-method': 'GET' } })
    assert.equal(pre.status, 403)
  } finally { await s.fechar() }
})

test('cabeçalhos de segurança em toda resposta; HSTS só atrás do proxy de TLS', async () => {
  const atras = await relé()
  const solto = await relé({ proxy: false })
  try {
    for (const caminho of ['/v1/info', '/v1/nao-existe', '/.well-known/rover-network']) {
      const r = await atras.chamar('GET', caminho)
      assert.equal(r.cab.get('x-content-type-options'), 'nosniff', caminho)
      assert.equal(r.cab.get('referrer-policy'), 'no-referrer', caminho)
      assert.equal(r.cab.get('x-frame-options'), 'DENY', caminho)
      assert.equal(r.cab.get('cross-origin-resource-policy'), 'same-site', caminho)
      assert.match(r.cab.get('permissions-policy'), /camera=\(\)/, caminho)
      assert.match(r.cab.get('content-security-policy'), /default-src 'none'/, caminho)
      assert.equal(r.cab.get('strict-transport-security'), 'max-age=15552000', caminho)
    }
    assert.equal((await solto.chamar('GET', '/v1/info')).cab.get('strict-transport-security'), null)
    assert.equal((await solto.chamar('GET', '/v1/info')).cab.get('x-frame-options'), 'DENY')
  } finally { await atras.fechar(); await solto.fechar() }
})

test('a administração some para quem chega pelo proxy, mesmo com o token certo; direto no contêiner ela responde', async () => {
  const s = await relé()
  try {
    const auth = { authorization: `Bearer ${TOKEN}` }
    for (const caminho of ['/v1/admin/denuncias', '/v1/admin/bloqueios', '/v1/admin', '/v1/admin/denuncias?limite=5']) {
      for (const marca of [{ 'x-forwarded-for': '203.0.113.1' }, { 'x-forwarded-host': 'rede.exemplo.test' }, { 'x-forwarded-proto': 'https' }, { 'x-real-ip': '203.0.113.1' }, { forwarded: 'for=203.0.113.1' }]) {
        const r = await s.chamar('GET', caminho, { cabecalhos: { ...auth, ...marca } })
        assert.equal(r.status, 404, `${caminho} ${Object.keys(marca)[0]}`)
        assert.equal(r.json.erro.codigo, 'nao_encontrado')
      }
    }
    const direto = await s.chamar('GET', '/v1/admin/denuncias', { cabecalhos: auth })
    assert.equal(direto.status, 200, 'sem marca de proxy, o token vale')
    assert.deepEqual(direto.json, { denuncias: [] })
    assert.equal((await s.chamar('GET', '/v1/admin/denuncias')).status, 401, 'direto e sem token continua 401')
    // só a administração é escondida
    assert.equal((await s.chamar('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.1' } })).status, 200)
  } finally { await s.fechar() }
})

test('descoberta: GET e HEAD respondem o documento; outros métodos levam 405; sem a função a rota não existe', async () => {
  const s = await relé()
  const sem = await relé({ descoberta: null })
  try {
    const r = await s.chamar('GET', '/.well-known/rover-network?x=1')
    assert.equal(r.status, 200)
    assert.deepEqual(r.json, DESCOBERTA())
    assert.equal(r.cab.get('cache-control'), 'public, max-age=300')
    assert.equal(r.cab.get('content-type'), 'application/json; charset=utf-8')
    const h = await s.chamar('HEAD', '/.well-known/rover-network')
    assert.equal(h.status, 200)
    assert.equal(h.texto, '')
    assert.ok(Number(h.cab.get('content-length')) > 0)
    const p = await s.chamar('POST', '/.well-known/rover-network', { corpo: {} })
    assert.equal(p.status, 405)
    assert.equal(p.cab.get('allow'), 'GET, HEAD')
    assert.equal((await sem.chamar('GET', '/.well-known/rover-network')).status, 404)
  } finally { await s.fechar(); await sem.fechar() }
})

test('o log do relé não recebe endereço, origem nem cabeçalho de quem chama', async () => {
  const s = await relé()
  try {
    await s.chamar('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.77', origin: SITE, 'user-agent': 'agente-secreto-xyz' } })
    await s.chamar('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '203.0.113.77' } })
    const todo = JSON.stringify(s.logs)
    assert.ok(s.logs.length >= 1, "o relé registrou o pedido de /v1/info")
    for (const proibido of ['203.0.113.77', SITE, 'agente-secreto-xyz', TOKEN]) assert.ok(!todo.includes(proibido), `o log não pode conter ${proibido}`)
  } finally { await s.fechar() }
})

test('sem opções, operar não presume proxy: nada de HSTS, administração não é escondida, sem CORS e sem descoberta', async () => {
  const s = await subir()
  operar(s.servidor)
  try {
    const r = await s.chamar('GET', '/v1/info', { cabecalhos: { origin: SITE, 'x-forwarded-for': '203.0.113.1' } })
    assert.equal(r.status, 200)
    assert.equal(r.cab.get('strict-transport-security'), null)
    assert.equal(r.cab.get('access-control-allow-origin'), null)
    assert.equal(r.cab.get('x-frame-options'), 'DENY')
    assert.equal((await s.chamar('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '203.0.113.1' } })).status, 200)
    assert.equal((await s.chamar('GET', '/.well-known/rover-network')).status, 404)
  } finally { await s.fechar() }
})

test('só OPTIONS com Origin e Access-Control-Request-Method é pré-voo: GET com esses cabeçalhos segue para o relé, e OPTIONS sem eles também', async () => {
  const s = await relé()
  try {
    const get = await s.chamar('GET', '/v1/info', { cabecalhos: { origin: SITE, 'access-control-request-method': 'POST' } })
    assert.equal(get.status, 200)
    assert.equal(get.json.protocolo.includes('0.2'), true, 'quem respondeu foi o relé, não o atalho do pré-voo')
    const semMetodo = await s.chamar('OPTIONS', '/v1/info', { cabecalhos: { origin: SITE } })
    assert.equal(semMetodo.status, 405, 'OPTIONS com Origin mas sem o método pedido não é pré-voo')
    const semOrigem = await s.chamar('OPTIONS', '/v1/info', { cabecalhos: { 'access-control-request-method': 'POST' } })
    assert.equal(semOrigem.status, 405, 'e sem Origin também não')
  } finally { await s.fechar() }
})

test('a consulta (?...) não entra na decisão de rota: administração e descoberta com query seguem as mesmas regras', async () => {
  const s = await relé()
  try {
    const marca = { 'x-forwarded-for': '203.0.113.1' }
    assert.equal((await s.chamar('GET', '/v1/admin/denuncias?limite=1', { cabecalhos: { ...marca, authorization: `Bearer ${TOKEN}` } })).status, 404)
    assert.equal((await s.chamar('GET', '/.well-known/rover-network?v=1')).status, 200)
    assert.equal((await s.chamar('GET', '/v1/info?/v1/admin/x=1')).status, 200, 'texto de rota dentro da consulta não vira rota')
    assert.equal((await s.chamar('GET', '/v1/infox?/.well-known/rover-network')).status, 404)
  } finally { await s.fechar() }
})
