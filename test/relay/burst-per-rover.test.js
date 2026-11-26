// SPDX-License-Identifier: AGPL-3.0-or-later
// Proposal 0014: the site's server carries the signed reads of every signed-in person from ONE address. A request whose read or upload
// credential verifies pays the burst on that rover's own bucket; anything else (no credential, a forged or stale one) pays on the
// address, as before, and an address that keeps sending credentials that do not verify stops getting them checked first.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createSendCredential, createReadCredential } from '../../packages/protocol/src/index.js'
import { TokenBucket } from '../../packages/relay/src/rate-limit.js'
import { credentialOf, registeredRover } from '../helpers/test-relay.js'
import { start } from '../helpers/test-server.js'

// Three tokens per bucket and no refill: the frozen burst clock makes every count exact.
const BURST = { capacity: 3, perSecond: 0.0001 }

async function environment() {
  const s = await start({ rajada: BURST, burstClock: () => 0 })
  const read = (rover, path) => s.call('GET', path, { cabecalhos: { authorization: credentialOf(s.m, rover, path) } })
  return { ...s, ler: read }
}

test('signed reads from one address: each rover has its own bucket; the unsigned ones share the address bucket', async () => {
  const s = await environment()
  try {
    const ana = registeredRover(s.m, { handle: 'ana.rover' })
    const beto = registeredRover(s.m, { handle: 'beto.rover' })
    const path = (r) => `/v1/rovers/${r.uid}/seguindo`
    for (let i = 0; i < 3; i++) assert.equal((await s.ler(ana, path(ana))).status, 200, `ana ${i}`)
    assert.equal((await s.ler(ana, path(ana))).status, 429, 'ana spent her own three')
    for (let i = 0; i < 3; i++) assert.equal((await s.ler(beto, path(beto))).status, 200, `beto ${i}: same address, his own bucket`)
    // the address bucket was never touched by the signed reads
    for (let i = 0; i < 3; i++) assert.equal((await s.call('GET', '/v1/info')).status, 200, `unsigned ${i}`)
    assert.equal((await s.call('GET', '/v1/info')).status, 429)
    assert.equal((await s.ler(beto, path(beto))).status, 429, 'beto spent his own three, not the address')
  } finally {
    await s.fechar()
  }
})

test('a forged, stale or unknown credential pays on the address; after the address spends its checks, a signature is not checked first', async () => {
  const s = await environment()
  try {
    const ana = registeredRover(s.m, { handle: 'ana.rover' })
    const intruder = registeredRover(s.m, { handle: 'intrusa.rover' })
    const target = `/v1/rovers/${ana.uid}/seguindo`
    // signed with another rover's key, in ana's name
    const forged = createReadCredential({ chavePrivada: intruder.rede.chavePrivada, uid: ana.uid, alvo: target, t: s.m.relogio.agora })
    const stale = credentialOf(s.m, ana, target, { t: s.m.relogio.agora - 3600 })
    const unknownOne = createReadCredential({ chavePrivada: intruder.rede.chavePrivada, uid: `rvr_${'A'.repeat(22)}`, alvo: target, t: s.m.relogio.agora })
    // each one goes past the burst on the address (the open graph answers the list anyway), and the fourth request does not
    for (const header of [forged, stale, unknownOne]) assert.notEqual((await s.call('GET', target, { cabecalhos: { authorization: header } })).status, 429)
    assert.equal((await s.call('GET', '/v1/info')).status, 429, 'the three paid on the address')
    // the address spent its three failed checks: from here a signature from it is not verified before the burst, even ana's valid one
    assert.equal((await s.ler(ana, target)).status, 429)
  } finally {
    await s.fechar()
  }
})

test('the upload credential counts too: a verified Rover-Envio pays on the rover, not on the address', async () => {
  const s = await environment()
  try {
    const ana = registeredRover(s.m, { handle: 'ana.rover' })
    for (let i = 0; i < 3; i++) assert.equal((await s.call('GET', '/v1/info')).status, 200)
    assert.equal((await s.call('GET', '/v1/info')).status, 429, 'the address is spent')
    const target = `/v1/midia/${'a'.repeat(64)}`
    const header = createSendCredential({ chavePrivada: ana.rede.chavePrivada, uid: ana.uid, alvo: target, t: s.m.relogio.agora })
    const r = await s.call('PUT', target, { cabecalhos: { authorization: header, 'content-type': 'image/png' }, bruto: Buffer.from('x') })
    assert.notEqual(r.status, 429, `the upload went past the burst on ana's bucket (got ${r.status} ${r.json?.erro?.codigo ?? ''})`)
  } finally {
    await s.fechar()
  }
})

test('BaldeDeFichas.temFicha looks without spending', () => {
  let now = 0
  const b = new TokenBucket({ capacity: 1, perSecond: 1, relogio: () => now })
  assert.equal(b.hasToken('x'), true)
  assert.equal(b.hasToken('x'), true, 'looking does not spend')
  assert.equal(b.attempt('x').ok, true)
  assert.equal(b.hasToken('x'), false)
  now = 1
  assert.equal(b.hasToken('x'), true, 'refilled')
})
