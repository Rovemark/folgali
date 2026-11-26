// SPDX-License-Identifier: AGPL-3.0-or-later
// The issuers' revoked list as read by the relay (packages/relay/src/issuer-revoked.js): configuration, https fetch with
// a size ceiling and a deadline, list shape, monotonic merge, list age, disk, and the effect on the relay (object and read credential
// refused with `atestado_revogado`). Network fetches go to a fake issuer over https (test/helpers/issuer-https.js) on a free port.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer as createTcp } from 'node:net'
import { gzipSync } from 'node:zlib'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REQUIRES_APPROVAL, createHandleAttestation, createReadCredential, generateKeyPair } from '../../packages/protocol/src/index.js'
import { Store } from '../../packages/relay/src/store.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { Relay } from '../../packages/relay/src/relay.js'
import {
  RevokedError, ProviderWithIssuerRevoked, REVOKED, fetchJson, fetchIssuerList, readRevokedSources, validateRevokedList,
  validateDiscoveryUrl
} from '../../packages/relay/src/issuer-revoked.js'
import { NOW, approve, newIssuer, newRover, newUid, objectOf } from '../helpers/world.js'
import { LIST_PATH, localCertificate, issuerDiscovery, issuerList, startFakeIssuer } from '../helpers/issuer-https.js'

const dirs = []
const newDir = () => { const p = mkdtempSync(join(tmpdir(), 'rn-revog-')); dirs.push(p); return p }
after(() => { for (const p of dirs) rmSync(p, { recursive: true, force: true }) })

const codeAsync = async (promise) => {
  try { await promise; return 'ok' } catch (e) { if (e instanceof RevokedError) return e.codigo; throw e }
}
const codeOf = (fn) => {
  try { fn(); return 'ok' } catch (e) { if (e?.codigo) return e.codigo; throw e }
}

// ====================================================================================================
// configuration
// ====================================================================================================

test('RELAY_ISSUERS_DISCOVERY: key=URL pairs, https only, no credential, trusted key and no repeats', () => {
  const a = newIssuer().publicKey
  const b = newIssuer().publicKey
  const u = 'https://api.exemplo.test/.well-known/rover-network'
  assert.deepEqual(readRevokedSources(undefined, [a]), [])
  assert.deepEqual(readRevokedSources('  ', [a]), [])
  assert.deepEqual(readRevokedSources(`${a}=${u}`, [a]), [{ emissor: a, url: u }])
  // the current and the previous key of one issuer share the URL
  assert.deepEqual(readRevokedSources(` ${a}=${u} , ${b}=${u} `, [a, b]), [{ emissor: a, url: u }, { emissor: b, url: u }])
  const refusal = (text, re) => assert.throws(() => readRevokedSources(text, [a, b]), re)
  refusal(`${a}=http://api.exemplo.test/x`, /https/)
  refusal(`${a}=https://eu:segredo@api.exemplo.test/x`, /usuário nem senha/)
  refusal(`${a}=https://eu@api.exemplo.test/x`, /usuário nem senha/)
  refusal(`${a}=https://api.exemplo.test/x#frag`, /fragmento/)
  refusal(`${a}=nao e url`, /inválida/)
  refusal(`${a}=`, /vazia/)
  refusal(`${a}=https://a.test/${'x'.repeat(REVOKED.maxUrlChars)}`, /longa/)
  refusal(u, /chave=URL/)
  refusal(`curta=${u}`, /43 caracteres/)
  refusal(`${newIssuer().publicKey}=${u}`, /RELAY_ISSUERS/)
  refusal(`${a}=${u},${a}=${u}`, /duas vezes/)
  // the message never repeats the URL (which could carry a secret)
  try { readRevokedSources(`${a}=https://eu:segredo@api.exemplo.test/x`, [a]) } catch (e) { assert.ok(!e.message.includes('segredo')) }
  assert.equal(validateDiscoveryUrl('https://API.Exemplo.test'), 'https://api.exemplo.test/')
})

// ====================================================================================================
// list shape
// ====================================================================================================

test('the list: versao 1, geradoEm, emissores and pairs exactly { emissor, uid }; any malformed pair rejects the whole list', () => {
  const e = newIssuer().publicKey
  const uid = newUid()
  const good = issuerList({ geradoEm: NOW, emissores: [e], revogados: [{ emissor: e, uid }, { emissor: e, uid }] })
  assert.deepEqual(validateRevokedList(good), { geradoEm: NOW, emissores: [e], revogados: [{ emissor: e, uid }] })
  // top-level fields the relay does not use may be missing or extra
  const { protocolo: protocol, validadeMaxS: maxValidityS, ...lean } = good
  assert.equal(validateRevokedList({ ...lean, extra: 1 }).revogados.length, 1)
  assert.ok(protocol && maxValidityS)
  const refusal = (l, field) => {
    try { validateRevokedList(l); assert.fail('aceitou') } catch (err) { assert.equal(err.codigo, 'lista'); assert.equal(err.campo, field) }
  }
  refusal(null, undefined)
  refusal([], undefined)
  refusal({ ...good, versao: 2 }, 'versao')
  refusal({ ...good, geradoEm: String(NOW) }, 'geradoEm')
  refusal({ ...good, geradoEm: 1_600_000_000 }, 'geradoEm')
  refusal({ ...good, geradoEm: 5_000_000_000 }, 'geradoEm')
  refusal({ ...good, emissores: [] }, 'emissores')
  refusal({ ...good, emissores: [{ chave: 'curta' }] }, 'emissores')
  refusal({ ...good, emissores: Array.from({ length: REVOKED.maxIssuers + 1 }, () => ({ chave: e })) }, 'emissores')
  refusal({ ...good, revogados: {} }, 'revogados')
  refusal({ ...good, revogados: [{ emissor: e, uid, ate: 1 }] }, 'revogados')
  refusal({ ...good, revogados: [{ emissor: e }] }, 'revogados')
  refusal({ ...good, revogados: [{ emissor: e, uid: 'rvr_curto' }] }, 'revogados')
  refusal({ ...good, revogados: [{ emissor: 'x', uid }] }, 'revogados')
  refusal({ ...good, revogados: [{ emissor: e, uid }, 'lixo'] }, 'revogados')
  refusal({ ...good, revogados: new Array(REVOKED.maxRevoked + 1).fill({ emissor: e, uid }) }, 'revogados')
  assert.equal(validateRevokedList({ ...good, revogados: new Array(REVOKED.maxRevoked).fill({ emissor: e, uid }) }).revogados.length, 1)
})

// ====================================================================================================
// real https fetch
// ====================================================================================================

let cert
let issuerHttps
const httpsState = { geradoEm: NOW, emissores: [], revogados: [] }
before(async () => {
  cert = localCertificate()
  httpsState.emissores = [newIssuer().publicKey]
  issuerHttps = await startFakeIssuer(cert, httpsState)
})
after(async () => { await issuerHttps?.fechar(); cert?.apagar() })

test('https fetch: follows discovery to the list on the same origin, or reads the list directly', async () => {
  const uid = newUid()
  httpsState.revogados = [{ emissor: httpsState.emissores[0], uid }]
  const viaDiscovery = await fetchIssuerList(issuerHttps.descoberta, { ca: cert.cert })
  assert.deepEqual(viaDiscovery.revogados, [{ emissor: httpsState.emissores[0], uid }])
  const direct = await fetchIssuerList(issuerHttps.lista, { ca: cert.cert })
  assert.deepEqual(direct, viaDiscovery)
  httpsState.revogados = []
})

test('fetch: discovery does not lead to another origin or to an unknown format', async () => {
  const e = httpsState.emissores
  for (const [name, doc] of [
    ['outro-dono', issuerDiscovery({ emissores: e, lista: 'https://outro.exemplo.test/lista.json' })],
    ['protocolo-relativo', issuerDiscovery({ emissores: e, lista: '//outro.exemplo.test/lista.json' })],
    ['relativo-sem-barra', issuerDiscovery({ emissores: e, lista: 'lista.json' })],
    ['formato', { ...issuerDiscovery({ emissores: e }), formato: 'provisorio-2' }],
    ['rede', { ...issuerDiscovery({ emissores: e }), rede: 'outra' }]
  ]) {
    issuerHttps.rotas.set(`/d/${name}`, (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(doc)) })
    assert.equal(await codeAsync(fetchIssuerList(`${issuerHttps.base}/d/${name}`, { ca: cert.cert })), 'descoberta', name)
  }
})

test('fetch: status, redirect (not followed), large response (with and without declared size), compression, malformed JSON', async () => {
  const r = issuerHttps.rotas
  r.set('/status', (req, res) => { res.writeHead(503); res.end() })
  r.set('/redireciona', (req, res) => { res.writeHead(302, { location: `${issuerHttps.base}${LIST_PATH}` }); res.end() })
  r.set('/grande', (req, res) => { res.writeHead(200, { 'content-length': 2048 }); res.end('x'.repeat(2048)) })
  r.set('/grande-sem-tamanho', (req, res) => { res.writeHead(200); for (let i = 0; i < 8; i++) res.write('x'.repeat(512)); res.end() })
  r.set('/no-limite', (req, res) => { const t = JSON.stringify({ a: 'x'.repeat(1014) }); res.writeHead(200); res.end(t) })
  r.set('/gzip', (req, res) => { res.writeHead(200, { 'content-encoding': 'gzip' }); res.end(gzipSync('{}')) })
  r.set('/nao-json', (req, res) => { res.writeHead(200); res.end('<html>') })
  const o = { ca: cert.cert, maxBytes: 1024 }
  const before = issuerHttps.pedidos.get(LIST_PATH) ?? 0
  const error = async (path) => { try { await fetchJson(issuerHttps.base + path, o); return 'ok' } catch (e) { return [e.codigo, e.status] } }
  assert.deepEqual(await error('/status'), ['status', 503])
  assert.deepEqual(await error('/redireciona'), ['redirecionamento', 302])
  assert.equal(issuerHttps.pedidos.get(LIST_PATH) ?? 0, before, 'the redirect was not followed')
  assert.deepEqual(await error('/grande'), ['resposta_grande', undefined])
  assert.deepEqual(await error('/grande-sem-tamanho'), ['resposta_grande', undefined])
  assert.deepEqual(await fetchJson(issuerHttps.base + '/no-limite', o), { a: 'x'.repeat(1014) }) // exactly 1024 bytes pass
  assert.deepEqual(await error('/gzip'), ['codificacao', undefined])
  assert.deepEqual(await error('/nao-json'), ['json_invalido', undefined])
  assert.deepEqual(await error('/nao-existe'), ['status', 404])
})

test('fetch: short deadline, network down, a certificate the system does not trust and a URL that is not https', async () => {
  issuerHttps.rotas.set('/lento', () => { /* never answers */ })
  const t0 = Date.now()
  assert.equal(await codeAsync(fetchJson(`${issuerHttps.base}/lento`, { ca: cert.cert, prazoMs: 300 })), 'prazo')
  assert.ok(Date.now() - t0 < 3000, 'the deadline cut the wait short')
  // closed port: take a free one and do not listen on it
  const port = await new Promise((ok) => { const s = createTcp(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
  assert.equal(await codeAsync(fetchJson(`https://127.0.0.1:${port}/x`, { prazoMs: 2000 })), 'rede')
  // without `ca`, the self-signed certificate is not accepted: TLS is checked
  assert.equal(await codeAsync(fetchJson(issuerHttps.lista, { prazoMs: 2000 })), 'rede')
  assert.equal(await codeAsync(fetchJson(issuerHttps.lista.replace('https:', 'http:'), { ca: cert.cert })), 'url')
  assert.equal(await codeAsync(fetchJson('https://eu:senha@127.0.0.1/x', { ca: cert.cert })), 'url')
  assert.equal(await codeAsync(fetchJson('nao e url')), 'url')
})

// ====================================================================================================
// the provider wired to a relay
// ====================================================================================================

/** An in-memory relay with the revoked provider; `fila` is what the fake fetch returns, in order (an Error becomes a failure). */
function build({ arquivo: file = null, idadeMaxS: maxAgeS = 3600, extraSources = [], extraIssuers = [] } = {}) {
  const issuer = newIssuer()
  const clock = { agora: NOW }
  const queue = []
  const calls = []
  const log = []
  const url = 'https://emissor.exemplo.test/.well-known/rover-network'
  const search = async (u) => {
    calls.push(u)
    const next = queue.shift()
    if (next === undefined) throw new RevokedError('rede')
    if (next instanceof Error) throw next
    return validateRevokedList(next)
  }
  const createProvider = () => new ProviderWithIssuerRevoked({
    emissores: [issuer.publicKey, ...extraIssuers], fontes: [{ emissor: issuer.publicKey, url }, ...extraSources], arquivo: file,
    relogio: () => clock.agora, idadeMaxS: maxAgeS, intervaloS: 300, registrar: (e) => log.push(e), buscar: search
  })
  const provider = createProvider()
  const store = new Store(':memory:')
  const relay = new Relay({ store, provedor: provider, relogio: () => clock.agora, reportSecret: randomBytes(32) })
  const list = (revoked, { geradoEm: generatedAt = clock.agora, emissores: issuers = [issuer.publicKey] } = {}) => issuerList({ geradoEm: generatedAt, emissores: issuers, revogados: revoked })
  const pair = (r) => ({ emissor: issuer.publicKey, uid: r.uid })
  return { emissor: issuer, relogio: clock, fila: queue, calls, log, url, provedor: provider, store, rele: relay, lista: list, par: pair, createProvider }
}

/** A registered rover (profile accepted with an attestation) with the chain head stored. */
function register(x, { emissor: issuer = x.emissor } = {}) {
  const r = newRover(issuer, { agora: x.relogio.agora })
  r.cabeca = null
  publish(x, r, 'perfil', { nome: 'Pipa', descricao: 'Rover de teste.' }, { withAttestation: true })
  return r
}
function publish(x, r, type, body, { withAttestation = false } = {}) {
  const object = objectOf(r, type, body, { criadoEm: x.relogio.agora, previo: r.cabeca })
  const env = { objeto: object }
  if (withAttestation) env.atestado = r.atestado
  if (REQUIRES_APPROVAL[type]) env.aprovacao = approve(r, object, { aprovadoEm: x.relogio.agora })
  const res = x.rele.aceitar(env)
  if (res.estado === 'aceito') r.cabeca = object.id
  return res
}
const publishPost = (x, r, text = 'Uma postagem de teste.', o) => publish(x, r, 'postagem', { texto: text, topicos: ['rovers'] }, o)
const reattest = (x, r, issuedAt) => {
  r.atestado = createHandleAttestation({
    issuerPrivateKey: r.emissor.chavePrivada, emissor: r.emissor.publicKey, uid: r.uid, handle: r.handle,
    chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: issuedAt, expiraEm: issuedAt + 30 * 86400
  })
}
const credential = (x, r, target, privateKey = r.rede.chavePrivada) =>
  ({ header: createReadCredential({ chavePrivada: privateKey, uid: r.uid, alvo: target, t: x.relogio.agora }), metodo: 'GET', alvo: target })

test('list read: the relay refuses the object and read credential of the revoked rover with atestado_revogado, and hides it', async () => {
  const x = build()
  const a = register(x)
  const b = register(x)
  publishPost(x, b, 'antes da revogação')
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado')
  assert.equal(codeOf(() => publishPost(x, a, 'reanexa', { withAttestation: true })), 'atestado_revogado')
  assert.equal(codeOf(() => x.rele.perfil(a.uid)), 'nao_encontrado')
  // VALID read credential of the revoked rover itself: it learns why
  assert.equal(codeOf(() => x.rele.social.inicio({ credencial: credential(x, a, '/v1/inicio') })), 'atestado_revogado')
  assert.equal(codeOf(() => x.rele.postsOf(b.uid, { completo: true, credencial: credential(x, a, `/v1/rovers/${b.uid}/postagens?completo=1`) })), 'atestado_revogado')
  // own route (the path belongs to the revoked rover)
  assert.equal(codeOf(() => x.rele.social.notificationsOf(a.uid, { credencial: credential(x, a, `/v1/rovers/${a.uid}/notificacoes`) })), 'atestado_revogado')
  // whoever does NOT have the rover key learns nothing: the same refusal as before
  const other = generateKeyPair().chavePrivada
  assert.equal(codeOf(() => x.rele.social.inicio({ credencial: credential(x, a, '/v1/inicio', other) })), 'leitura_nao_autorizada')
  assert.equal(codeOf(() => x.rele.social.notificationsOf(a.uid, { credencial: credential(x, a, `/v1/rovers/${a.uid}/notificacoes`, other) })), 'nao_encontrado')
  assert.equal(codeOf(() => x.rele.social.notificationsOf(a.uid, {})), 'nao_encontrado')
  // the other rover carries on as usual
  assert.equal(publishPost(x, b, 'depois').estado, 'aceito')
  assert.equal(x.rele.social.inicio({ credencial: credential(x, b, '/v1/inicio') }).voce.uid, b.uid)
  const info = x.rele.info().revogados
  assert.equal(info.vigentes, 1)
  assert.equal(info.fontes[0].estado, 'em_dia')
  assert.equal(info.fontes[0].geradoEm, NOW)
})

test('a failed fetch NEVER empties the list: the previous list stays in force, with the failure counted', async () => {
  const x = build()
  const a = register(x)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  const version = x.provedor.versao
  for (const code of ['rede', 'prazo', 'resposta_grande', 'status']) {
    x.relogio.agora += 300
    x.fila.push(new RevokedError(code, code === 'status' ? { status: 503 } : {}))
    await x.provedor.atualizar()
    assert.equal(x.provedor.revokedState().fontes[0].ultimoErro, code)
    assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado', code)
  }
  // a malformed list is also a failure, not an "empty list"
  x.fila.push({ versao: 1, geradoEm: x.relogio.agora, emissores: [{ chave: x.emissor.publicKey }], revogados: [{ uid: a.uid }] })
  await x.provedor.atualizar()
  assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado')
  const f = x.provedor.revokedState().fontes[0]
  assert.equal(f.falhasSeguidas, 5)
  assert.equal(f.ultimoErro, 'lista')
  assert.equal(f.geradoEm, NOW)
  assert.equal(x.provedor.versao, version, 'a failure does not touch the set')
  assert.deepEqual(x.provedor.revogados(), [x.par(a)])
  const failures = x.log.filter((e) => e.evento === 'revogados_falha')
  assert.equal(failures.length, 5)
  assert.equal(failures.find((e) => e.erro === 'status').status, 503)
  // and the log carries neither the uid nor the full URL
  for (const e of x.log) assert.ok(!JSON.stringify(e).includes(a.uid) && !JSON.stringify(e).includes('.well-known'), JSON.stringify(e))
  // the failure clears on the next good list
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.equal(x.provedor.revokedState().fontes[0].falhasSeguidas, 0)
  assert.equal(x.provedor.revokedState().fontes[0].ultimoErro, null)
})

test('monotonic: a pair that drops off the list keeps revoking the attestation it revoked; an attestation issued later is valid again', async () => {
  const x = build()
  const a = register(x) // attestation issued at NOW - 10
  x.relogio.agora += 60
  x.fila.push(x.lista([x.par(a)])) // geradoEm NOW + 60
  await x.provedor.atualizar()
  x.relogio.agora += 60
  x.fila.push(x.lista([x.par(a)])) // NOW + 120: `ate` follows the last list that carried the pair
  await x.provedor.atualizar()
  x.relogio.agora += 300
  x.fila.push(x.lista([])) // the issuer reinstated the rover (or the line expired): the new list omits it
  await x.provedor.atualizar()
  assert.deepEqual(x.provedor.revogados(), [{ ...x.par(a), ate: NOW + 120 }])
  const info = x.rele.info().revogados
  assert.equal(info.vigentes, 0)
  assert.equal(info.lembrados, 1)
  // the stored attestation (from before the revocation) stays refused, stored or reattached
  assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado')
  assert.equal(codeOf(() => x.rele.perfil(a.uid)), 'nao_encontrado')
  // an attestation issued BEFORE the end of the revocation too (NOW + 119 < ate)
  reattest(x, a, NOW + 119)
  assert.equal(codeOf(() => publishPost(x, a, 'quase', { withAttestation: true })), 'atestado_revogado')
  // at the exact instant of the last list that carried it, is it still revoked? No: `emitidoEm < ate` is the rule (see RELAY-OPERATIONS, section 15)
  reattest(x, a, NOW + 120)
  assert.equal(publishPost(x, a, 'reabilitado', { withAttestation: true }).estado, 'aceito')
  assert.equal(x.rele.perfil(a.uid).atestado.emitidoEm, NOW + 120)
  // and if the issuer lists it again, it holds again against any attestation
  x.relogio.agora += 300
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.equal(codeOf(() => publishPost(x, a, 'de novo')), 'atestado_revogado')
})

test('a list only holds for the keys tied to its URL, and must come from the configured issuer', async () => {
  const other = newIssuer()
  const x = build({ extraIssuers: [other.publicKey] })
  const a = register(x)
  const b = register(x, { emissor: other })
  // the issuer's list carries a rover of the OTHER issuer: ignored
  x.fila.push(x.lista([x.par(a), { emissor: other.publicKey, uid: b.uid }]))
  await x.provedor.atualizar()
  assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado')
  assert.equal(publishPost(x, b).estado, 'aceito')
  assert.equal(x.log.find((e) => e.evento === 'revogados_atualizados').ignorados, 1)
  // a list from another issuer served at the configured address: refused whole, the previous one stays
  x.relogio.agora += 300
  x.fila.push(x.lista([], { emissores: [other.publicKey] }))
  await x.provedor.atualizar()
  assert.equal(x.provedor.revokedState().fontes[0].ultimoErro, 'emissor_ausente')
  assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado')
})

test('a list older than the last accepted one, or dated in the future, is refused without touching the state', async () => {
  const x = build()
  const a = register(x)
  x.fila.push(x.lista([x.par(a)], { geradoEm: NOW }))
  await x.provedor.atualizar()
  x.relogio.agora += 600
  // a cache serving the old list (without the pair) does not release the rover
  x.fila.push(x.lista([], { geradoEm: NOW - 1 }))
  await x.provedor.atualizar()
  assert.equal(x.provedor.revokedState().fontes[0].ultimoErro, 'lista_antiga')
  assert.deepEqual(x.provedor.revogados(), [x.par(a)])
  // the same list again (same geradoEm) is accepted
  x.fila.push(x.lista([x.par(a)], { geradoEm: NOW }))
  await x.provedor.atualizar()
  assert.equal(x.provedor.revokedState().fontes[0].ultimoErro, null)
  // a date in the future beyond the slack would block the following lists: refused
  x.fila.push(x.lista([], { geradoEm: x.relogio.agora + REVOKED.maxFutureS + 1 }))
  await x.provedor.atualizar()
  assert.equal(x.provedor.revokedState().fontes[0].ultimoErro, 'lista_no_futuro')
  x.fila.push(x.lista([x.par(a)], { geradoEm: x.relogio.agora + REVOKED.maxFutureS }))
  await x.provedor.atualizar()
  assert.equal(x.provedor.revokedState().fontes[0].ultimoErro, null)
})

test('list age: no list, up to date and old; the alert appears in the log and in /v1/info', async () => {
  const x = build({ idadeMaxS: 600 })
  let f = x.rele.info().revogados.fontes[0]
  assert.deepEqual([f.estado, f.idadeS, f.geradoEm, f.atualizadaEm], ['sem_lista', null, null, null])
  await x.provedor.atualizar() // the queue is empty: failure
  assert.ok(x.log.some((e) => e.evento === 'revogados_lista_velha' && e.nivel === 'alerta' && e.estado === 'sem_lista'))
  x.fila.push(x.lista([], { geradoEm: NOW - 100 }))
  await x.provedor.atualizar()
  f = x.rele.info().revogados.fontes[0]
  assert.deepEqual([f.estado, f.idadeS, f.geradoEm, f.atualizadaEm, f.url, f.emissores], ['em_dia', 100, NOW - 100, NOW, x.url, [x.emissor.publicKey]])
  x.log.length = 0
  x.relogio.agora += 500 // age 600: at the limit it is still up to date
  assert.equal(x.rele.info().revogados.fontes[0].estado, 'em_dia')
  x.relogio.agora += 1 // 601: old
  assert.equal(x.rele.info().revogados.fontes[0].estado, 'velha')
  assert.equal(x.rele.info().revogados.fontes[0].idadeS, 601)
  await x.provedor.atualizar() // and the fetch fails again
  const alert = x.log.find((e) => e.evento === 'revogados_lista_velha')
  assert.deepEqual([alert.nivel, alert.estado, alert.idadeS, alert.idadeMaxS, alert.falhasSeguidas], ['alerta', 'velha', 601, 600, 1])
  assert.deepEqual([x.rele.info().revogados.idadeMaxS, x.rele.info().revogados.intervaloS], [600, 300])
  // a relay without the revoked provider does not get the field
  const withoutSources = new Relay({ store: new Store(':memory:'), provedor: new (await import('../../packages/relay/src/provider.js')).StaticProvider({ emissores: [x.emissor.publicKey] }), reportSecret: randomBytes(32) })
  assert.equal('revogados' in withoutSources.info(), false)
})

test('disk: the state survives a restart (pairs, remembered, dates), in a 0600 file; an unreadable file prevents startup', async () => {
  const dir = newDir()
  const file = join(dir, 'revogados-dos-emissores.json')
  const x = build({ arquivo: file })
  const a = register(x)
  const b = register(x)
  x.fila.push(x.lista([x.par(a), x.par(b)]))
  await x.provedor.atualizar()
  x.relogio.agora += 300
  x.fila.push(x.lista([x.par(a)])) // b becomes remembered with ate = NOW
  await x.provedor.atualizar()
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(existsSync(`${file}.${process.pid}.novo`), false, 'the temporary file was gone after the rename')
  // "restart": a new provider on the same file, unable to fetch anything
  const after = x.createProvider()
  assert.deepEqual(after.revogados().sort((p, q) => (p.uid < q.uid ? -1 : 1)), [x.par(a), { ...x.par(b), ate: NOW }].sort((p, q) => (p.uid < q.uid ? -1 : 1)))
  const f = after.revokedState().fontes[0]
  assert.deepEqual([f.geradoEm, f.atualizadaEm], [NOW + 300, NOW + 300])
  await after.atualizar() // failure (empty queue): nothing is lost
  assert.equal(after.revogados().length, 2)
  // and a new relay, on the same database, with the provider reloaded, refuses both
  const relay2 = new Relay({ store: x.store, provedor: after, relogio: () => x.relogio.agora, reportSecret: randomBytes(32) })
  x.rele = relay2
  assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado')
  assert.equal(codeOf(() => publishPost(x, b)), 'atestado_revogado')
  // a current pair of an issuer that no longer has a configured source becomes remembered (nobody would update it)
  const withoutSource = new ProviderWithIssuerRevoked({ emissores: [x.emissor.publicKey], fontes: [], arquivo: file, relogio: () => x.relogio.agora })
  assert.deepEqual(withoutSource.revogados().find((p) => p.uid === a.uid), { ...x.par(a), ate: NOW + 300 })
  // unreadable: the relay does not start (starting empty would forget revocations)
  for (const crooked of ['{', '[]', JSON.stringify({ formato: 'outro', fontes: [], pares: [] }),
    JSON.stringify({ formato: 'rover-network/revogados-dos-emissores/1', fontes: [], pares: [{ emissor: x.emissor.publicKey, uid: a.uid, ate: '1', vigente: true }] }),
    JSON.stringify({ formato: 'rover-network/revogados-dos-emissores/1', fontes: [{ url: 1 }], pares: [] })]) {
    writeFileSync(file, crooked)
    assert.throws(() => x.createProvider(), /ilegível/)
  }
})

test('a write failure: memory stays correct and the log warns', async () => {
  const dir = newDir()
  const x = build({ arquivo: join(dir, 'nao-existe', 'revogados.json') })
  const a = register(x)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.deepEqual(x.provedor.revogados(), [x.par(a)])
  assert.ok(x.log.some((e) => e.evento === 'revogados_falha_ao_gravar' && e.nivel === 'alerta'))
  assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado')
})

test('clear: only the operator forgets, and only what the current list does not carry', async () => {
  const dir = newDir()
  const file = join(dir, 'revogados.json')
  const x = build({ arquivo: file })
  const a = register(x)
  const b = register(x)
  x.fila.push(x.lista([x.par(a), x.par(b)]))
  await x.provedor.atualizar()
  x.relogio.agora += 300
  x.fila.push(x.lista([x.par(b)])) // a becomes remembered
  await x.provedor.atualizar()
  assert.deepEqual(x.provedor.limpar({ emissor: x.emissor.publicKey, uid: b.uid }), { limpos: 0, vigentesMantidos: 1 })
  assert.deepEqual(x.provedor.limpar({ emissor: x.emissor.publicKey, uid: newUid() }), { limpos: 0, vigentesMantidos: 0 })
  assert.deepEqual(x.provedor.limpar({ emissor: x.emissor.publicKey, uid: a.uid }), { limpos: 1, vigentesMantidos: 0 })
  assert.equal(publishPost(x, a, 'esquecido pelo operador').estado, 'aceito')
  assert.equal(codeOf(() => publishPost(x, b)), 'atestado_revogado')
  assert.equal(x.createProvider().revogados().length, 1, 'the clearing was saved')
  x.relogio.agora += 300
  x.fila.push(x.lista([]))
  await x.provedor.atualizar()
  assert.deepEqual(x.provedor.limpar({ tudo: true }), { limpos: 1, vigentesMantidos: 0 })
  assert.deepEqual(x.provedor.revogados(), [])
  assert.ok(x.log.some((e) => e.evento === 'revogados_limpos' && e.limpos === 1))
})

test('the admin route clears (with a credential) and checks the body; without the revoked provider, the route does not exist', async () => {
  const x = build()
  const a = register(x)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  x.relogio.agora += 300
  x.fila.push(x.lista([]))
  await x.provedor.atualizar()
  const token = randomBytes(24).toString('hex')
  const server = createRelayServer({ rele: x.rele, tokenAdmin: token })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${server.address().port}/v1/admin/revogados/limpar`
  const post = async (body, auth = `Bearer ${token}`) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(body) })
    return [r.status, await r.json()]
  }
  try {
    assert.equal((await post({ tudo: true }, 'Bearer errado'))[0], 401)
    for (const crooked of [{}, { tudo: false }, { tudo: 'sim' }, { tudo: true, uid: a.uid }, { emissor: x.emissor.publicKey }, { emissor: 'x', uid: a.uid }, { emissor: x.emissor.publicKey, uid: 'rvr_x' }, []]) {
      const [status, body] = await post(crooked)
      assert.deepEqual([status, body.erro.codigo], [422, 'esquema'], JSON.stringify(crooked))
    }
    assert.deepEqual(await post({ emissor: x.emissor.publicKey, uid: a.uid }), [200, { limpos: 1, vigentesMantidos: 0 }])
    assert.equal(publishPost(x, a, 'liberado').estado, 'aceito')
    assert.deepEqual(await post({ tudo: true }), [200, { limpos: 0, vigentesMantidos: 0 }])
    const info = await (await fetch(`http://127.0.0.1:${server.address().port}/v1/info`)).json()
    assert.equal(info.revogados.fontes[0].estado, 'em_dia')
  } finally {
    await new Promise((ok) => server.close(ok))
  }
  const { StaticProvider } = await import('../../packages/relay/src/provider.js')
  const isStatic = createRelayServer({ rele: new Relay({ store: new Store(':memory:'), provedor: new StaticProvider({ emissores: [x.emissor.publicKey] }), reportSecret: randomBytes(32) }), tokenAdmin: token })
  await new Promise((ok) => isStatic.listen(0, '127.0.0.1', ok))
  try {
    const r = await fetch(`http://127.0.0.1:${isStatic.address().port}/v1/admin/revogados/limpar`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{"tudo":true}' })
    assert.equal(r.status, 404)
  } finally {
    await new Promise((ok) => isStatic.close(ok))
  }
})

test('two simultaneous reads become one; sources that share the URL are fetched once; ligar() rereads on the interval', async (t) => {
  const previous = newIssuer()
  const x = build({ extraIssuers: [previous.publicKey], extraSources: [{ emissor: previous.publicKey, url: 'https://emissor.exemplo.test/.well-known/rover-network' }] })
  const a = register(x)
  const b = register(x, { emissor: previous })
  x.fila.push(x.lista([x.par(a), { emissor: previous.publicKey, uid: b.uid }], { emissores: [x.emissor.publicKey, previous.publicKey] }))
  await Promise.all([x.provedor.atualizar(), x.provedor.atualizar()])
  assert.equal(x.calls.length, 1)
  assert.equal(codeOf(() => publishPost(x, b)), 'atestado_revogado', 'the previous key of the same issuer also revokes')
  assert.deepEqual(x.rele.info().revogados.fontes[0].emissores, [x.emissor.publicKey, previous.publicKey])
  t.mock.timers.enable({ apis: ['setInterval'] })
  const stop = x.provedor.enable()
  x.fila.push(x.lista([]))
  t.mock.timers.tick(299_000)
  assert.equal(x.calls.length, 1)
  t.mock.timers.tick(1_000)
  await new Promise((ok) => setImmediate(ok))
  assert.equal(x.calls.length, 2)
  stop()
  t.mock.timers.tick(600_000)
  assert.equal(x.calls.length, 2)
})

test('the reference relay reads the list of an issuer over real https, end to end', async () => {
  const x = build()
  const a = register(x)
  httpsState.emissores = [x.emissor.publicKey]
  httpsState.geradoEm = x.relogio.agora
  httpsState.revogados = [x.par(a)]
  const provider = new ProviderWithIssuerRevoked({
    emissores: [x.emissor.publicKey], fontes: readRevokedSources(`${x.emissor.publicKey}=${issuerHttps.descoberta}`, [x.emissor.publicKey]),
    relogio: () => x.relogio.agora, fetchOptions: { ca: cert.cert }
  })
  await provider.atualizar()
  x.rele = new Relay({ store: x.store, provedor: provider, relogio: () => x.relogio.agora, reportSecret: randomBytes(32) })
  assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado')
  assert.equal(provider.revokedState().fontes[0].estado, 'em_dia')
  httpsState.revogados = []
})

test('the state file holds nothing beyond public keys, revoked uids and dates', async () => {
  const dir = newDir()
  const file = join(dir, 'r.json')
  const x = build({ arquivo: file })
  const a = register(x)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  const d = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(Object.keys(d).sort(), ['fontes', 'formato', 'pares'])
  assert.deepEqual(d.pares, [{ ...x.par(a), ate: NOW, vigente: true }])
  assert.deepEqual(d.fontes, [{ url: x.url, emissores: [x.emissor.publicKey], geradoEm: NOW, atualizadaEm: NOW }])
})

// ====================================================================================================
// edges the mutation testing demanded (each test below kills defects that survived the first batch)
// ====================================================================================================

test('the reader numbers are the ones documented in docs/RELAY-OPERATIONS.md, section 15', () => {
  assert.deepEqual({ ...REVOKED }, {
    defaultIntervalMin: 5, minIntervalMin: 1, maxIntervalMin: 1440, defaultMaxAgeMin: 60, maxAgeMaxMin: 43200,
    prazoMs: 10_000, maxResponseBytes: 16 * 1048576, maxUrlChars: 2048, maxFutureS: 300, maxRevoked: 100_000, maxIssuers: 16
  })
  assert.ok(Object.isFrozen(REVOKED))
})

test('configuration: exact edges', () => {
  const a = newIssuer().publicKey
  assert.deepEqual(readRevokedSources(null, [a]), [])
  // an item that starts with "=" has an empty key: the error is the key one, not the format one
  assert.throws(() => readRevokedSources('=https://a.test/x', [a]), /43 caracteres/)
  const prefix = 'https://a.test/'
  const atLimit = prefix + 'x'.repeat(REVOKED.maxUrlChars - prefix.length)
  assert.equal(atLimit.length, REVOKED.maxUrlChars)
  assert.equal(validateDiscoveryUrl(atLimit), atLimit)
  assert.throws(() => validateDiscoveryUrl(atLimit + 'x'), /longa/)
})

test('list: exact edges of geradoEm, of emissores and of an entry that is not an object', () => {
  const e = newIssuer().publicKey
  const l = (extra) => ({ ...issuerList({ geradoEm: NOW, emissores: [e] }), ...extra })
  assert.equal(validateRevokedList(l({ geradoEm: 1_700_000_000 })).geradoEm, 1_700_000_000)
  assert.equal(validateRevokedList(l({ geradoEm: 4_102_444_800 })).geradoEm, 4_102_444_800)
  assert.equal(validateRevokedList(l({ emissores: Array.from({ length: REVOKED.maxIssuers }, () => ({ chave: e })) })).emissores.length, REVOKED.maxIssuers)
  // a list with a "chave" property is not an issuer
  assert.throws(() => validateRevokedList(l({ emissores: [Object.assign([], { chave: e })] })), (err) => err.campo === 'emissores')
})

test('fetch: exact status and size limits, and a large declared size refused without waiting for the body', async () => {
  const r = issuerHttps.rotas
  for (const s of [299, 300, 399, 400]) r.set(`/s${s}`, (req, res) => { res.writeHead(s); res.end() })
  const body1024 = JSON.stringify({ a: 'x'.repeat(1016) })
  assert.equal(Buffer.byteLength(body1024), 1024)
  r.set('/exato-declarado', (req, res) => { res.writeHead(200, { 'content-length': 1024 }); res.end(body1024) })
  r.set('/exato-em-pedacos', (req, res) => { res.writeHead(200); res.write(body1024.slice(0, 500)); res.end(body1024.slice(500)) })
  r.set('/declara-e-trava', (req, res) => { res.writeHead(200, { 'content-length': 5000 }); res.write('x'.repeat(10)) })
  const o = { ca: cert.cert, maxBytes: 1024, prazoMs: 1500 }
  const error = async (path) => { try { await fetchJson(issuerHttps.base + path, o); return 'ok' } catch (e) { return `${e.codigo}:${e.status ?? ''}` } }
  assert.equal(await error('/s299'), 'status:299')
  assert.equal(await error('/s300'), 'redirecionamento:300')
  assert.equal(await error('/s399'), 'redirecionamento:399')
  assert.equal(await error('/s400'), 'status:400')
  assert.deepEqual(await fetchJson(issuerHttps.base + '/exato-declarado', o), { a: 'x'.repeat(1016) })
  assert.deepEqual(await fetchJson(issuerHttps.base + '/exato-em-pedacos', o), { a: 'x'.repeat(1016) })
  assert.equal(await error('/declara-e-trava'), 'resposta_grande:')
  assert.equal(await codeAsync(fetchJson('https://eu@127.0.0.1/x', { ca: cert.cert })), 'url')
})

test('fetch: discovery does not escape the origin through a backslash', async () => {
  const doc = issuerDiscovery({ emissores: httpsState.emissores, lista: '/\\outro.exemplo.test/lista.json' })
  issuerHttps.rotas.set('/d/barra-invertida', (req, res) => { res.writeHead(200); res.end(JSON.stringify(doc)) })
  assert.equal(await codeAsync(fetchIssuerList(`${issuerHttps.base}/d/barra-invertida`, { ca: cert.cert, prazoMs: 2000 })), 'descoberta')
})

test('provider: defaults (real clock, 60-minute ceiling, 5-minute interval) and a zeroed initial state', async () => {
  const e = newIssuer().publicKey
  const realNow = Math.floor(Date.now() / 1000)
  const p = new ProviderWithIssuerRevoked({
    emissores: [e], fontes: [{ emissor: e, url: 'https://e.test/x' }],
    buscar: async () => validateRevokedList(issuerList({ geradoEm: realNow, emissores: [e] }))
  })
  assert.equal(p.nome, 'descoberta')
  assert.deepEqual(p.trustedIssuers(), [e])
  const zero = p.revokedState()
  assert.deepEqual([zero.intervaloS, zero.idadeMaxS, zero.vigentes, zero.lembrados], [300, 3600, 0, 0])
  assert.deepEqual([zero.fontes[0].falhasSeguidas, zero.fontes[0].ultimoErro, zero.fontes[0].estado], [0, null, 'sem_lista'])
  await p.atualizar()
  const f = p.revokedState().fontes[0]
  assert.equal(f.estado, 'em_dia')
  assert.ok(Math.abs(f.atualizadaEm - realNow) <= 5, `the default clock is the real one, in seconds (${f.atualizadaEm})`)
  // with no file configured nothing goes to disk (not even to a file called "null" in the current folder)
  assert.equal(existsSync(join(process.cwd(), 'null')), false)
})

test('provider: a failure writes nothing; an identical list does not change the version; count of new entries; age zero; no alert when up to date', async () => {
  const dir = newDir()
  const file = join(dir, 'r.json')
  const x = build({ arquivo: file })
  const a = register(x)
  await x.provedor.atualizar() // failure (empty queue)
  assert.equal(existsSync(file), false, 'a failure writes nothing')
  x.fila.push(x.lista([x.par(a)]))
  x.log.length = 0
  await x.provedor.atualizar()
  assert.equal(x.provedor.revokedState().fontes[0].idadeS, 0)
  assert.equal(x.log.some((e) => e.evento === 'revogados_lista_velha'), false, 'an up-to-date list raises no alert')
  assert.equal(x.log.find((e) => e.evento === 'revogados_atualizados').novos, 1)
  // and a provider WITHOUT a file does not try to write anything
  const withoutFile = build()
  withoutFile.fila.push(withoutFile.lista([]))
  await withoutFile.provedor.atualizar()
  assert.equal(withoutFile.provedor.revokedState().fontes[0].estado, 'em_dia')
  assert.deepEqual(withoutFile.log.filter((e) => e.evento === 'revogados_falha_ao_gravar'), [])
  const version = x.provedor.versao
  x.fila.push(x.lista([x.par(a)]))
  x.log.length = 0
  await x.provedor.atualizar()
  assert.equal(x.provedor.versao, version, 'the same list does not force the relay to rewrite the table')
  assert.equal(x.log.find((e) => e.evento === 'revogados_atualizados').novos, 0)
  assert.deepEqual(x.provedor.limpar({ tudo: true }), { limpos: 0, vigentesMantidos: 1 })
  assert.equal(x.provedor.versao, version, 'clearing nothing does not change the version')
})

test('provider: the relay rereads the table on every change (a pair that becomes remembered, a remembered one that holds again against everything)', async () => {
  const x = build()
  const a = register(x)
  x.relogio.agora += 60
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado') // the relay has already copied the list to the table
  x.relogio.agora += 60
  x.fila.push(x.lista([]))
  await x.provedor.atualizar()
  reattest(x, a, NOW + 61)
  assert.equal(publishPost(x, a, 'reatestado', { withAttestation: true }).estado, 'aceito', 'the table was reread when the pair became remembered')
  // the issuer lists it again: the pair holds again against ANY attestation, even one issued after this list
  x.relogio.agora += 60
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.deepEqual(x.provedor.revogados(), [x.par(a)])
  reattest(x, a, x.relogio.agora + 30)
  assert.equal(codeOf(() => publishPost(x, a, 'adiantado', { withAttestation: true })), 'atestado_revogado')
})

test('provider: ligar() rereads exactly on the interval', async (t) => {
  const x = build()
  t.mock.timers.enable({ apis: ['setInterval'] })
  const stop = x.provedor.enable()
  t.mock.timers.tick(299_999)
  assert.equal(x.calls.length, 0)
  t.mock.timers.tick(1)
  await new Promise((ok) => setImmediate(ok))
  assert.equal(x.calls.length, 1)
  stop()
})

test('disk: a malformed file in each field prevents startup; the valid edges load', () => {
  const dir = newDir()
  const file = join(dir, 'r.json')
  const e = newIssuer().publicKey
  const uid = newUid()
  const format = 'rover-network/revogados-dos-emissores/1'
  const source = (f) => ({ url: 'https://e.test/x', emissores: [e], geradoEm: NOW, atualizadaEm: NOW, ...f })
  const pair = (p) => ({ emissor: e, uid, ate: NOW, vigente: true, ...p })
  const openAction = (data) => {
    writeFileSync(file, JSON.stringify(data))
    return new ProviderWithIssuerRevoked({ emissores: [e], fontes: [{ emissor: e, url: 'https://e.test/x' }], arquivo: file, relogio: () => NOW })
  }
  for (const [name, data] of [
    ['pares is not a list', { formato: format, fontes: [], pares: {} }],
    ['fontes is not a list', { formato: format, fontes: {}, pares: [] }],
    ['null fonte', { formato: format, fontes: [null], pares: [] }],
    ['url is not text', { formato: format, fontes: [source({ url: 1, geradoEm: null, atualizadaEm: null })], pares: [] }],
    ['malformed geradoEm', { formato: format, fontes: [source({ geradoEm: 'x', atualizadaEm: null })], pares: [] }],
    ['malformed atualizadaEm', { formato: format, fontes: [source({ geradoEm: null, atualizadaEm: 'x' })], pares: [] }],
    ['fractional geradoEm', { formato: format, fontes: [source({ geradoEm: 1.5 })], pares: [] }],
    ['negative geradoEm', { formato: format, fontes: [source({ geradoEm: -1 })], pares: [] }],
    ['null par', { formato: format, fontes: [], pares: [null] }],
    ['emissor as a list', { formato: format, fontes: [], pares: [pair({ emissor: [e] })] }],
    ['malformed emissor', { formato: format, fontes: [], pares: [pair({ emissor: 'curto' })] }],
    ['uid as a list', { formato: format, fontes: [], pares: [pair({ uid: [uid] })] }],
    ['malformed uid', { formato: format, fontes: [], pares: [pair({ uid: 'rvr_x' })] }],
    ['malformed ate', { formato: format, fontes: [], pares: [pair({ ate: 1.5 })] }],
    ['malformed vigente', { formato: format, fontes: [], pares: [pair({ vigente: 1 })] }]
  ]) {
    assert.throws(() => openAction(data), /ilegível/, name)
  }
  // valid edges: a source that never read (nulls) and instant zero
  assert.equal(openAction({ formato: format, fontes: [source({ geradoEm: null, atualizadaEm: null })], pares: [] }).revokedState().fontes[0].estado, 'sem_lista')
  assert.equal(openAction({ formato: format, fontes: [source({ geradoEm: 0, atualizadaEm: 0 })], pares: [pair({})] }).revokedState().fontes[0].geradoEm, 0)
})

test('store: the revocation query requires the issue instant of the attestation', () => {
  const a = new Store(':memory:')
  assert.throws(() => a.revogado(newIssuer().publicKey, newUid()), /emitidoEm é obrigatório/)
  assert.throws(() => a.revogado(newIssuer().publicKey, newUid(), String(NOW)), /emitidoEm é obrigatório/)
  assert.equal(a.revogado(newIssuer().publicKey, newUid(), NOW), false)
})

test('read credential: an unknown rover, one that left or one with an expired attestation keeps the earlier response', async () => {
  const x = build()
  const a = register(x)
  const b = register(x)
  const c = register(x)
  // a rover that never existed on this relay
  const ghost = newRover(x.emissor, { agora: x.relogio.agora })
  assert.equal(codeOf(() => x.rele.social.inicio({ credencial: credential(x, ghost, '/v1/inicio') })), 'leitura_nao_autorizada')
  // expired attestation, NOT revoked: valid credential, but the response stays as before
  x.store.executar('UPDATE rovers SET atestado_expira_em = :t WHERE uid = :uid', { t: x.relogio.agora - 1, uid: c.uid })
  assert.equal(codeOf(() => x.rele.social.inicio({ credencial: credential(x, c, '/v1/inicio') })), 'leitura_nao_autorizada')
  // revoked and left the network: leaving takes precedence (no "revoked" for someone who is no longer here)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.equal(codeOf(() => publishPost(x, a)), 'atestado_revogado')
  x.store.executar('UPDATE rovers SET saiu = 1 WHERE uid = :uid', { uid: a.uid })
  assert.equal(codeOf(() => x.rele.social.inicio({ credencial: credential(x, a, '/v1/inicio') })), 'leitura_nao_autorizada')
  // the own route of a visible rover: the owner reads, another rover does not, without a credential it is 401
  const target = `/v1/rovers/${b.uid}/notificacoes`
  assert.ok(Array.isArray(x.rele.social.notificationsOf(b.uid, { credencial: credential(x, b, target) }).itens))
  assert.equal(codeOf(() => x.rele.social.notificationsOf(b.uid, {})), 'leitura_nao_autorizada')
  const d = register(x)
  assert.equal(codeOf(() => x.rele.social.notificationsOf(b.uid, { credencial: credential(x, d, target) })), 'sem_permissao')
})

test('the admin route: { tudo: true } clears the remembered ones and a null body is refused without an internal error', async () => {
  const x = build()
  const a = register(x)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  x.relogio.agora += 300
  x.fila.push(x.lista([]))
  await x.provedor.atualizar()
  const token = randomBytes(24).toString('hex')
  const server = createRelayServer({ rele: x.rele, tokenAdmin: token })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${server.address().port}/v1/admin/revogados/limpar`
  const post = async (text) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: text })
    return [r.status, await r.json()]
  }
  try {
    for (const text of ['null', '"tudo"', '5', 'true']) assert.equal((await post(text))[0], 422, text)
    assert.deepEqual(await post('{"tudo":true}'), [200, { limpos: 1, vigentesMantidos: 0 }])
  } finally {
    await new Promise((ok) => server.close(ok))
  }
})
