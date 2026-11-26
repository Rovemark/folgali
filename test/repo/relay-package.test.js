// SPDX-License-Identifier: AGPL-3.0-or-later
// The package that goes to the server (deploy/pack.sh) and the relay Dockerfile: only what is needed, no secret, no anonymous VOLUME,
// unprivileged user, and the package alone is able to start the relay (imports resolve without the rest of the repository).
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPair } from '../../packages/protocol/src/index.js'

const root = new URL('../../', import.meta.url).pathname
const dockerfile = readFileSync(join(root, 'packages/relay/Dockerfile'), 'utf8')
const port = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) }) })

test('Dockerfile: unprivileged user, healthcheck, no VOLUME, no secret, copies only protocol and relay', () => {
  assert.match(dockerfile, /^FROM node:22-alpine$/m)
  assert.match(dockerfile, /^USER relay$/m)
  assert.match(dockerfile, /^HEALTHCHECK /m)
  assert.ok(!/^\s*VOLUME\b/m.test(dockerfile), 'a VOLUME without a named volume becomes a new anonymous volume for every container and the database vanishes on every deploy')
  assert.ok(!/(SEGREDO|TOKEN|SENHA|PASSWORD|PRIVATE|SEMENTE)\s*=/i.test(dockerfile.replace(/^#.*$/gm, '')), 'no secret in the image')
  const copies = [...dockerfile.matchAll(/^COPY (?:--\S+ )*(\S+)/gm)].map((m) => m[1])
  assert.deepEqual(copies, ['packages/protocol/package.json', 'packages/protocol/src', 'packages/relay/package.json', 'packages/relay/bin', 'packages/relay/src'])
  assert.match(dockerfile, /^CMD \["node", "packages\/relay\/bin\/hosted-relay\.js"\]$/m)
  assert.match(dockerfile, /RELAY_DB=\/dados\/rele\.sqlite/)
  assert.ok(!/RELAY_STANDING_AUTHORIZATION/.test(dockerfile.replace(/^#.*$/gm, '')))
  assert.ok(!existsSync(join(root, 'packages/relay/.env')))
})

test('pack.sh carries only what the image copies, no tests, docs, demo, database or secret, and the package starts the relay by itself', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-pacote-'))
  try {
    const tgz = join(dir, 'rele.tgz')
    const r = spawnSync('sh', [join(root, 'packages/relay/deploy/pack.sh'), tgz], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const list = spawnSync('tar', ['-tzf', tgz], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l && !l.endsWith('/'))
    assert.ok(list.length > 15, `${list.length} files`)
    for (const f of list) {
      assert.match(f, /^packages\/(protocol\/(package\.json|src\/)|relay\/(package\.json|bin\/|src\/|Dockerfile))/, `unexpected file in the package: ${f}`)
      assert.ok(!/\.(sqlite|db|log|env|md|tgz)$|segredo-|\/\._|node_modules|\/test\/|\/scripts|\/docs|\.git/.test(f), `should not go: ${f}`)
    }
    for (const f of ['packages/relay/Dockerfile', 'packages/relay/bin/hosted-relay.js', 'packages/relay/bin/backup.js', 'packages/relay/bin/restore.js', 'packages/relay/src/operations.js', 'packages/relay/src/backup.js', 'packages/protocol/src/index.js']) {
      assert.ok(list.includes(f), `missing ${f}`)
    }
    // extracts to an empty place and starts the relay from there: if a file were missing, the import would break
    const dest = join(dir, 'ctx'); spawnSync('mkdir', [dest]); spawnSync('tar', ['-xzf', tgz, '-C', dest])
    const p = await port()
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(dest, 'packages/relay/bin/hosted-relay.js')], {
      cwd: dest,
      env: { PATH: process.env.PATH, RELAY_ISSUERS: generateKeyPair().publicKey, RELAY_REPORT_SECRET: randomBytes(32).toString('hex'), RELAY_DB: join(dir, 'd', 'rele.sqlite'), RELAY_PORT: String(p) },
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let log = ''
    child.stderr.on('data', (d) => { log += d })
    try {
      const t0 = Date.now()
      while (!log.includes('"ouvindo"')) { if (Date.now() - t0 > 15000) throw new Error(`não subiu: ${log}`); await new Promise((ok) => setTimeout(ok, 40)) }
      const res = await fetch(`http://127.0.0.1:${p}/v1/info`)
      assert.equal(res.status, 200)
    } finally { child.kill('SIGTERM') }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
