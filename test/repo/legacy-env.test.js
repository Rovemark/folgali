// SPDX-License-Identifier: AGPL-3.0-or-later
// Environment variables moved to English names on 2026-11-25. Production env files still carry the Portuguese names
// (RELE_*, EMISSOR_*), so both must work: the new name is read, the old one fills it with a warning, and when both are set
// with different values the old explicit one wins over an image default.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LEGACY_ENV, withLegacyEnv, generateKeyPair } from '../helpers/legacy-env-imports.js'
import { readConfig } from '../../packages/open-issuer/src/configuration.js'

const root = new URL('../../', import.meta.url).pathname
const NODE = ['--disable-warning=ExperimentalWarning']
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) }) })

test('old name only: the new one is filled and a warning names both', () => {
  const warnings = []
  const env = withLegacyEnv({ RELE_BANCO: '/dados/rele.sqlite', EMISSOR_LINK: 'https://x/' }, (m) => warnings.push(m))
  assert.equal(env.RELAY_DB, '/dados/rele.sqlite')
  assert.equal(env.ISSUER_LINK, 'https://x/')
  assert.equal(env.RELE_BANCO, '/dados/rele.sqlite', 'the old name stays readable')
  assert.deepEqual(warnings.sort(), ['EMISSOR_LINK is deprecated; rename it to ISSUER_LINK.', 'RELE_BANCO is deprecated; rename it to RELAY_DB.'])
})

test('new name only: untouched, no warning; same value under both: no warning', () => {
  const warnings = []
  assert.deepEqual(withLegacyEnv({ RELAY_PORT: '4747' }, (m) => warnings.push(m)), { RELAY_PORT: '4747' })
  assert.equal(withLegacyEnv({ RELAY_PORT: '4747', RELE_PORTA: '4747' }, (m) => warnings.push(m)).RELAY_PORT, '4747')
  assert.deepEqual(warnings, [])
})

test('both set with different values: the old explicit one wins, with a warning', () => {
  const warnings = []
  const env = withLegacyEnv({ RELAY_ADDRESS: '0.0.0.0', RELE_ENDERECO: '127.0.0.1' }, (m) => warnings.push(m))
  assert.equal(env.RELAY_ADDRESS, '127.0.0.1')
  assert.match(warnings[0], /RELE_ENDERECO and RELAY_ADDRESS are both set/)
})

test('the input is not changed, and every old name maps to exactly one new name', () => {
  const input = { RELE_MIDIA: 'sim' }
  withLegacyEnv(input)
  assert.deepEqual(input, { RELE_MIDIA: 'sim' })
  const olds = Object.values(LEGACY_ENV)
  assert.equal(new Set(olds).size, olds.length)
  for (const [n, o] of Object.entries(LEGACY_ENV)) {
    assert.match(n, /^(RELAY|ISSUER)_[A-Z0-9_]+$/)
    assert.match(o, /^(RELE|EMISSOR)_[A-Z0-9_]+$/)
  }
})

test('every RELAY_* and ISSUER_* name the code reads from the environment has its old name', () => {
  // read as env.NAME, as a quoted name (positiveInteger('RELAY_PORT')) or set in a Dockerfile
  const files = spawnSync('git', ['ls-files', 'packages/relay', 'packages/open-issuer'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter((f) => /\.(js|mjs)$|Dockerfile$/.test(f))
  const read = new Set()
  for (const f of files) for (const m of readFileSync(join(root, f), 'utf8').matchAll(/(?:env\.|['"`]|^\s+|ENV )((?:RELAY|ISSUER)_[A-Z0-9_]*[A-Z0-9])\b/gm)) read.add(m[1])
  for (const n of read) assert.ok(n in LEGACY_ENV, `${n} has no old name in LEGACY_ENV`)
})

test('the open issuer reads the same configuration from old and new names', () => {
  const key = randomBytes(32).toString('hex')
  const owner = generateKeyPair().publicKey
  const common = { KEY: key, SECRET: randomBytes(32).toString('hex'), OWNERS: owner, LINK: 'https://folgali.test/reivindicar/', RELAY: 'http://127.0.0.1:4747' }
  const fresh = readConfig(Object.fromEntries(Object.entries(common).map(([k, v]) => [`ISSUER_${k}`, v])))
  const oldNames = { KEY: 'CHAVE', SECRET: 'SEGREDO', OWNERS: 'DONOS', LINK: 'LINK', RELAY: 'RELE' }
  const legacy = readConfig(withLegacyEnv(Object.fromEntries(Object.entries(common).map(([k, v]) => [`EMISSOR_${oldNames[k]}`, v]))))
  assert.deepEqual(legacy, fresh)
})

test('the hosted relay starts from an env file that still has only the old names, and says which to rename', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-legacy-'))
  const port = await freePort()
  const child = spawn(process.execPath, [...NODE, join(root, 'packages/relay/bin/hosted-relay.js')], {
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, RELE_EMISSORES: generateKeyPair().publicKey, RELE_SEGREDO_DENUNCIAS: randomBytes(32).toString('hex'),
      RELE_BANCO: join(dir, 'dados', 'rele.sqlite'), RELE_PORTA: String(port), RELE_ENDERECO: '127.0.0.1',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let log = ''
  child.stderr.on('data', (d) => { log += d })
  try {
    const start = Date.now()
    while (!log.includes('"ouvindo"')) {
      if (Date.now() - start > 15_000) throw new Error(`did not start: ${log}`)
      await new Promise((ok) => setTimeout(ok, 40))
    }
    const info = await (await fetch(`http://127.0.0.1:${port}/v1/info`)).json()
    assert.equal(typeof info.versaoDoRascunho, 'string')
    assert.match(log, /RELE_EMISSORES is deprecated; rename it to RELAY_ISSUERS/)
    assert.match(log, /RELE_BANCO is deprecated; rename it to RELAY_DB/)
  } finally {
    child.kill('SIGTERM')
    rmSync(dir, { recursive: true, force: true })
  }
})
