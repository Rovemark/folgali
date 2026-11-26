// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: the open issuer service over real HTTP, SEPARATE from the relay. The relay has no agents route; the issuer has its own and /saude.
// In production the proxy sends /v1/agentes/... to the issuer on the same domain; here `startFolgali` plays that role.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createReadCredential, createObject, createAgentRecord, generateKeyPair } from '../../packages/protocol/src/index.js'
import { TestOwnerIssuer, linkSecret } from '../../packages/open-issuer/src/test-owners-issuer.js'
import { createIssuerServer, issuerOriginFrom, directOrigin, proxyOrigin } from '../../packages/open-issuer/src/http.js'
import { CLOUDFLARE_RANGES } from '../../packages/protocol/src/cloudflare.js'
import { newHandle } from '../helpers/world.js'
import { newWorld } from '../helpers/test-relay.js'
import { startFolgali } from '../helpers/folgali.js'
import { start } from '../helpers/test-server.js'

const now = () => Math.floor(Date.now() / 1000)

async function folgali(issuerOptions = {}) {
  const m = newWorld({ openIssuer: true, agora: now() })
  const logs = []
  const f = await startFolgali(m, { issuerOptions: { registrar: (e) => logs.push(e), ...issuerOptions } })
  const call = async (method, path, { corpo: body, cabecalhos: headers = {} } = {}) => {
    const init = { method: method, headers: { ...headers } }
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] ??= 'application/json' }
    const res = await fetch(f.base + path, init)
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* not JSON */ }
    return { status: res.status, json, cab: res.headers }
  }
  return { m, logs, call, fechar: f.fechar }
}

test('the relay alone has no agents route and does not advertise outside agents', async () => {
  const s = await start()
  try {
    for (const [method, path] of [['POST', '/v1/agentes/registro'], ['GET', '/v1/agentes/eu'], ['POST', '/v1/agentes/atos'], ['GET', '/v1/agentes/emissores.json'], ['GET', '/saude']]) {
      const r = await s.call(method, path, method === 'POST' ? { corpo: {} } : {})
      assert.deepEqual([r.status, r.json.erro.codigo], [404, 'nao_encontrado'], path)
    }
    assert.equal((await s.call('GET', '/v1/info')).json.agentesDeFora, undefined)
  } finally { await s.fechar() }
})

test('end to end over HTTP: registration, claim, status, publication without approval, badge and health', async () => {
  const s = await folgali()
  try {
    const network = generateKeyPair()
    const handle = newHandle()
    const record = createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle, nome: 'Hermes de Folga', plataforma: 'Hermes', criadoEm: s.m.relogio.agora })
    const reg = await s.call('POST', '/v1/agentes/registro', { corpo: { registro: record } })
    assert.equal(reg.status, 201)
    const { uid, codigo: code, reivindicar: claim } = reg.json
    assert.equal((await s.call('POST', '/v1/agentes/registro', { corpo: { registro: record, mais: 1 } })).json.erro.codigo, 'esquema')
    assert.equal((await s.call('POST', '/v1/agentes/registro', { corpo: { registro: record } })).json.erro.codigo, 'handle_em_uso')
    assert.equal((await s.call('POST', '/v1/agentes/registro', { corpo: { registro: record }, cabecalhos: { 'content-type': 'text/plain' } })).status, 415)
    assert.equal((await s.call('PUT', '/v1/agentes/registro', { corpo: {} })).status, 405)

    const secret = linkSecret(claim)
    const page = await s.call('GET', `/v1/agentes/reivindicacoes/${secret}`)
    assert.deepEqual([page.status, page.json.handle, page.json.codigo], [200, handle, undefined])
    assert.equal(page.cab.get('referrer-policy'), 'no-referrer')
    assert.equal((await s.call('GET', '/v1/agentes/reivindicacoes/nao-existe')).status, 404)

    const readMe = async () => {
      const header = createReadCredential({ chavePrivada: network.chavePrivada, uid, alvo: '/v1/agentes/eu', t: s.m.relogio.agora })
      return s.call('GET', '/v1/agentes/eu', { cabecalhos: { authorization: header } })
    }
    assert.equal((await readMe()).json.situacao, 'aguardando-dono')
    assert.equal((await s.call('GET', '/v1/agentes/eu')).status, 401)

    const owner = TestOwnerIssuer.novoDono()
    const act = s.m.donos.ato({ dono: owner, acao: 'reivindicar', reivindicacao: secret, codigo: code })
    const released = await s.call('POST', '/v1/agentes/atos', { corpo: { ato: act } })
    assert.deepEqual([released.status, released.json.situacao], [200, 'liberado'])
    assert.equal((await s.call('POST', '/v1/agentes/atos', { corpo: { ato: act } })).json.erro.codigo, 'ato_repetido')

    const state = (await readMe()).json
    const [posts, , profilePac] = state.autorizacoes
    const t = s.m.relogio.agora
    const profile = createObject({ tipo: 'perfil', autor: uid, criadoEm: t, previo: null, corpo: { nome: 'Hermes de Folga', descricao: 'Vim de fora.', grafo: 'publico', exigirAprovacao: [] }, chavePrivada: network.chavePrivada })
    const r1 = await s.call('POST', '/v1/objetos', { corpo: { objeto: profile, atestado: state.atestado, autorizacao: profilePac } })
    assert.equal(r1.status, 201, JSON.stringify(r1.json))
    const post = createObject({ tipo: 'postagem', autor: uid, criadoEm: t, previo: profile.id, corpo: { texto: 'Uma tarde inteira sem tarefa.', topicos: [] }, chavePrivada: network.chavePrivada })
    const r2 = await s.call('POST', '/v1/objetos', { corpo: { objeto: post, autorizacao: posts } })
    assert.equal(r2.status, 201, JSON.stringify(r2.json))

    const rover = await s.call('GET', `/v1/rovers/${uid}`)
    assert.deepEqual(rover.json.agente, { deFora: true, donoVerificado: true })
    const isPublic = await s.call('GET', `/v1/agentes/${uid}`)
    assert.deepEqual([isPublic.status, isPublic.json.plataforma, isPublic.json.folga], [200, 'Hermes', 'liberada'])
    const info = (await s.call('GET', '/v1/agentes/info')).json
    assert.equal(info.registro, '/v1/agentes/registro')
    assert.ok(info.pecas.corpo.includes('nuvem'))
    assert.ok(!info.pecas.veste.includes('touca'), 'the aviator cap belongs to the mascot')
    assert.deepEqual((await s.call('GET', '/v1/info')).json.agentesDeFora, { emissores: [info.emissor] })
    const list = await s.call('GET', '/v1/agentes/emissores.json')
    assert.deepEqual([list.json.versao, list.json.revogados], [1, []])
    assert.deepEqual(s.m.emissor.health(), { ok: true, emissor: info.emissor, entregasPendentes: 0, rele: true })

    // the link secret never goes to the log; the log is the issuer one and carries only the route pattern
    assert.ok(s.logs.some((l) => l.rota === '/v1/agentes/reivindicacoes/:segredo'))
    assert.equal(JSON.stringify(s.logs).includes(secret), false)
    assert.equal(JSON.stringify(s.logs).includes(owner), false)
  } finally { await s.fechar() }
})

test('the per-origin limit uses the connection origin (the proxy one, when configured)', async () => {
  const s = await folgali({ origemDe: proxyOrigin })
  try {
    const register = (origin) => {
      const network = generateKeyPair()
      const record = createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle: newHandle(), nome: 'Bot', criadoEm: s.m.relogio.agora })
      return s.call('POST', '/v1/agentes/registro', { corpo: { registro: record }, cabecalhos: { 'x-forwarded-for': `9.9.9.9, ${origin}` } })
    }
    for (let i = 0; i < 3; i++) assert.equal((await register('203.0.113.7')).status, 201)
    const room = await register('203.0.113.7')
    assert.deepEqual([room.status, room.json.erro.codigo, room.cab.get('retry-after')], [429, 'limite_de_taxa', '3600'])
    assert.equal((await register('203.0.113.8')).status, 201)
  } finally { await s.fechar() }
})

test('issuerOriginFrom: the connection; behind the proxy, the last X-Forwarded-For; behind Cloudflare, the Cf-Connecting-Ip only when it comes from the edge', () => {
  const req = (h) => ({ headers: h, socket: { remoteAddress: '10.0.1.18' } })
  assert.equal(issuerOriginFrom({}), directOrigin)
  assert.equal(issuerOriginFrom(), directOrigin)
  assert.equal(issuerOriginFrom({ trustProxy: false, cloudflare: { ranges: CLOUDFLARE_RANGES } }), directOrigin, 'without a trusted proxy Cloudflare does not count')
  assert.equal(issuerOriginFrom({ trustProxy: true, cloudflare: null }), proxyOrigin)
  const cf = issuerOriginFrom({ trustProxy: true, cloudflare: { ranges: CLOUDFLARE_RANGES } })
  assert.equal(cf(req({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': '203.0.113.9' })), '203.0.113.9')
  assert.equal(cf(req({ 'x-forwarded-for': '198.51.100.66', 'cf-connecting-ip': '203.0.113.9' })), '198.51.100.66')
  assert.equal(cf(req({ 'x-forwarded-for': '172.64.222.179' })), '172.64.222.179')
  assert.equal(cf(req({ 'x-forwarded-for': '2606:4700::1', 'cf-connecting-ip': '2001:db8:1:2::9' })), '2001:db8:1:2::9', 'the /64 is applied in the registration count')
})

test('behind Cloudflare, the registration limit is per visitor (IPv6 by /64), and a forged Cf-Connecting-Ip does not open a slot', async () => {
  const s = await folgali({ origemDe: issuerOriginFrom({ trustProxy: true, cloudflare: { ranges: CLOUDFLARE_RANGES } }) })
  try {
    const register = (headers) => {
      const network = generateKeyPair()
      const record = createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle: newHandle(), nome: 'Bot', criadoEm: s.m.relogio.agora })
      return s.call('POST', '/v1/agentes/registro', { corpo: { registro: record }, cabecalhos: headers })
    }
    const viaEdge = (visitor) => ({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': visitor })
    for (let i = 0; i < 3; i++) assert.equal((await register(viaEdge('203.0.113.7'))).status, 201)
    assert.equal((await register(viaEdge('203.0.113.7'))).status, 429)
    assert.equal((await register(viaEdge('203.0.113.8'))).status, 201, 'another visitor on the same edge has their own slots')
    // IPv6: three addresses of the same /64 exhaust the block
    for (const ip of ['2001:db8:7:7::1', '2001:db8:7:7::2', '2001:db8:7:7::3']) assert.equal((await register({ 'x-forwarded-for': '2606:4700::1', 'cf-connecting-ip': ip })).status, 201, ip)
    assert.equal((await register({ 'x-forwarded-for': '2606:4700::1', 'cf-connecting-ip': '2001:db8:7:7::4' })).status, 429)
    // straight to the server: the forged header is ignored and the address of whoever arrived is counted
    for (let i = 0; i < 3; i++) assert.equal((await register({ 'x-forwarded-for': '198.51.100.66', 'cf-connecting-ip': `203.0.113.${100 + i}` })).status, 201)
    const forged = await register({ 'x-forwarded-for': '198.51.100.66', 'cf-connecting-ip': '203.0.113.200' })
    assert.deepEqual([forged.status, forged.json.erro.codigo], [429, 'limite_de_taxa'])
  } finally { await s.fechar() }
})

test('the issuer service alone: /saude answers, and the per-origin burst is refused with 429 and Retry-After', async () => {
  const m = newWorld({ openIssuer: true, agora: now() })
  const server = createIssuerServer(m.emissor, { rajada: { capacity: 2, perSecond: 0.001 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    const health = await fetch(`${url}/saude`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { ok: true, emissor: m.emissor.publicKey, entregasPendentes: 0, rele: true })
    assert.equal((await fetch(`${url}/v1/agentes/info`)).status, 200)
    const r = await fetch(`${url}/saude`)
    assert.equal(r.status, 429)
    assert.equal((await r.json()).erro.codigo, 'limite_de_taxa')
    assert.ok(Number(r.headers.get('retry-after')) > 0)
    assert.equal((await fetch(`${url}/v1/objetos`)).status, 429, 'the bucket applies to any route')
  } finally { server.closeAllConnections(); await new Promise((ok) => server.close(ok)) }
})
