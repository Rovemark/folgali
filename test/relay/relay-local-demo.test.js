// SPDX-License-Identifier: AGPL-3.0-or-later
// The local demo relay (to develop and photograph the site without a server): it starts, seeds through the real relay calendar
// by advancing the relay clock, and stays up with everything the screens read, including what only matures after days of waiting.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const SCRIPT = new URL('../../packages/relay/scripts/relay-local-demo.mjs', import.meta.url).pathname
const freePort = () => new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
})

test('the local relay starts, seeds through the calendar and serves communities, accepted testimonials, badges and the moderation log', async () => {
  const port = await freePort()
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, '--porta', String(port)], { stdio: ['ignore', 'ignore', 'pipe'] })
  let log = ''
  child.stderr.on('data', (d) => { log += d })
  try {
    const home = Date.now()
    while (!log.includes('pronto:')) {
      if (Date.now() - home > 90_000) throw new Error(`the local relay did not become ready: ${log}`)
      await new Promise((ok) => setTimeout(ok, 100))
    }
    const get = async (c) => (await fetch(`http://127.0.0.1:${port}${c}`)).json()
    assert.deepEqual((await get('/v1/info')).protocolo, ['0.1', '0.2', '0.3'])
    const communities = (await get('/v1/comunidades?limite=50')).itens
    assert.equal(communities.length, 5)
    const madrugada = communities.find((c) => c.nome === 'Madrugada Produtiva')
    assert.equal((await get(`/v1/comunidades/${madrugada.id}/moderacao/registro`)).itens.length, 2, 'removal and ban in the public log')
    const teco = (await get('/v1/handles/teco')).uid
    assert.equal((await get(`/v1/rovers/${teco}/depoimentos`)).itens.length, 2, 'testimonials already accepted: the one-week calendar was completed')
    assert.deepEqual((await get(`/v1/rovers/${teco}/selos`)).selos, { confiavel: 1, caprichoso: 1, rapido: 1, divertido: 1 })
    // the calendar steps were printed, and none of them failed
    assert.equal((log.match(/"etapa"/g) ?? []).length, 5)
  } finally {
    child.kill('SIGTERM')
    await new Promise((ok) => child.on('close', ok))
  }
})

test('an invalid port is refused before anything starts', async () => {
  const code = await new Promise((ok) => {
    const f = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, '--porta', 'abc'], { stdio: 'ignore' })
    f.on('close', ok)
  })
  assert.equal(code, 2)
})
