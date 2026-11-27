// SPDX-License-Identifier: AGPL-3.0-or-later
// The key with which the issuer (and the relay behind Cloudflare) counts the registrations from a connection origin (Rovemark's decision, 2026-11-24):
//   - IPv4: the address;
//   - IPv6: the /64 block (the first four groups). A provider hands each customer a whole /64, so counting by address
//     would let a single customer register 2^64 times;
//   - IPv4 inside IPv6 (::ffff:a.b.c.d, as Node shows IPv4 connections on a dual-stack socket): the IPv4;
//   - anything else (the unknown origin, a name): as it came.
// The key stays in memory only, like the origin.
import { isIPv4, isIPv6 } from 'node:net'

/** The eight groups of a valid IPv6, as numbers. */
function groups(ip) {
  let text = ip
  const extra = []
  // IPv4 embedded at the end (2001:db8::1.2.3.4): becomes the last two groups
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)
  if (v4) {
    const [a, b, c, d] = v4[1].split('.').map(Number)
    extra.push((a << 8) | b, (c << 8) | d)
    text = text.slice(0, -v4[1].length)
    if (text.endsWith(':') && !text.endsWith('::')) text = text.slice(0, -1)
  }
  const [sch, dir] = text.includes('::') ? text.split('::') : [text, null]
  const part = (s) => (s ? s.split(':').filter((x) => x !== '').map((h) => parseInt(h, 16)) : [])
  const a = part(sch)
  const b = [...part(dir), ...extra]
  const middle = dir === null ? [] : new Array(8 - a.length - b.length).fill(0)
  return [...a, ...middle, ...b]
}

export function originKey(origin) {
  const rawValue = String(origin)
  const ip = rawValue.replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  if (isIPv4(ip)) return ip
  if (!isIPv6(ip)) return rawValue
  const g = groups(ip.toLowerCase())
  // ::ffff:a.b.c.d (mapped IPv4): counts as the IPv4
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.')
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`
}

/**
 * Every block an origin counts in, from the narrowest: IPv4 and anything else only in its own key; IPv6 in its /64, its /56 and its /48.
 * A /48 is what a free tunnel or a small host hands a single customer (65 536 blocks /64), so a ceiling that only counts /64 lets one
 * customer register 65 536 times as much. The open issuer counts its registrations in all three (OPEN_ISSUER.perBlock).
 * @returns {Array<{ key: string, prefix: 32 | 48 | 56 | 64 }>}  prefix 32 stands for "the key itself" (IPv4 or not an address)
 */
export function originBlocks(origin) {
  const key = originKey(origin)
  if (!key.endsWith('::/64')) return [{ key, prefix: 32 }]
  const g = groups(String(origin).replace(/^\[|\]$/g, '').replace(/%.*$/, '').toLowerCase())
  const hex = (xs) => xs.map((x) => x.toString(16)).join(':')
  return [
    { key, prefix: 64 },
    { key: `${hex([g[0], g[1], g[2], g[3] & 0xff00])}::/56`, prefix: 56 },
    { key: `${hex(g.slice(0, 3))}::/48`, prefix: 48 }
  ]
}
