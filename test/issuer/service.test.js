// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: the open issuer as a SERVICE: the executable starts on its own and fails closed, /saude answers, the database backup is consistent and
// rotated, and the Dockerfile is that of a service of its own (only protocol and issuer, no secret, no VOLUME, unprivileged user).
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createAgentRecord, generateKeyPair } from '../../packages/protocol/src/index.js'
import { OpenIssuer } from '../../packages/open-issuer/src/issuer.js'
import { check, makeBackup, backupName, rotate } from '../../packages/open-issuer/src/backup.js'
import { newHandle } from '../helpers/world.js'

const root = new URL('../../', import.meta.url).pathname
const BIN = join(root, 'packages/open-issuer/bin/open-issuer.js')
const BACKUP = join(root, 'packages/open-issuer/bin/backup.js')
const NODE = ['--disable-warning=ExperimentalWarning']
const base = { PATH: process.env.PATH, HOME: process.env.HOME }
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) }) })
const goodConfig = (dir, port) => ({
  ...base, ISSUER_KEY: randomBytes(32).toString('hex'), ISSUER_SECRET: randomBytes(32).toString('hex'), ISSUER_OWNERS: generateKeyPair().publicKey,
  ISSUER_LINK: 'https://folgali.test/reivindicar/', ISSUER_RELAY: 'http://127.0.0.1:9', ISSUER_DB: join(dir, 'dados', 'emissor.sqlite'), ISSUER_PORT: String(port)
})

test('the executable fails closed: without key, secret, owners, link or relay it does not start, and the message does not echo a secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-emissor-'))
  try {
    const good = goodConfig(dir, 1)
    for (const missing of ['ISSUER_KEY', 'ISSUER_SECRET', 'ISSUER_OWNERS', 'ISSUER_LINK', 'ISSUER_RELAY']) {
      const env = { ...good }
      delete env[missing]
      const r = spawnSync(process.execPath, [...NODE, BIN], { env, encoding: 'utf8', timeout: 20_000 })
      assert.equal(r.status, 2, missing)
      assert.match(r.stderr, new RegExp(missing))
      assert.ok(!r.stderr.includes(good.ISSUER_SECRET) && !r.stderr.includes(good.ISSUER_KEY))
    }
    assert.ok(!existsSync(join(dir, 'dados')), 'nothing was created')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the executable starts, answers /saude and the agent routes, puts no secret in the log and shuts down cleanly on SIGTERM', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-emissor-'))
  const port = await freePort()
  const env = goodConfig(dir, port)
  const child = spawn(process.execPath, [...NODE, BIN], { env, stdio: ['ignore', 'ignore', 'pipe'] })
  let log = ''
  child.stderr.on('data', (d) => { log += d })
  const end = new Promise((ok) => child.on('close', ok))
  try {
    const home = Date.now()
    while (!log.includes('"ouvindo"')) {
      if (Date.now() - home > 15_000) throw new Error(`o emissor não subiu: ${log}`)
      await new Promise((ok) => setTimeout(ok, 40))
    }
    const health = await (await fetch(`http://127.0.0.1:${port}/saude`)).json()
    assert.equal(health.ok, true)
    const info = await (await fetch(`http://127.0.0.1:${port}/v1/agentes/info`)).json()
    assert.equal(info.emissor, health.emissor)
    // the configured relay does not answer: registration is refused with 503 (it does not issue a @ blindly)
    const network = generateKeyPair()
    const record = createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle: newHandle(), nome: 'Bot', criadoEm: Math.floor(Date.now() / 1000) })
    const r = await fetch(`http://127.0.0.1:${port}/v1/agentes/registro`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ registro: record }) })
    assert.equal(r.status, 503)
    assert.equal(r.headers.get('retry-after'), '30')
    for (const secret of [env.ISSUER_KEY, env.ISSUER_SECRET]) assert.ok(!log.includes(secret))
    const requestsInLog = () => log.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.evento === 'pedido')
    // the request log is written after the response: waits for the three to arrive
    for (let i = 0; i < 100 && requestsInLog().length < 3; i++) await new Promise((ok) => setTimeout(ok, 20))
    const requests = requestsInLog()
    assert.equal(requests.length, 3)
    for (const p of requests) assert.deepEqual(Object.keys(p).sort(), ['evento', 'metodo', 'ms', 'nivel', 'rota', 'status', 't'], 'the request log carries no address or header')
    assert.ok(statSync(join(dir, 'dados')).mode % 0o1000 === 0o700, 'the database folder is 0700')
  } finally {
    child.kill('SIGTERM') // only the process this test created
    assert.equal(await end, 0)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('backup: consistent copy, verified and with sha256; a temporary name never remains; rotation keeps the N newest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-emissor-bkp-'))
  try {
    const dbPath = join(dir, 'emissor.sqlite')
    const e = new OpenIssuer({ chavePrivada: generateKeyPair().chavePrivada, segredo: randomBytes(32), ownerIssuers: ['A'.repeat(43)], claimLink: 'https://x.test/r/', banco: dbPath })
    const network = generateKeyPair()
    await e.registrar({ registro: createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle: newHandle(), nome: 'Bot', criadoEm: Math.floor(Date.now() / 1000) }) })
    const destination = join(dir, 'backups')
    const t0 = Date.UTC(2026, 10, 24, 12, 0, 0)
    const r = makeBackup({ banco: dbPath, pasta: destination, agora: new Date(t0) })
    assert.equal(r.arquivo, 'emissor-20261124-120000.sqlite')
    assert.deepEqual(r.contagens, { agentes: 1, atos_vistos: 0, entregas_pendentes: 0 })
    const bytes = readFileSync(join(destination, r.arquivo))
    assert.equal(readFileSync(join(destination, `${r.arquivo}.sha256`), 'utf8'), `${r.sha256}  ${r.arquivo}\n`)
    assert.equal(statSync(join(destination, r.arquivo)).mode % 0o1000, 0o600)
    assert.equal(bytes.length, r.bytes)
    assert.throws(() => makeBackup({ banco: dbPath, pasta: destination, agora: new Date(t0) }), /mesmo segundo/)
    for (let i = 1; i <= 4; i++) makeBackup({ banco: dbPath, pasta: destination, agora: new Date(t0 + i * 1000) })
    assert.deepEqual(rotate({ pasta: destination, last: 2 }), ['emissor-20261124-120002.sqlite', 'emissor-20261124-120001.sqlite', 'emissor-20261124-120000.sqlite'])
    assert.deepEqual(readdirSync(destination).sort(), ['emissor-20261124-120003.sqlite', 'emissor-20261124-120003.sqlite.sha256', 'emissor-20261124-120004.sqlite', 'emissor-20261124-120004.sqlite.sha256'])
    assert.ok(!readdirSync(destination).some((n) => n.endsWith('.parcial')))
    // a database that is not the issuer one: the check refuses and nothing is left behind
    const foreign = join(dir, 'alheio.sqlite')
    new DatabaseSync(foreign).exec('CREATE TABLE x (a); INSERT INTO x VALUES (1);')
    assert.throws(() => makeBackup({ banco: foreign, pasta: destination, agora: new Date(t0 + 9000) }), /tabela agentes/)
    assert.ok(!readdirSync(destination).some((n) => n.includes('120009')))
    assert.throws(() => check(foreign), /tabela agentes/)
    assert.throws(() => makeBackup({ banco: join(dir, 'nao-existe.sqlite'), pasta: destination }), /não existe/)
    assert.equal(backupName(new Date(t0)), 'emissor-20261124-120000.sqlite')
    // the backup executable, as in the container
    const b = spawnSync(process.execPath, [...NODE, BACKUP], { env: { ...base, ISSUER_DB: dbPath, ISSUER_BACKUP_DIR: destination, ISSUER_BACKUP_KEEP: '1' }, encoding: 'utf8' })
    assert.equal(b.status, 0, b.stderr)
    const line = JSON.parse(b.stdout)
    assert.deepEqual([line.evento, line.agentes, line.apagados], ['backup', 1, 2])
    const bad = spawnSync(process.execPath, [...NODE, BACKUP], { env: { ...base, ISSUER_DB: dbPath, ISSUER_BACKUP_DIR: destination, ISSUER_BACKUP_KEEP: '0' }, encoding: 'utf8' })
    assert.equal(bad.status, 2)
    e.fechar()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('issuer Dockerfile: its own service, only protocol and issuer, unprivileged user, health at /saude, no VOLUME and no secret', () => {
  const d = readFileSync(join(root, 'packages/open-issuer/Dockerfile'), 'utf8')
  const without = d.replace(/^#.*$/gm, '')
  assert.match(d, /^FROM node:22-alpine$/m)
  assert.match(d, /^USER issuer$/m)
  assert.match(d, /^HEALTHCHECK .*http:\/\/127\.0\.0\.1:4848\/saude/m)
  assert.ok(!/^\s*VOLUME\b/m.test(d))
  assert.ok(!/(SEGREDO|CHAVE|TOKEN|SENHA|PASSWORD|PRIVATE|SEMENTE)\s*=/i.test(without))
  assert.deepEqual([...d.matchAll(/^COPY (?:--\S+ )*(\S+)/gm)].map((m) => m[1]), [
    'packages/protocol/package.json', 'packages/protocol/src', 'packages/open-issuer/package.json', 'packages/open-issuer/bin', 'packages/open-issuer/src'
  ])
  assert.match(d, /^CMD \["node", "packages\/open-issuer\/bin\/open-issuer\.js"\]$/m)
  assert.ok(!/packages\/rele/.test(without), 'the issuer image does not carry the relay')
})

// The image copies packages/protocol/src whole (Dockerfile), so any module there is fine: cloudflare.js and origin.js live there.
test('the issuer package imports only the protocol and itself (nothing from the relay)', () => {
  const dir = join(root, 'packages/open-issuer')
  for (const sub of ['src', 'bin']) {
    for (const f of readdirSync(join(dir, sub))) {
      const text = readFileSync(join(dir, sub, f), 'utf8')
      for (const [, from] of text.matchAll(/from '([^']+)'/g)) {
        assert.ok(from.startsWith('node:') || from.startsWith('./') || from.startsWith('../src/') || /^\.\.\/\.\.\/protocol\/src\/[a-z-]+\.js$/.test(from), `${sub}/${f} importa ${from}`)
      }
    }
  }
})
