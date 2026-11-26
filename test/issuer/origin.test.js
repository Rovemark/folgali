// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: the per-origin registration limit counts IPv4 by address and IPv6 by /64 block (Rovemark decision of 2026-11-24).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentRecord, generateKeyPair } from '../../packages/protocol/src/index.js'
import { originKey } from '../../packages/open-issuer/src/origin.js'
import { newHandle } from '../helpers/world.js'
import { codeAsync, newWorld } from '../helpers/test-relay.js'

test('IPv6: the same /64 gives the same key, in any spelling; the neighboring /64 gives another', () => {
  const same = ['2001:db8:1:2::1', '2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:DB8:1:2:AAAA::', '2001:0db8:0001:0002:0:0:0:7', '[2001:db8:1:2::9]', '2001:db8:1:2::9%en0', '2001:db8:1:2::1.2.3.4']
  for (const ip of same) assert.equal(originKey(ip), '2001:db8:1:2::/64', ip)
  // block edges: the last address of a /64 and the first of the next
  assert.equal(originKey('2001:db8:0:ffff:ffff:ffff:ffff:ffff'), '2001:db8:0:ffff::/64')
  assert.equal(originKey('2001:db8:1::'), '2001:db8:1:0::/64')
  assert.notEqual(originKey('2001:db8:1:2::1'), originKey('2001:db8:1:3::1'))
  assert.notEqual(originKey('2001:db8:1:2::1'), originKey('2001:db9:1:2::1'))
  // compression at the start, in the middle and at the end
  assert.equal(originKey('::1'), '0:0:0:0::/64')
  assert.equal(originKey('::'), '0:0:0:0::/64')
  assert.equal(originKey('fe80::1:2:3:4'), 'fe80:0:0:0::/64')
  assert.equal(originKey('1:2:3:4:5:6:7:8'), '1:2:3:4::/64')
  assert.equal(originKey('1:2:3::'), '1:2:3:0::/64')
  assert.equal(originKey('1::2:3:4:5:6:7'), '1:0:2:3::/64')
})

test('IPv4 stays by address, also when it arrives mapped in IPv6', () => {
  assert.equal(originKey('203.0.113.5'), '203.0.113.5')
  assert.notEqual(originKey('203.0.113.5'), originKey('203.0.113.6'))
  assert.equal(originKey('::ffff:203.0.113.5'), '203.0.113.5')
  assert.equal(originKey('::FFFF:203.0.113.5'), '203.0.113.5')
  assert.equal(originKey('::ffff:cb00:7105'), '203.0.113.5', 'the same one, in hexadecimal')
  assert.equal(originKey('0:0:0:0:0:ffff:203.0.113.255'), '203.0.113.255')
  // ::fffe:... is not mapped: it is IPv6
  assert.equal(originKey('::fffe:cb00:7105'), '0:0:0:0::/64')
})

test('what is not an address passes as it came', () => {
  for (const x of ['desconhecida', '', 'local', '2001:db8::zz', '999.1.1.1', 'a:b:c']) assert.equal(originKey(x), x)
  assert.equal(originKey(undefined), 'undefined')
})

const register = (m, origin) => {
  const network = generateKeyPair()
  return m.emissor.registrar({ registro: createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle: newHandle(), nome: 'Bot', criadoEm: m.relogio.agora }) }, { origem: origin })
}

test('at the issuer: three registrations from different addresses of the same /64 exhaust the hour for the whole block; the neighboring /64 and another IPv4 stay free', async () => {
  const m = newWorld({ openIssuer: true })
  for (const ip of ['2001:db8:5:6::1', '2001:db8:5:6::2', '2001:db8:5:6:ffff::3']) assert.equal((await register(m, ip)).situacao, 'aguardando-dono')
  assert.equal(await codeAsync(() => register(m, '2001:db8:5:6:abcd::99')), 'limite_de_taxa')
  assert.equal(await codeAsync(() => register(m, '[2001:DB8:5:6::7]')), 'limite_de_taxa')
  assert.equal((await register(m, '2001:db8:5:7::1')).situacao, 'aguardando-dono')
  for (const ip of ['198.51.100.1', '198.51.100.1', '198.51.100.1']) await register(m, ip)
  assert.equal(await codeAsync(() => register(m, '::ffff:198.51.100.1')), 'limite_de_taxa', 'the mapped IPv4 counts together with the IPv4')
  assert.equal((await register(m, '198.51.100.2')).situacao, 'aguardando-dono', 'a neighboring IPv4 is another origin')
})
