// SPDX-License-Identifier: AGPL-3.0-or-later
// The real HOSTED RELAY (bin/hosted-relay.js, child process) reading the revoked list of a fake issuer over https:
// refuses to start with a malformed configuration, reads on start, refuses the object and read credential of the revoked one, keeps the state next to
// the database and reuses it after a restart with the issuer down, warns when the list gets old and does not release a rover just
// because the new list omitted it. Each process and each server created here is brought down here, by its own object.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REQUIRES_APPROVAL, createHandleAttestation, createReadCredential } from '../../packages/protocol/src/index.js'
import { approve, newIssuer, newRover, objectOf } from '../helpers/world.js'
import { localCertificate, startFakeIssuer } from '../helpers/issuer-https.js'

const BIN = new URL('../../packages/relay/bin/hosted-relay.js', import.meta.url).pathname
const NODE = ['--disable-warning=ExperimentalWarning']
const base = { PATH: process.env.PATH, HOME: process.env.HOME }
const now = () => Math.floor(Date.now() / 1000)
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
const freePort = () => new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
})

const cleanups = []
after(async () => { for (const f of cleanups.reverse()) await f() })

let cert
let fakeIssuer
const issuer = newIssuer()
const state = { geradoEm: now(), emissores: [issuer.publicKey], revogados: [] }
const dir = mkdtempSync(join(tmpdir(), 'rn-hosp-revog-'))
const dbPath = join(dir, 'dados', 'rele.sqlite')
const stateFile = join(dir, 'dados', 'revogados-dos-emissores.json')
const secret = randomBytes(32).toString('hex')

before(async () => {
  cert = localCertificate()
  fakeIssuer = await startFakeIssuer(cert, state)
  cleanups.push(async () => { await fakeIssuer.fechar(); cert.apagar(); rmSync(dir, { recursive: true, force: true }) })
})

const relayEnv = (extra = {}) => ({
  ...base, RELAY_ISSUERS: issuer.publicKey, RELAY_REPORT_SECRET: secret, RELAY_DB: dbPath,
  RELAY_ISSUERS_DISCOVERY: `${issuer.publicKey}=${fakeIssuer.descoberta}`,
  // the fake issuer certificate is self-signed: the relay trusts it as it would trust a system CA
  NODE_EXTRA_CA_CERTS: cert.certPath,
  RELAY_BURST_CAPACITY: '5000', RELAY_BURST_PER_SECOND: '5000', ...extra
})

async function start(extra = {}) {
  const port = await freePort()
  const child = spawn(process.execPath, [...NODE, BIN], { env: relayEnv({ RELAY_PORT: String(port), ...extra }), stdio: ['ignore', 'ignore', 'pipe'] })
  let log = ''
  child.stderr.on('data', (d) => { log += d })
  const end = new Promise((ok) => child.on('close', (code) => ok(code)))
  cleanups.push(async () => { child.kill('SIGKILL'); await end })
  const home = Date.now()
  while (!log.includes('"ouvindo"')) {
    if (Date.now() - home > 20_000) throw new Error(`the hosted relay did not start: ${log}`)
    if (child.exitCode !== null) throw new Error(`the hosted relay exited: ${log}`)
    await sleep(40)
  }
  const url = `http://127.0.0.1:${port}`
  const get = async (path, headers = {}) => {
    const r = await fetch(url + path, { headers: headers })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  const post = async (path, body) => {
    const r = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  const stop = async () => { child.kill('SIGTERM'); return end }
  const events = () => log.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return { cru: l } } })
  return { url, get, post, parar: stop, log: () => log, eventos: events }
}

const tryStart = (extra) => spawnSync(process.execPath, [...NODE, BIN], { env: relayEnv({ RELAY_PORT: '1', ...extra }), encoding: 'utf8', timeout: 15_000 })

// ---------- the rover and what it publishes ----------
const roverA = newRover(issuer, { agora: now() })
const roverB = newRover(issuer, { agora: now() })
for (const r of [roverA, roverB]) r.cabeca = null

async function publish(relay, r, type, body, { withAttestation = false } = {}) {
  const object = objectOf(r, type, body, { criadoEm: now(), previo: r.cabeca })
  const env = { objeto: object }
  if (withAttestation) env.atestado = r.atestado
  if (REQUIRES_APPROVAL[type]) env.aprovacao = approve(r, object, { aprovadoEm: now() })
  const res = await relay.post('/v1/objetos', env)
  if (res.status === 201) r.cabeca = object.id
  return res
}
const publishPost = (relay, r, text, o) => publish(relay, r, 'postagem', { texto: text, topicos: ['rovers'] }, o)
const read = (relay, r, target) => relay.get(target, { authorization: createReadCredential({ chavePrivada: r.rede.chavePrivada, uid: r.uid, alvo: target, t: now() }) })

test('fail closed: an http URL, one with a password, a key outside RELAY_ISSUERS, a malformed interval or an unreadable state file do not start', () => {
  const cases = [
    [{ RELAY_ISSUERS_DISCOVERY: `${issuer.publicKey}=http://127.0.0.1:9/x` }, /precisa ser https/],
    [{ RELAY_ISSUERS_DISCOVERY: `${issuer.publicKey}=https://eu:segredo-da-url@127.0.0.1:9/x` }, /usuário nem senha/],
    [{ RELAY_ISSUERS_DISCOVERY: `${newIssuer().publicKey}=https://127.0.0.1:9/x` }, /RELAY_ISSUERS/],
    [{ RELAY_ISSUERS_DISCOVERY: 'sem-igual' }, /chave=URL/],
    [{ RELAY_REVOKED_INTERVAL_MIN: '0' }, /RELAY_REVOKED_INTERVAL_MIN/],
    [{ RELAY_REVOKED_INTERVAL_MIN: '1.5' }, /RELAY_REVOKED_INTERVAL_MIN/],
    [{ RELAY_REVOKED_MAX_AGE_MIN: 'muito' }, /RELAY_REVOKED_MAX_AGE_MIN/],
    [{ RELAY_REVOKED_INTERVAL_MIN: '30', RELAY_REVOKED_MAX_AGE_MIN: '10' }, /maior ou igual/]
  ]
  for (const [extra, re] of cases) {
    const r = tryStart(extra)
    assert.equal(r.status, 2, `${JSON.stringify(extra)}: ${r.stderr}`)
    assert.match(r.stderr, re)
    assert.ok(!r.stderr.includes('segredo-da-url'), 'the message does not repeat the URL')
  }
  const other = mkdtempSync(join(tmpdir(), 'rn-hosp-torto-'))
  cleanups.push(() => rmSync(other, { recursive: true, force: true }))
  writeFileSync(join(other, 'revogados-dos-emissores.json'), '{ quebrado')
  const r = tryStart({ RELAY_DB: join(other, 'rele.sqlite') })
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /ilegível/)
})

test('the hosted relay reads the revoked list on start, refuses the revoked one, keeps the state, withstands the issuer being down and is monotonic', async () => {
  // 1) empty list: both rovers get in
  state.geradoEm = now() - 5
  let relay = await start()
  assert.equal((await publish(relay, roverA, 'perfil', { nome: 'Seixo', descricao: 'Rover de teste.' }, { withAttestation: true })).status, 201)
  assert.equal((await publish(relay, roverB, 'perfil', { nome: 'Pipa', descricao: 'Rover de teste.' }, { withAttestation: true })).status, 201)
  let info = (await relay.get('/v1/info')).json
  assert.equal(info.provedor, 'descoberta')
  assert.equal(info.revogados.fontes[0].estado, 'em_dia')
  assert.equal(info.revogados.fontes[0].url, fakeIssuer.descoberta)
  assert.ok(fakeIssuer.pedidos.get('/.well-known/rover-network') >= 1, 'seguiu a descoberta')
  assert.equal(await relay.parar(), 0)
  assert.equal(statSync(stateFile).mode & 0o777, 0o600)

  // 2) the issuer revokes B: read on start, B neither publishes nor reads; A continues
  const revokedAt = now() - 2
  state.geradoEm = revokedAt
  state.revogados = [{ emissor: issuer.publicKey, uid: roverB.uid }]
  relay = await start()
  let r = await publishPost(relay, roverB, 'depois da revogação')
  assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
  r = await read(relay, roverB, '/v1/inicio')
  assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
  assert.equal((await relay.get(`/v1/rovers/${roverB.uid}`)).status, 404)
  assert.equal((await publishPost(relay, roverA, 'A segue publicando')).status, 201)
  assert.equal((await read(relay, roverA, '/v1/inicio')).status, 200)
  info = (await relay.get('/v1/info')).json
  assert.deepEqual([info.revogados.vigentes, info.revogados.lembrados, info.revogados.fontes[0].geradoEm], [1, 0, revokedAt])
  assert.equal(await relay.parar(), 0)

  // 3) restart with the issuer DOWN (503) and an old list: the disk state applies, the alert goes to the log and to /v1/info
  state.fail = 503
  relay = await start({ RELAY_REVOKED_INTERVAL_MIN: '1', RELAY_REVOKED_MAX_AGE_MIN: '1' })
  r = await publishPost(relay, roverB, 'emissor fora do ar')
  assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
  info = (await relay.get('/v1/info')).json
  const source = info.revogados.fontes[0]
  assert.deepEqual([source.ultimoErro, source.falhasSeguidas, source.geradoEm], ['status', 1, revokedAt])
  assert.equal(info.revogados.idadeMaxS, 60)
  assert.equal(info.revogados.intervaloS, 60)
  const ev = relay.eventos()
  assert.ok(ev.some((e) => e.evento === 'revogados_falha' && e.status === 503 && e.fonte === new URL(fakeIssuer.base).host))
  // the list is a few seconds old: still current with a 1-minute cap. The old-age case is proven in the unit test
  assert.ok(['em_dia', 'velha'].includes(source.estado))
  assert.equal(await relay.parar(), 0)

  // 4) the new list OMITS B (newer than the previous one): B's revoked attestation is still refused;
  //    an attestation issued after the last list that carried it becomes valid again
  delete state.fail
  state.geradoEm = now()
  state.revogados = []
  relay = await start()
  r = await publishPost(relay, roverB, 'a lista me esqueceu')
  assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
  info = (await relay.get('/v1/info')).json
  assert.deepEqual([info.revogados.vigentes, info.revogados.lembrados], [0, 1])
  roverB.atestado = createHandleAttestation({
    issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid: roverB.uid, handle: roverB.handle,
    chave: roverB.rede.publicKey, chaveAprovacao: roverB.aprovacao.publicKey, emitidoEm: revokedAt + 1, expiraEm: revokedAt + 86400
  })
  assert.equal((await publishPost(relay, roverB, 'reatestado depois da revogação', { withAttestation: true })).status, 201)
  assert.equal((await read(relay, roverB, '/v1/inicio')).status, 200)
  assert.equal(await relay.parar(), 0)
  // the state file is what the documentation says, and carries nothing besides public key, uid and dates
  const d = JSON.parse(readFileSync(stateFile, 'utf8'))
  assert.deepEqual(d.pares, [{ emissor: issuer.publicKey, uid: roverB.uid, ate: revokedAt, vigente: false }])
  assert.ok(existsSync(dbPath))
})

test('a stale list becomes an alert in the log at startup and `velha` in /v1/info', async () => {
  const other = mkdtempSync(join(tmpdir(), 'rn-hosp-velha-'))
  cleanups.push(() => rmSync(other, { recursive: true, force: true }))
  state.geradoEm = now() - 2 * 3600
  state.revogados = []
  const relay = await start({ RELAY_DB: join(other, 'rele.sqlite'), RELAY_REVOKED_MAX_AGE_MIN: '60' })
  const source = (await relay.get('/v1/info')).json.revogados.fontes[0]
  assert.equal(source.estado, 'velha')
  assert.ok(source.idadeS >= 7200)
  const alert = relay.eventos().find((e) => e.evento === 'revogados_lista_velha')
  assert.deepEqual([alert?.nivel, alert?.estado, alert?.idadeMaxS], ['alerta', 'velha', 3600])
  assert.equal(await relay.parar(), 0)
  state.geradoEm = now()
})

test('without RELAY_ISSUERS_DISCOVERY the hosted relay works as before: static provider, without the new field and without a state file', async () => {
  const other = mkdtempSync(join(tmpdir(), 'rn-hosp-sem-'))
  cleanups.push(() => rmSync(other, { recursive: true, force: true }))
  const relay = await start({ RELAY_DB: join(other, 'rele.sqlite'), RELAY_ISSUERS_DISCOVERY: '' })
  const info = (await relay.get('/v1/info')).json
  assert.equal(info.provedor, 'estatico')
  assert.equal('revogados' in info, false)
  assert.equal(await relay.parar(), 0)
  assert.equal(existsSync(join(other, 'revogados-dos-emissores.json')), false)
})

test('the hosted relay rereads the list by itself at the interval and the new revocation applies without a restart (waits a real minute)', { timeout: 150_000 }, async () => {
  const other = mkdtempSync(join(tmpdir(), 'rn-hosp-intervalo-'))
  cleanups.push(() => rmSync(other, { recursive: true, force: true }))
  const roverC = newRover(issuer, { agora: now() })
  roverC.cabeca = null
  state.geradoEm = now()
  state.revogados = []
  delete state.fail
  const relay = await start({ RELAY_DB: join(other, 'rele.sqlite'), RELAY_REVOKED_INTERVAL_MIN: '1' })
  assert.equal((await publish(relay, roverC, 'perfil', { nome: 'Teco', descricao: 'Rover de teste.' }, { withAttestation: true })).status, 201)
  const requestsBefore = fakeIssuer.pedidos.get('/.well-known/rover-network/emissores.json')
  // the issuer revokes C AFTER the relay starts: only the periodic reread can bring that in
  state.geradoEm = now()
  state.revogados = [{ emissor: issuer.publicKey, uid: roverC.uid }]
  const home = Date.now()
  while (fakeIssuer.pedidos.get('/.well-known/rover-network/emissores.json') === requestsBefore) {
    if (Date.now() - home > 90_000) throw new Error('the relay did not reread the list within 90 seconds')
    await sleep(500)
  }
  const waitedS = (Date.now() - home) / 1000
  assert.ok(waitedS > 40 && waitedS < 80, `read again about one minute later (${waitedS} s)`)
  // the response arrived; give the relay a moment to apply it
  let r
  for (let i = 0; i < 20; i++) {
    r = await publishPost(relay, roverC, `tentativa ${i}`)
    if (r.status === 403) break
    await sleep(100)
  }
  assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
  assert.equal(await relay.parar(), 0)
  state.revogados = []
})
