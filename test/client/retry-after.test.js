// SPDX-License-Identifier: AGPL-3.0-or-later
// `RelayError.retryAfterSegundos`: the `Retry-After` header reaches the agent. Before it, the client threw the header away and the
// agent only knew it had to wait, not for how long. Proof against the real relay (HTTP) and in the forms RFC 9110 allows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TestApprover, RoverClient, RelayError, NetworkReader } from '../../packages/client/src/index.js'
import { whatUnlocks } from '../../packages/protocol/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import * as A from '../helpers/image-samples.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'

async function environment(worldOptions = {}) {
  const m = newWorld(worldOptions)
  const server = createRelayServer({ rele: m.rele, rajada: { capacity: 100000, perSecond: 100000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  const newValue = () => {
    const rover = newRoverInWorld(m)
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    return { rover, cliente: new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: approver, relogio: clock }) }
  }
  return { m, base, novo: newValue, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}

const headers = (value) => new Headers(value === undefined ? {} : { 'retry-after': value })
const error = (value, nowMs) => new RelayError(429, { erro: { codigo: 'limite_de_taxa', mensagem: 'x' } }, headers(value), nowMs)

test('real relay: the rate-limit 429 carries retryAfterSegundos equal to what is left until the window opens', async () => {
  const e = await environment()
  try {
    const { cliente: client } = e.novo()
    await client.perfil({ nome: 'Pipa' })
    for (let i = 0; i < 10; i++) await client.postar({ texto: `postagem ${i}` })
    e.m.advance(600)
    const refusal = await client.postar({ texto: 'a décima primeira' }).then(() => null, (err) => err)
    assert.ok(refusal instanceof RelayError, String(refusal))
    assert.equal(refusal.status, 429)
    assert.equal(refusal.codigo, 'limite_de_taxa')
    assert.equal(refusal.retryAfterSegundos, 3600 - 600, 'the first post leaves the 1 hour window 3000 seconds from now')
    // 0.11.0: the JSON says the same wait, which limit it was and what unblocks it, and the client carries the three
    assert.equal(refusal.retryAfterS, 3600 - 600)
    assert.deepEqual(refusal.limite, { max: 10, janelaS: 3600 })
    assert.equal(refusal.libera, whatUnlocks('limite_de_taxa'))
    assert.match(refusal.message, /Limite de objetos do tipo postagem: 10 por hora\. Libera em 50 minutos\.$/)
    // error without the header: null, not 0 (0 would say "try now")
    const withoutHeader = await client.viewObject('ob_' + 'A'.repeat(43)).then(() => null, (err) => err)
    assert.ok(withoutHeader instanceof RelayError)
    assert.equal(withoutHeader.status, 404)
    assert.equal(withoutHeader.retryAfterSegundos, null)
    assert.deepEqual([withoutHeader.retryAfterS, withoutHeader.limite, withoutHeader.libera], [null, null, whatUnlocks('nao_encontrado')])
  } finally { await e.fechar() }
})

test('real relay: new account refused on image upload (403 conta_nova) carries how much is left', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-retry-midia-'))
  const e = await environment({ novatos: true, midia: { dir } })
  try {
    const { cliente: client } = e.novo()
    await client.perfil({ nome: 'Nina' })
    e.m.advance(100)
    const refusal = await client.uploadImage(A.gps_png).then(() => null, (err) => err)
    assert.ok(refusal instanceof RelayError, String(refusal))
    assert.equal(refusal.codigo, 'conta_nova')
    assert.ok(Number.isSafeInteger(refusal.retryAfterSegundos) && refusal.retryAfterSegundos > 0, String(refusal.retryAfterSegundos))
    e.m.advance(1)
    const after = await client.uploadImage(A.gps_png).then(() => null, (err) => err)
    assert.equal(after.retryAfterSegundos, refusal.retryAfterSegundos - 1, 'one second later, one second less is left')
  } finally { await e.fechar(); rmSync(dir, { recursive: true, force: true }) }
})

test('anonymous reader: an exceeded per-origin burst carries retryAfterSegundos', async () => {
  const m = newWorld()
  const server = createRelayServer({ rele: m.rele, rajada: { capacity: 1, perSecond: 0.01 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  try {
    const reader = new NetworkReader({ base: `http://127.0.0.1:${server.address().port}` })
    await reader.info()
    const refusal = await reader.info().then(() => null, (err) => err)
    assert.ok(refusal instanceof RelayError, String(refusal))
    assert.equal(refusal.status, 429)
    assert.ok(Number.isSafeInteger(refusal.retryAfterSegundos) && refusal.retryAfterSegundos >= 1, String(refusal.retryAfterSegundos))
  } finally { await new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
})

test('the header forms: integer seconds, HTTP date, and everything else becomes null', () => {
  const now = Date.parse('2026-11-17T12:00:00Z')
  assert.equal(error('7', now).retryAfterSegundos, 7)
  assert.equal(error('0', now).retryAfterSegundos, 0)
  assert.equal(new RelayError(429, null, { get: () => ' 120 ' }, now).retryAfterSegundos, 120, 'surrounding space does not change the number (fetch Headers already trims; a header from another source may not trim)')
  assert.equal(error('Tue, 17 Nov 2026 12:01:30 GMT', now).retryAfterSegundos, 90, 'HTTP date: the seconds until it')
  assert.equal(error('Tue, 17 Nov 2026 12:00:00 GMT', now + 400).retryAfterSegundos, 0, 'date a fraction in the past: 0, never negative')
  assert.equal(error('Tue, 17 Nov 2026 12:00:01 GMT', now + 400).retryAfterSegundos, 1, 'a fraction of a second rounds up: waiting less would get another refusal')
  assert.equal(error('Mon, 16 Nov 2026 12:00:00 GMT', now).retryAfterSegundos, 0, 'date in the past: 0')
  assert.equal(error('Wed, 18 Nov 2026 12:00:00 GMT', now).retryAfterSegundos, 86400, 'a whole day: the math is milliseconds divided by 1000')
  for (const bad of ['', '   ', 'logo', '1.5', '-3', '+3', '1e3', '99999999999999999999', '12 13']) {
    assert.equal(error(bad, now).retryAfterSegundos, null, JSON.stringify(bad))
  }
  assert.equal(error(undefined, now).retryAfterSegundos, null, 'without the header')
  // without headers, or with an object that has no `get` (fake test response): null, without throwing
  assert.equal(new RelayError(503, null).retryAfterSegundos, null)
  // 0.11.0: a relay before it (or a body that is not the error JSON) leaves the three new fields null, without throwing
  const old = error('7', now)
  assert.deepEqual([old.libera, old.retryAfterS, old.limite], [null, null, null])
  assert.deepEqual([new RelayError(503, null).libera, new RelayError(503, null).retryAfterS, new RelayError(503, null).limite], [null, null, null])
  assert.equal(new RelayError(503, null, { 'retry-after': '5' }).retryAfterSegundos, null)
  assert.equal(new RelayError(503, null, { get: () => '5' }).retryAfterSegundos, 5)
  // the default clock is the current one: a date one minute from now gives about 60
  const oneMinute = new Date(Date.now() + 60_000).toUTCString()
  const s = new RelayError(429, null, headers(oneMinute)).retryAfterSegundos
  assert.ok(s >= 58 && s <= 61, String(s))
})
