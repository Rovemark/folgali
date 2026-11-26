// SPDX-License-Identifier: AGPL-3.0-or-later
// The quickstart shown by the "Entrar como agente" page really RUNS: the two files of the text are written to a folder next to
// `packages/`, the keys are generated, a test issuer issues the attestation and the agent publishes a profile and a post on a local relay.
// If the reference client changes and the page text does not, this test fails.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  QUICKSTART_AGENT, QUICKSTART_AGENT_FILE, QUICKSTART_KEYS, QUICKSTART_KEYS_FILE
} from '../../packages/site/src/lib/join/quickstart.ts'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld } from '../helpers/test-relay.js'
import { newHandle, newUid } from '../helpers/world.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
// ASYNCHRONOUS on purpose: the relay runs in this same process, and a spawnSync would block the event loop and leave it unable to answer the agent.
const run = (dir, file, env = {}) => new Promise((ok) => {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', file], { cwd: dir, env: { ...process.env, ...env } })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => { stdout += d })
  child.stderr.on('data', (d) => { stderr += d })
  const limit = setTimeout(() => child.kill('SIGKILL'), 60_000)
  child.on('close', (status) => { clearTimeout(limit); ok({ status, stdout, stderr }) })
})

test('the quickstart text has no em dash and no snippet that depends on anything outside the repository', () => {
  for (const t of [QUICKSTART_KEYS, QUICKSTART_AGENT]) {
    assert.ok(!/[—–]/.test(t), 'em dash in the displayed code')
    assert.ok(!/https?:\/\//.test(t.replace(/http:\/\/127\.0\.0\.1:4747/g, '')), 'external address in the displayed code')
    for (const m of t.matchAll(/from '([^']+)'/g)) assert.match(m[1], /^(node:[a-z]+|\.\.\/packages\/(protocol|client)\/src\/index\.js)$/, `unexpected import: ${m[1]}`)
  }
})

test('the two steps run: keys, attestation from a test issuer, and the agent publishes on the relay', async () => {
  const dir = mkdtempSync(join(root, '.quickstart-'))
  // relay clock on real time: the agent in the text uses Date.now(), like any real agent
  const m = newWorld({ agora: Math.floor(Date.now() / 1000) })
  const server = createRelayServer({ rele: m.rele })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    writeFileSync(join(dir, QUICKSTART_KEYS_FILE), QUICKSTART_KEYS)
    writeFileSync(join(dir, QUICKSTART_AGENT_FILE), QUICKSTART_AGENT)

    // step 1: generate the keys
    const r1 = await run(dir, QUICKSTART_KEYS_FILE)
    assert.equal(r1.status, 0, r1.stderr)
    const publicItems = JSON.parse(r1.stdout)
    assert.deepEqual(Object.keys(publicItems).sort(), ['chaveAprovacao', 'chaveRede'])
    assert.match(publicItems.chaveRede, /^[A-Za-z0-9_-]{43}$/)
    assert.notEqual(publicItems.chaveRede, publicItems.chaveAprovacao)
    const keysFile = join(dir, 'chaves.json')
    assert.equal(statSync(keysFile).mode & 0o077, 0, 'the file with the seeds can be read only by its owner')
    assert.ok(!r1.stdout.includes('semente'), 'the output (what is sent to the issuer) must not carry a seed')

    // step 2: the issuer binds the @ to the two public keys and returns the attestation
    const uid = newUid()
    const handle = newHandle()
    const attestation = m.provedor.issue({ uid, handle, chave: publicItems.chaveRede, chaveAprovacao: publicItems.chaveAprovacao, emitidoEm: m.relogio.agora - 10 })
    assert.equal(attestation.uid, uid, 'the quickstart text reads `atestado.uid`')
    writeFileSync(join(dir, 'atestado.json'), JSON.stringify(attestation))

    // step 3: the agent
    const r2 = await run(dir, QUICKSTART_AGENT_FILE, { RN_RELE: base })
    assert.equal(r2.status, 0, r2.stderr)
    const [profileState, postState, idPost] = r2.stdout.trim().split(' ')
    assert.equal(profileState, 'aceito')
    assert.equal(postState, 'aceito')
    assert.match(idPost, /^ob_/)

    // what the agent published is really on the relay
    const object = await fetch(`${base}/v1/objetos/${idPost}`)
    assert.equal(object.status, 200)
    assert.equal((await object.json()).objeto.corpo.texto, 'Primeira publicação, aprovada por uma pessoa.')
    const profile = await fetch(`${base}/v1/handles/${handle}`)
    assert.equal(profile.status, 200)
    assert.equal((await profile.json()).uid, uid)
  } finally {
    await new Promise((ok) => { server.closeAllConnections(); server.close(ok) })
    rmSync(dir, { recursive: true, force: true })
  }
})

test('without the attestation, the relay refuses: the quickstart does not create a loose agent', async () => {
  const dir = mkdtempSync(join(root, '.quickstart-'))
  const m = newWorld({ agora: Math.floor(Date.now() / 1000) })
  const server = createRelayServer({ rele: m.rele })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    writeFileSync(join(dir, QUICKSTART_KEYS_FILE), QUICKSTART_KEYS)
    writeFileSync(join(dir, QUICKSTART_AGENT_FILE), QUICKSTART_AGENT)
    const k = await run(dir, QUICKSTART_KEYS_FILE)
    assert.equal(k.status, 0, k.stderr)
    const publicItems = JSON.parse(k.stdout)
    // attestation from an issuer the relay does not know
    const { TestProvider } = await import('../../packages/relay/src/test-provider.js')
    const other = new TestProvider()
    const fake = other.issue({ uid: newUid(), handle: newHandle(), chave: publicItems.chaveRede, chaveAprovacao: publicItems.chaveAprovacao, emitidoEm: m.relogio.agora - 10 })
    writeFileSync(join(dir, 'atestado.json'), JSON.stringify(fake))
    const r = await run(dir, QUICKSTART_AGENT_FILE, { RN_RELE: base })
    assert.notEqual(r.status, 0, 'an attestation from an unknown issuer cannot publish')
  } finally {
    await new Promise((ok) => { server.closeAllConnections(); server.close(ok) })
    rmSync(dir, { recursive: true, force: true })
  }
})
