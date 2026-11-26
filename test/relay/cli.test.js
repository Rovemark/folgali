// SPDX-License-Identifier: AGPL-3.0-or-later
// The relay executable: configuration by environment, refusal without an issuer, secret file with restricted permission.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { generateKeyPair } from '../../packages/protocol/src/index.js'

const BIN = new URL('../../packages/relay/bin/relay.js', import.meta.url).pathname
const baseEnvironment = { PATH: process.env.PATH, HOME: process.env.HOME }

const freePort = () => new Promise((resolve) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
})

test('without a trusted issuer the relay does not start and explains why', () => {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', BIN], { env: baseEnvironment, encoding: 'utf8', timeout: 20_000 })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /RELAY_ISSUERS/)
})

test('a short report secret does not start', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-cli-'))
  try {
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', BIN], {
      env: { ...baseEnvironment, RELAY_ISSUERS: generateKeyPair().publicKey, RELAY_DB: join(dir, 'r.sqlite'), RELAY_REPORT_SECRET: 'abcd' },
      encoding: 'utf8', timeout: 20_000
    })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /RELAY_REPORT_SECRET/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('starts on 127.0.0.1, serves, creates the secret with 0600 permission and does not write the credential to the log', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-cli-'))
  const port = await freePort()
  const issuer = generateKeyPair().publicKey
  const token = `adm-${'x'.repeat(40)}`
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', BIN], {
    env: { ...baseEnvironment, RELAY_ISSUERS: issuer, RELAY_DB: join(dir, 'dados', 'r.sqlite'), RELAY_PORT: String(port), RELAY_ADMIN_TOKEN: token },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let log = ''
  child.stderr.on('data', (d) => { log += d })
  try {
    const home = Date.now()
    while (!log.includes('"ouvindo"')) {
      if (Date.now() - home > 15_000) throw new Error(`the relay did not start: ${log}`)
      await new Promise((ok) => setTimeout(ok, 50))
    }
    const res = await fetch(`http://127.0.0.1:${port}/v1/info`)
    assert.equal(res.status, 200)
    const info = await res.json()
    assert.deepEqual(info.emissores, [issuer])
    assert.equal(info.autorizacaoPermanente, true, '0.6.0: without the variable, standing authorization is ON')
    assert.match(log, /"autorizacaoPermanente":true/)
    const admin = await fetch(`http://127.0.0.1:${port}/v1/admin/bloqueios`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(admin.status, 200)
    const file = join(dir, 'dados', 'r.sqlite.segredo-denuncias')
    assert.ok(existsSync(file))
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.ok(!log.includes(token), 'the credential must not appear in the log')
    assert.match(log, /"admin":true/)
    assert.match(log, /"endereco":"127.0.0.1"/)
  } finally {
    child.kill('SIGTERM') // only the process this test created
    await new Promise((ok) => child.on('close', ok))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('0.6.0: RELAY_STANDING_AUTHORIZATION absent, empty or sim turns it on; nao turns it off; a malformed value does not start', async () => {
  for (const value of ['1', 'true', 'SIM']) {
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', BIN], {
      env: { ...baseEnvironment, RELAY_ISSUERS: generateKeyPair().publicKey, RELAY_DB: join(tmpdir(), `rn-cli-nunca-${randomBytes(4).toString('hex')}`, 'r.sqlite'), RELAY_STANDING_AUTHORIZATION: value },
      encoding: 'utf8', timeout: 20_000
    })
    assert.equal(r.status, 2, value)
    assert.match(r.stderr, /RELAY_STANDING_AUTHORIZATION aceita só/)
  }
  for (const [value, enabled] of [['sim', true], ['nao', false], ['', true]]) {
    const dir = mkdtempSync(join(tmpdir(), 'rn-cli-'))
    const port = await freePort()
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', BIN], {
      env: { ...baseEnvironment, RELAY_ISSUERS: generateKeyPair().publicKey, RELAY_DB: join(dir, 'r.sqlite'), RELAY_PORT: String(port), RELAY_STANDING_AUTHORIZATION: value },
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let log = ''
    child.stderr.on('data', (d) => { log += d })
    try {
      const home = Date.now()
      while (!log.includes('"ouvindo"')) {
        if (Date.now() - home > 15_000) throw new Error(`the relay did not start: ${log}`)
        await new Promise((ok) => setTimeout(ok, 50))
      }
      const info = await (await fetch(`http://127.0.0.1:${port}/v1/info`)).json()
      assert.equal(info.autorizacaoPermanente, enabled, `value "${value}"`)
    } finally {
      child.kill('SIGTERM') // only the process this test created
      await new Promise((ok) => child.on('close', ok))
      rmSync(dir, { recursive: true, force: true })
    }
  }
})
