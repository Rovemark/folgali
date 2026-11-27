// SPDX-License-Identifier: AGPL-3.0-or-later
// The proxy rule (operations.js: administration disappears for whoever arrives through the proxy) and the route table (http.js) must read the
// SAME path. Before this, the rule looked at the raw `req.url` and the table at the path normalized by `new URL()`, so `/v1/./admin/...`,
// `/v1/%2e/admin/...` and `/v1/x/../admin/...` reached the admin routes from the proxy (F-04 of the security review). Now a path that
// changes on normalization is no route, and the hidden admin answers exactly like a route that does not exist.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import net from 'node:net'
import { Store } from '../../packages/relay/src/store.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { TestProvider } from '../../packages/relay/src/test-provider.js'
import { createRelayServer, requestPath } from '../../packages/relay/src/http.js'
import { operate } from '../../packages/relay/src/operations.js'

const TOKEN = randomBytes(32).toString('base64url')

async function start({ behindProxy = true } = {}) {
  const relay = new Relay({ store: new Store(':memory:'), provedor: new TestProvider(), reportSecret: randomBytes(32) })
  const server = operate(createRelayServer({ rele: relay, tokenAdmin: TOKEN, registrar: () => {}, rajada: { capacity: 100000, perSecond: 100000 } }), { behindProxy })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  return server
}

/** A raw request (no client library normalizes the path on the way). Returns status, headers (without `date`) and body. */
const raw = (server, path, { auth = false, proxy = true, method = 'GET' } = {}) => new Promise((ok, fail) => {
  const s = net.connect(server.address().port, '127.0.0.1', () => s.write(
    `${method} ${path} HTTP/1.1\r\nHost: x\r\n${proxy ? 'X-Forwarded-For: 203.0.113.9\r\n' : ''}${auth ? `Authorization: Bearer ${TOKEN}\r\n` : ''}Connection: close\r\n\r\n`
  ))
  let b = ''
  s.on('data', (d) => (b += d))
  s.on('error', fail)
  s.on('end', () => {
    const [head, ...rest] = b.split('\r\n\r\n')
    const [line, ...headers] = head.split('\r\n')
    ok({
      status: Number(line.split(' ')[1]),
      headers: Object.fromEntries(headers.map((h) => [h.slice(0, h.indexOf(':')).toLowerCase(), h.slice(h.indexOf(':') + 1).trim()]).filter(([k]) => k !== 'date')),
      body: rest.join('\r\n\r\n')
    })
  })
})

const TRICKS = ['/v1/./admin/denuncias', '/v1/%2e/admin/denuncias', '/v1/%2E/admin/denuncias', '/v1/x/../admin/denuncias', '/v1/x/%2e%2e/admin/denuncias',
  '/v1//admin/denuncias', '/v1/admin//denuncias', '/v1%2fadmin/denuncias', '/v1/admin%2Fdenuncias', '/v1\\admin\\denuncias', '/v1/admin/./denuncias', '//relay.local/v1/admin/denuncias']

test('F-04: behind the proxy no dot segment, encoded slash or double slash reaches administration, with or without the token', async () => {
  const server = await start()
  try {
    for (const p of ['/v1/admin/denuncias', ...TRICKS]) {
      for (const auth of [false, true]) {
        const r = await raw(server, p, { auth })
        assert.equal(r.status, 404, `${p} auth=${auth}`)
        assert.match(r.body, /"codigo":"nao_encontrado"/, p)
      }
    }
  } finally { server.close() }
})

test('F-04: the hidden administration answers exactly like a route that does not exist (status, headers and body)', async () => {
  const server = await start()
  try {
    const unknown = await raw(server, '/v1/nao-existe', { auth: true })
    for (const p of ['/v1/admin/denuncias', '/v1/admin', ...TRICKS]) {
      for (const method of ['GET', 'POST', 'DELETE']) {
        const r = await raw(server, p, { auth: true, method })
        assert.deepEqual(r, unknown, `${method} ${p}`)
      }
    }
  } finally { server.close() }
})

test('F-04: talking to the container directly, administration still works on the canonical path only', async () => {
  const server = await start()
  try {
    assert.equal((await raw(server, '/v1/admin/denuncias', { auth: true, proxy: false })).status, 200)
    assert.equal((await raw(server, '/v1/admin/denuncias', { auth: false, proxy: false })).status, 401)
    for (const p of TRICKS) assert.equal((await raw(server, p, { auth: true, proxy: false })).status, 404, p)
    // ordinary routes are untouched, with a query string too
    assert.equal((await raw(server, '/v1/info')).status, 200)
    assert.equal((await raw(server, '/v1/postagens?limite=5')).status, 200)
  } finally { server.close() }
})

test('requestPath: one canonical form, null for anything that normalizes', () => {
  assert.equal(requestPath('/v1/info'), '/v1/info')
  assert.equal(requestPath('/v1/buscar?q=http://x//y/../z'), '/v1/buscar')
  assert.equal(requestPath('/v1/rovers/handle/pipa.um'), '/v1/rovers/handle/pipa.um')
  for (const p of [...TRICKS, '', 'v1/info', 'http://relay.local/v1/info', '/v1/..', '/v1/.', '/v1/a b']) assert.equal(requestPath(p), null, p)
})
