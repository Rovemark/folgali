// SPDX-License-Identifier: AGPL-3.0-or-later
// Operations layer of the hosted relay: origin behind a proxy, closed CORS, security headers, administration hidden from the
// proxy, and the discovery document. A real HTTP server on a local port, in-memory relay.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readOrigins, operate, proxyOrigin, relayOriginFrom } from '../../packages/relay/src/operations.js'
import { start, TOKEN } from '../helpers/test-server.js'

const SITE = 'https://rede.exemplo.test'
const DISCOVERY = () => ({ rede: 'rover-network', formato: 'teste', protocolo: ['0.2'], api: '/v1', info: '/v1/info', demonstracao: true })

async function relé({ proxy = true, origins = [SITE], descoberta: discovery = DISCOVERY, rajada: burst } = {}) {
  const s = await start({ origemDe: proxy ? proxyOrigin : undefined, ...(burst ? { rajada: burst } : {}) })
  operate(s.servidor, { allowedOrigins: origins, behindProxy: proxy, descoberta: discovery })
  return s
}

test('proxyOrigin: the LAST X-Forwarded-For address counts; without the header, the connection', () => {
  const req = (h, remote = '10.0.0.9') => ({ headers: h, socket: { remoteAddress: remote } })
  assert.equal(proxyOrigin(req({ 'x-forwarded-for': '203.0.113.7' })), '203.0.113.7')
  assert.equal(proxyOrigin(req({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' })), '203.0.113.7', 'what the client wrote before the proxy does not count')
  assert.equal(proxyOrigin(req({ 'x-forwarded-for': ' 1.1.1.1 ,  203.0.113.7 ' })), '203.0.113.7')
  assert.equal(proxyOrigin(req({})), '10.0.0.9')
  assert.equal(proxyOrigin(req({ 'x-forwarded-for': '' })), '10.0.0.9')
  assert.equal(proxyOrigin(req({ 'x-forwarded-for': 'a'.repeat(64) })), 'a'.repeat(64), '64 characters still fit')
  assert.equal(proxyOrigin(req({ 'x-forwarded-for': 'a'.repeat(65) })), '10.0.0.9', 'a value that is too long is ignored')
  assert.equal(proxyOrigin({ headers: {}, socket: {} }), 'desconhecida')
})

test('relayOriginFrom: without proxy, nothing; with proxy, the last X-Forwarded-For; with Cloudflare, the Cf-Connecting-Ip coming from the edge, and IPv6 by /64', () => {
  const req = (h, remote = '10.0.1.18') => ({ headers: h, socket: { remoteAddress: remote } })
  assert.equal(relayOriginFrom({}), null)
  assert.equal(relayOriginFrom({ RELAY_TRUST_PROXY: 'nao' }), null)
  assert.equal(relayOriginFrom({ RELAY_TRUST_PROXY: 'sim' }), proxyOrigin)
  assert.equal(relayOriginFrom({ RELAY_TRUST_PROXY: 'sim', RELAY_CLOUDFLARE: 'nao' }), proxyOrigin)
  assert.throws(() => relayOriginFrom({ RELAY_CLOUDFLARE: 'sim' }), /RELAY_TRUST_PROXY=sim/)
  assert.throws(() => relayOriginFrom({ RELAY_TRUST_PROXY: 'sim', RELAY_CLOUDFLARE: 'talvez' }), /RELAY_CLOUDFLARE aceita/)
  const cf = relayOriginFrom({ RELAY_TRUST_PROXY: 'sim', RELAY_CLOUDFLARE: 'sim' })
  assert.equal(cf(req({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': '203.0.113.9' })), '203.0.113.9')
  assert.equal(cf(req({ 'x-forwarded-for': '198.51.100.66', 'cf-connecting-ip': '203.0.113.9' })), '198.51.100.66', 'forged: it did not come from Cloudflare')
  assert.equal(cf(req({ 'x-forwarded-for': '172.64.222.179' })), '172.64.222.179', 'without the header, the edge')
  assert.equal(cf(req({ 'x-forwarded-for': '2606:4700::1', 'cf-connecting-ip': '2001:db8:1:2:aaaa::9' })), '2001:db8:1:2::/64')
  assert.equal(cf(req({ 'x-forwarded-for': '2001:db8:1:2::77', 'cf-connecting-ip': '203.0.113.9' })), '2001:db8:1:2::/64', 'direct IPv6 also by /64')
  assert.equal(cf(req({})), '10.0.1.18')
  assert.equal(cf({ headers: {}, socket: {} }), 'desconhecida')
  const own = relayOriginFrom({ RELAY_TRUST_PROXY: 'sim', RELAY_CLOUDFLARE: 'sim', RELAY_CLOUDFLARE_RANGES: '198.51.100.0/24' })
  assert.equal(own(req({ 'x-forwarded-for': '198.51.100.66', 'cf-connecting-ip': '203.0.113.9' })), '203.0.113.9')
  assert.equal(own(req({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': '203.0.113.9' })), '172.64.222.179')
})

test('behind Cloudflare, the burst is per visitor: two visitors on the same edge do not share the bucket, and a forged header does not help', async () => {
  const s = await start({ origemDe: relayOriginFrom({ RELAY_TRUST_PROXY: 'sim', RELAY_CLOUDFLARE: 'sim' }), rajada: { capacity: 2, perSecond: 0.0001 } })
  operate(s.servidor, { allowedOrigins: [SITE], behindProxy: true, descoberta: DISCOVERY })
  try {
    const via = (edge, visitor) => s.call('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': edge, ...(visitor ? { 'cf-connecting-ip': visitor } : {}) } })
    assert.equal((await via('172.64.222.179', '203.0.113.1')).status, 200)
    assert.equal((await via('172.64.222.179', '203.0.113.1')).status, 200)
    assert.equal((await via('172.64.222.179', '203.0.113.1')).status, 429)
    assert.equal((await via('172.64.222.179', '203.0.113.2')).status, 200, 'another visitor on the SAME edge has their own burst')
    assert.equal((await via('104.16.0.1', '203.0.113.1')).status, 429, 'the same visitor through another edge stays blocked')
    // straight to the server, faking the Cf-Connecting-Ip of a new visitor: the real address of the caller counts
    assert.equal((await via('198.51.100.66', '203.0.113.50')).status, 200)
    assert.equal((await via('198.51.100.66', '203.0.113.51')).status, 200)
    assert.equal((await via('198.51.100.66', '203.0.113.52')).status, 429, 'changing the forged header does not give a new token')
    // IPv6: the same /64 is a single visitor
    assert.equal((await via('2606:4700::1', '2001:db8:9:9::1')).status, 200)
    assert.equal((await via('2606:4700::1', '2001:db8:9:9::2')).status, 200)
    assert.equal((await via('2606:4700::1', '2001:db8:9:9::3')).status, 429)
  } finally { await s.fechar() }
})

test('readOrigins: accepts a real origin, refuses wildcard, path and trailing slash, and drops duplicates', () => {
  assert.deepEqual(readOrigins(''), [])
  assert.deepEqual(readOrigins(undefined), [])
  assert.deepEqual(readOrigins(' https://A.exemplo.test , https://a.exemplo.test,http://localhost:3000 '), ['https://a.exemplo.test', 'http://localhost:3000'])
  for (const bad of ['*', 'https://*.exemplo.test', 'https://x.test/', 'https://x.test/pasta', 'x.test', 'ftp://x.test', 'https://x.test:99999999']) {
    assert.throws(() => readOrigins(bad), /origem de CORS inválida/, bad)
  }
})

test('the burst is per client behind the proxy: one address does not spend the token of another', async () => {
  const s = await relé({ rajada: { capacity: 2, perSecond: 0.0001 } })
  try {
    const from = (ip) => s.call('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': ip } })
    assert.equal((await from('203.0.113.1')).status, 200)
    assert.equal((await from('203.0.113.1')).status, 200)
    const blocked = await from('203.0.113.1')
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.cab.get('retry-after')) >= 1)
    assert.equal((await from('203.0.113.2')).status, 200, 'another client has their own burst')
    // writing a fake address BEFORE does not help: the last one counts
    assert.equal((await s.call('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '198.51.100.9, 203.0.113.1' } })).status, 429)
  } finally { await s.fechar() }
})

test('without a trusted proxy, everyone falls into the same bucket (the behavior of the reference relay)', async () => {
  const s = await relé({ proxy: false, rajada: { capacity: 2, perSecond: 0.0001 } })
  try {
    await s.call('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.1' } })
    await s.call('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.2' } })
    assert.equal((await s.call('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.3' } })).status, 429)
  } finally { await s.fechar() }
})

test('CORS: only the listed origin gets permission; the others get no CORS header', async () => {
  const s = await relé()
  try {
    const good = await s.call('GET', '/v1/info', { cabecalhos: { origin: SITE } })
    assert.equal(good.status, 200)
    assert.equal(good.cab.get('access-control-allow-origin'), SITE)
    assert.equal(good.cab.get('vary'), 'Origin')
    assert.match(good.cab.get('access-control-expose-headers'), /retry-after/)
    const bad = await s.call('GET', '/v1/info', { cabecalhos: { origin: 'https://golpe.exemplo.test' } })
    assert.equal(bad.status, 200, 'anyone who is not a browser (or is not on the list) still reads what is public')
    assert.equal(bad.cab.get('access-control-allow-origin'), null)
    assert.equal(bad.cab.get('vary'), 'Origin')
    const without = await s.call('GET', '/v1/info')
    assert.equal(without.cab.get('access-control-allow-origin'), null)
    const uppercase = await s.call('GET', '/v1/info', { cabecalhos: { origin: SITE.toUpperCase().replace('HTTPS', 'https') } })
    assert.equal(uppercase.cab.get('access-control-allow-origin'), SITE, 'the comparison ignores case and returns the origin from the list')
  } finally { await s.fechar() }
})

test('CORS: the preflight from a good origin gets 204 with methods and headers; the one from a bad origin gets 403 and never reaches the relay', async () => {
  const s = await relé()
  try {
    const pre = (origin) => s.call('OPTIONS', '/v1/objetos', { cabecalhos: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } })
    const good = await pre(SITE)
    assert.equal(good.status, 204)
    assert.equal(good.cab.get('access-control-allow-origin'), SITE)
    assert.equal(good.cab.get('access-control-allow-methods'), 'GET, POST, OPTIONS')
    assert.match(good.cab.get('access-control-allow-headers'), /content-type/)
    assert.equal(good.cab.get('access-control-max-age'), '600')
    const bad = await pre('https://golpe.exemplo.test')
    assert.equal(bad.status, 403)
    assert.equal(bad.json.erro.codigo, 'origem_nao_permitida')
    assert.equal(bad.cab.get('access-control-allow-origin'), null)
    // OPTIONS that is not a preflight gets no special treatment: the relay answers as usual
    assert.equal((await s.call('OPTIONS', '/v1/info')).status, 405)
  } finally { await s.fechar() }
})

test('the preflight does not spend the burst', async () => {
  const s = await relé({ rajada: { capacity: 2, perSecond: 0.0001 } })
  try {
    for (let i = 0; i < 6; i++) {
      const r = await s.call('OPTIONS', '/v1/objetos', { cabecalhos: { origin: SITE, 'access-control-request-method': 'POST', 'x-forwarded-for': '203.0.113.5' } })
      assert.equal(r.status, 204)
    }
    assert.equal((await s.call('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.5' } })).status, 200)
  } finally { await s.fechar() }
})

test('with an empty origin list nobody gets CORS permission', async () => {
  const s = await relé({ origins: [] })
  try {
    const r = await s.call('GET', '/v1/info', { cabecalhos: { origin: SITE } })
    assert.equal(r.cab.get('access-control-allow-origin'), null)
    assert.equal(r.cab.get('vary'), null)
    const pre = await s.call('OPTIONS', '/v1/info', { cabecalhos: { origin: SITE, 'access-control-request-method': 'GET' } })
    assert.equal(pre.status, 403)
  } finally { await s.fechar() }
})

test('security headers on every response; HSTS only behind the TLS proxy', async () => {
  const behind = await relé()
  const loose = await relé({ proxy: false })
  try {
    for (const path of ['/v1/info', '/v1/nao-existe', '/.well-known/rover-network']) {
      const r = await behind.call('GET', path)
      assert.equal(r.cab.get('x-content-type-options'), 'nosniff', path)
      assert.equal(r.cab.get('referrer-policy'), 'no-referrer', path)
      assert.equal(r.cab.get('x-frame-options'), 'DENY', path)
      assert.equal(r.cab.get('cross-origin-resource-policy'), 'same-site', path)
      assert.match(r.cab.get('permissions-policy'), /camera=\(\)/, path)
      assert.match(r.cab.get('content-security-policy'), /default-src 'none'/, path)
      assert.equal(r.cab.get('strict-transport-security'), 'max-age=15552000', path)
    }
    assert.equal((await loose.call('GET', '/v1/info')).cab.get('strict-transport-security'), null)
    assert.equal((await loose.call('GET', '/v1/info')).cab.get('x-frame-options'), 'DENY')
  } finally { await behind.fechar(); await loose.fechar() }
})

test('administration disappears for anyone coming through the proxy, even with the right token; straight to the container it answers', async () => {
  const s = await relé()
  try {
    const auth = { authorization: `Bearer ${TOKEN}` }
    for (const path of ['/v1/admin/denuncias', '/v1/admin/bloqueios', '/v1/admin', '/v1/admin/denuncias?limite=5']) {
      for (const brand of [{ 'x-forwarded-for': '203.0.113.1' }, { 'x-forwarded-host': 'rede.exemplo.test' }, { 'x-forwarded-proto': 'https' }, { 'x-real-ip': '203.0.113.1' }, { forwarded: 'for=203.0.113.1' }]) {
        const r = await s.call('GET', path, { cabecalhos: { ...auth, ...brand } })
        assert.equal(r.status, 404, `${path} ${Object.keys(brand)[0]}`)
        assert.equal(r.json.erro.codigo, 'nao_encontrado')
      }
    }
    const direct = await s.call('GET', '/v1/admin/denuncias', { cabecalhos: auth })
    assert.equal(direct.status, 200, 'without a proxy mark, the token works')
    assert.deepEqual(direct.json, { denuncias: [] })
    assert.equal((await s.call('GET', '/v1/admin/denuncias')).status, 401, 'direct and without a token it is still 401')
    // only the administration is hidden
    assert.equal((await s.call('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.1' } })).status, 200)
  } finally { await s.fechar() }
})

test('discovery: GET and HEAD answer with the document; other methods get 405; without the function the route does not exist', async () => {
  const s = await relé()
  const without = await relé({ descoberta: null })
  try {
    const r = await s.call('GET', '/.well-known/rover-network?x=1')
    assert.equal(r.status, 200)
    assert.deepEqual(r.json, DISCOVERY())
    assert.equal(r.cab.get('cache-control'), 'public, max-age=300')
    assert.equal(r.cab.get('content-type'), 'application/json; charset=utf-8')
    const h = await s.call('HEAD', '/.well-known/rover-network')
    assert.equal(h.status, 200)
    assert.equal(h.texto, '')
    assert.ok(Number(h.cab.get('content-length')) > 0)
    const p = await s.call('POST', '/.well-known/rover-network', { corpo: {} })
    assert.equal(p.status, 405)
    assert.equal(p.cab.get('allow'), 'GET, HEAD')
    assert.equal((await without.call('GET', '/.well-known/rover-network')).status, 404)
  } finally { await s.fechar(); await without.fechar() }
})

test('the relay log does not receive the address, origin or headers of the caller', async () => {
  const s = await relé()
  try {
    await s.call('GET', '/v1/info', { cabecalhos: { 'x-forwarded-for': '203.0.113.77', origin: SITE, 'user-agent': 'agente-secreto-xyz' } })
    await s.call('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '203.0.113.77' } })
    const all = JSON.stringify(s.logs)
    assert.ok(s.logs.length >= 1, "the relay logged the /v1/info request")
    for (const forbidden of ['203.0.113.77', SITE, 'agente-secreto-xyz', TOKEN]) assert.ok(!all.includes(forbidden), `the log must not contain ${forbidden}`)
  } finally { await s.fechar() }
})

test('without options, operating does not assume a proxy: no HSTS, administration is not hidden, no CORS and no discovery', async () => {
  const s = await start()
  operate(s.servidor)
  try {
    const r = await s.call('GET', '/v1/info', { cabecalhos: { origin: SITE, 'x-forwarded-for': '203.0.113.1' } })
    assert.equal(r.status, 200)
    assert.equal(r.cab.get('strict-transport-security'), null)
    assert.equal(r.cab.get('access-control-allow-origin'), null)
    assert.equal(r.cab.get('x-frame-options'), 'DENY')
    assert.equal((await s.call('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '203.0.113.1' } })).status, 200)
    assert.equal((await s.call('GET', '/.well-known/rover-network')).status, 404)
  } finally { await s.fechar() }
})

test('only OPTIONS with Origin and Access-Control-Request-Method is a preflight: GET with those headers goes to the relay, and so does OPTIONS without them', async () => {
  const s = await relé()
  try {
    const get = await s.call('GET', '/v1/info', { cabecalhos: { origin: SITE, 'access-control-request-method': 'POST' } })
    assert.equal(get.status, 200)
    assert.equal(get.json.protocolo.includes('0.2'), true, 'the relay answered, not the preflight shortcut')
    const withoutMethod = await s.call('OPTIONS', '/v1/info', { cabecalhos: { origin: SITE } })
    assert.equal(withoutMethod.status, 405, 'OPTIONS with Origin but without the requested method is not a preflight')
    const withoutOrigin = await s.call('OPTIONS', '/v1/info', { cabecalhos: { 'access-control-request-method': 'POST' } })
    assert.equal(withoutOrigin.status, 405, 'and without Origin it is not either')
  } finally { await s.fechar() }
})

test('the query string (?...) does not take part in the route decision: administration and discovery with a query follow the same rules', async () => {
  const s = await relé()
  try {
    const brand = { 'x-forwarded-for': '203.0.113.1' }
    assert.equal((await s.call('GET', '/v1/admin/denuncias?limite=1', { cabecalhos: { ...brand, authorization: `Bearer ${TOKEN}` } })).status, 404)
    assert.equal((await s.call('GET', '/.well-known/rover-network?v=1')).status, 200)
    assert.equal((await s.call('GET', '/v1/info?/v1/admin/x=1')).status, 200, 'route text inside the query string does not become a route')
    assert.equal((await s.call('GET', '/v1/infox?/.well-known/rover-network')).status, 404)
  } finally { await s.fechar() }
})
