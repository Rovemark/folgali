// SPDX-License-Identifier: AGPL-3.0-or-later
// Behind Cloudflare: the client is `Cf-Connecting-Ip` only when the last X-Forwarded-For hop (the one our proxy wrote) is a Cloudflare
// edge. Anyone else who sends the header (straight to the server's IP) is counted by their own address.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CLOUDFLARE_RANGES, cloudflareOrigin, parseRanges, plainAddress, rangeMatcher, readCloudflareConfig } from '../../packages/protocol/src/cloudflare.js'

const req = (headers, remote = '10.0.1.18') => ({ headers, socket: { remoteAddress: remote } })
const lastHop = (r) => String(r.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean).at(-1) ?? r.socket.remoteAddress

test('the built-in list is the official one, IPv4 and IPv6, copied from https://www.cloudflare.com/ips/', () => {
  assert.equal(CLOUDFLARE_RANGES.length, 22)
  assert.equal(CLOUDFLARE_RANGES.filter((r) => r.includes(':')).length, 7)
  assert.ok(Object.isFrozen(CLOUDFLARE_RANGES))
  for (const r of ['173.245.48.0/20', '172.64.0.0/13', '104.16.0.0/13', '131.0.72.0/22', '2400:cb00::/32', '2a06:98c0::/29', '2c0f:f248::/32']) {
    assert.ok(CLOUDFLARE_RANGES.includes(r), r)
  }
})

test('rangeMatcher: edges of the ranges, IPv4 and IPv6, mapped IPv4 and garbage', () => {
  const cf = rangeMatcher()
  // 172.64.0.0/13 = 172.64.0.0 .. 172.71.255.255 (the edge seen in production was 172.64.222.179)
  assert.equal(cf('172.64.222.179'), true)
  assert.equal(cf('172.64.0.0'), true)
  assert.equal(cf('172.71.255.255'), true)
  assert.equal(cf('172.72.0.0'), false)
  assert.equal(cf('172.63.255.255'), false)
  // 173.245.48.0/20 = .48.0 .. .63.255
  assert.equal(cf('173.245.63.255'), true)
  assert.equal(cf('173.245.64.0'), false)
  assert.equal(cf('::ffff:172.64.222.179'), true, 'an IPv4 shown as IPv6 by a dual stack socket')
  assert.equal(cf('2606:4700:10::6816:1'), true)
  assert.equal(cf('2606:4701::1'), false)
  // 2a06:98c0::/29 covers 2a06:98c0:: .. 2a06:98c7:ffff:...
  assert.equal(cf('2a06:98c7:ffff::1'), true)
  assert.equal(cf('2a06:98c8::1'), false)
  assert.equal(cf('[2400:cb00::1]'), true)
  assert.equal(cf('10.0.1.18'), false, 'our own proxy is not Cloudflare')
  for (const bad of ['', 'desconhecida', '172.64.222', '172.64.222.179.1', null, undefined, 42, `${'1'.repeat(70)}`]) assert.equal(cf(bad), false, String(bad))
  // a custom list replaces the built-in one entirely
  const own = rangeMatcher(['198.51.100.0/24', '2001:db8::/32'])
  assert.deepEqual([own('198.51.100.7'), own('2001:db8::7'), own('172.64.222.179')], [true, true, false])
})

test('plainAddress: trims, drops brackets and zone, reduces mapped IPv4, refuses what is not an IP or is too long', () => {
  assert.equal(plainAddress(' 203.0.113.9 '), '203.0.113.9')
  assert.equal(plainAddress('[2001:db8::1]'), '2001:db8::1')
  assert.equal(plainAddress('fe80::1%en0'), 'fe80::1')
  assert.equal(plainAddress('::FFFF:203.0.113.9'), '203.0.113.9')
  assert.equal(plainAddress('::ffff:cb00:7109'), '::ffff:cb00:7109', 'the hex spelling is still a valid address')
  assert.equal(plainAddress('2001:db8::ffff:203.0.113.9'), '2001:db8::ffff:203.0.113.9', 'only the ::ffff: prefix is mapped')
  assert.equal(plainAddress('203.0.113.9, 198.51.100.1'), null, 'a list is not an address')
  assert.equal(plainAddress('a'.repeat(64)), null)
  assert.equal(plainAddress(` ${'2001:db8::1'.padStart(64, ' ')}`), null, 'more than 64 characters is ignored, even if it trims to an IP')
  assert.equal(plainAddress('2001:db8::1'.padStart(64, ' ')), '2001:db8::1', '64 characters still fit')
  assert.equal(plainAddress(['203.0.113.9']), null)
  assert.equal(plainAddress(undefined), null)
})

test('cloudflareOrigin: Cf-Connecting-Ip only counts when the last hop is a Cloudflare edge', () => {
  const origin = cloudflareOrigin(lastHop)
  // the production path: Traefik writes the edge as the last hop
  assert.equal(origin(req({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': '203.0.113.9' })), '203.0.113.9')
  assert.equal(origin(req({ 'x-forwarded-for': '198.51.100.1, 172.64.222.179', 'cf-connecting-ip': '203.0.113.9' })), '203.0.113.9')
  // IPv6 visitor through an IPv6 edge
  assert.equal(origin(req({ 'x-forwarded-for': '2606:4700:10::1', 'cf-connecting-ip': '2001:db8:1:2::9' })), '2001:db8:1:2::9')
  assert.equal(origin(req({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': '::ffff:203.0.113.9' })), '203.0.113.9')
  // forged: straight to the server's IP, the last hop is the attacker's own address
  assert.equal(origin(req({ 'x-forwarded-for': '198.51.100.66', 'cf-connecting-ip': '203.0.113.9' })), '198.51.100.66')
  // forged by writing a Cloudflare address BEFORE the real hop: only the last one counts
  assert.equal(origin(req({ 'x-forwarded-for': '172.64.222.179, 198.51.100.66', 'cf-connecting-ip': '203.0.113.9' })), '198.51.100.66')
  // from Cloudflare but with the header missing, empty, a list or garbage: the edge itself (never a crash, never the garbage)
  assert.equal(origin(req({ 'x-forwarded-for': '172.64.222.179' })), '172.64.222.179')
  assert.equal(origin(req({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': '' })), '172.64.222.179')
  assert.equal(origin(req({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': '203.0.113.9, 1.1.1.1' })), '172.64.222.179')
  assert.equal(origin(req({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': 'evil' })), '172.64.222.179')
  assert.equal(origin(req({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': ['203.0.113.9', '1.1.1.1'] })), '172.64.222.179')
  // no X-Forwarded-For at all: the connection, and the header is not trusted from a non Cloudflare connection
  assert.equal(origin(req({ 'cf-connecting-ip': '203.0.113.9' })), '10.0.1.18')
  // a custom list
  const own = cloudflareOrigin(lastHop, ['198.51.100.0/24'])
  assert.equal(own(req({ 'x-forwarded-for': '198.51.100.1', 'cf-connecting-ip': '203.0.113.9' })), '203.0.113.9')
  assert.equal(own(req({ 'x-forwarded-for': '172.64.222.179', 'cf-connecting-ip': '203.0.113.9' })), '172.64.222.179')
})

test('parseRanges: IPv4 and IPv6 CIDR, deduplicated and lower case; anything else stops the service', () => {
  assert.deepEqual(parseRanges(' 198.51.100.0/24 , 2001:DB8::/32,198.51.100.0/24,, ', 'X'), ['198.51.100.0/24', '2001:db8::/32'])
  assert.deepEqual(parseRanges('0.0.0.0/0,::/0,203.0.113.9/32,2001:db8::1/128', 'X'), ['0.0.0.0/0', '::/0', '203.0.113.9/32', '2001:db8::1/128'])
  for (const bad of ['', ' , ', '198.51.100.0', '198.51.100.0/33', '2001:db8::/129', 'exemplo.com/24', '198.51.100.0/24/1', '/24', '198.51.100.0/x', '198.51.100.0/1234']) {
    assert.throws(() => parseRanges(bad, 'RELAY_CLOUDFLARE_RANGES'), /RELAY_CLOUDFLARE_RANGES/, bad)
  }
  assert.throws(() => parseRanges(undefined, 'X'), /ao menos uma faixa/)
  assert.throws(() => parseRanges('198.51.100.0/33', 'X'), /faixa inválida: "198.51.100.0\/33"/)
})

test('readCloudflareConfig: off by default, on only with the proxy trusted, override replaces the list', () => {
  assert.equal(readCloudflareConfig({}, 'RELAY'), null)
  assert.equal(readCloudflareConfig({ RELAY_CLOUDFLARE: '' }, 'RELAY'), null)
  assert.equal(readCloudflareConfig({ RELAY_CLOUDFLARE: 'nao', RELAY_TRUST_PROXY: 'sim' }, 'RELAY'), null)
  assert.equal(readCloudflareConfig({ RELAY_CLOUDFLARE: 'nao', RELAY_CLOUDFLARE_RANGES: '' }, 'RELAY'), null)
  assert.deepEqual(readCloudflareConfig({ RELAY_CLOUDFLARE: 'sim', RELAY_TRUST_PROXY: 'sim' }, 'RELAY'), { ranges: CLOUDFLARE_RANGES })
  assert.deepEqual(readCloudflareConfig({ RELAY_CLOUDFLARE: 'sim', RELAY_TRUST_PROXY: 'sim', RELAY_CLOUDFLARE_RANGES: '' }, 'RELAY'), { ranges: CLOUDFLARE_RANGES })
  assert.deepEqual(readCloudflareConfig({ ISSUER_CLOUDFLARE: 'sim', ISSUER_TRUST_PROXY: 'sim', ISSUER_CLOUDFLARE_RANGES: '198.51.100.0/24' }, 'ISSUER'), { ranges: ['198.51.100.0/24'] })
  assert.throws(() => readCloudflareConfig({ RELAY_CLOUDFLARE: 'talvez' }, 'RELAY'), /RELAY_CLOUDFLARE aceita só/)
  assert.throws(() => readCloudflareConfig({ RELAY_CLOUDFLARE: 'SIM', RELAY_TRUST_PROXY: 'sim' }, 'RELAY'), /RELAY_CLOUDFLARE aceita só/)
  assert.throws(() => readCloudflareConfig({ RELAY_CLOUDFLARE: 'sim' }, 'RELAY'), /precisa de RELAY_TRUST_PROXY=sim/)
  assert.throws(() => readCloudflareConfig({ RELAY_CLOUDFLARE: 'sim', RELAY_TRUST_PROXY: 'nao' }, 'RELAY'), /precisa de RELAY_TRUST_PROXY=sim/)
  assert.throws(() => readCloudflareConfig({ ISSUER_CLOUDFLARE: 'sim', RELAY_TRUST_PROXY: 'sim' }, 'ISSUER'), /ISSUER_TRUST_PROXY=sim/)
  assert.throws(() => readCloudflareConfig({ RELAY_CLOUDFLARE_RANGES: '198.51.100.0/24' }, 'RELAY'), /só vale com RELAY_CLOUDFLARE=sim/)
  assert.throws(() => readCloudflareConfig({ RELAY_CLOUDFLARE: 'nao', RELAY_CLOUDFLARE_RANGES: '198.51.100.0/24' }, 'RELAY'), /só vale com/)
  assert.throws(() => readCloudflareConfig({ RELAY_CLOUDFLARE: 'sim', RELAY_TRUST_PROXY: 'sim', RELAY_CLOUDFLARE_RANGES: 'x' }, 'RELAY'), /RELAY_CLOUDFLARE_RANGES tem uma faixa inválida/)
})
