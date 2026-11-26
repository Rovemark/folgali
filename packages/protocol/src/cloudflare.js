// SPDX-License-Identifier: AGPL-3.0-or-later
// The real client address when the domain sits behind Cloudflare's proxy (used by the relay and by the open issuer).
//
// Path of a request in production: client -> Cloudflare edge -> our reverse proxy (Traefik) -> service. The service sees the
// connection from Traefik, and Traefik appends the address it saw (a Cloudflare EDGE) as the LAST X-Forwarded-For entry. Rate limits
// keyed on that address split one bucket among everyone who lands on the same edge.
//
// Rule: if the last X-Forwarded-For hop is inside Cloudflare's OFFICIAL ranges, the client is the `Cf-Connecting-Ip` header;
// otherwise that header is ignored. Someone who skips Cloudflare and talks to the server's IP arrives with their own address as the
// last hop (written by our proxy, not by them), so a forged `Cf-Connecting-Ip` never counts.
//
// This module stays OUT of the protocol index on purpose: it imports node:net and is not part of the protocol.
import { BlockList, isIP, isIPv4 } from 'node:net'

// Cloudflare's official ranges, copied on 2026-11-25 from https://www.cloudflare.com/ips/ (https://www.cloudflare.com/ips-v4 and
// https://www.cloudflare.com/ips-v6). Cloudflare announces changes ahead of time; the operator can replace the whole list with
// RELAY_CLOUDFLARE_RANGES / ISSUER_CLOUDFLARE_RANGES without a new image.
export const CLOUDFLARE_RANGES = Object.freeze([
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32'
])

const MAX_ADDRESS_LENGTH = 64

/** An address as text, without brackets or zone, with an IPv4-mapped IPv6 (::ffff:a.b.c.d) reduced to the IPv4. Null if not an IP. */
export function plainAddress(text) {
  if (typeof text !== 'string' || text.length > MAX_ADDRESS_LENGTH) return null
  const raw = text.trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  if (!isIP(raw)) return null
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(raw)
  return mapped ? mapped[1] : raw
}

/** Parses a comma separated list of CIDR ranges (IPv4 or IPv6). Throws with the variable name on the first bad entry. */
export function parseRanges(text, name) {
  const list = String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!list.length) throw new Error(`${name} precisa de ao menos uma faixa (por exemplo 173.245.48.0/20,2400:cb00::/32).`)
  for (const range of list) {
    const m = /^([^/]+)\/(\d{1,3})$/.exec(range)
    const family = m ? isIP(m[1]) : 0
    if (!family || Number(m[2]) > (family === 4 ? 32 : 128)) throw new Error(`${name} tem uma faixa inválida: "${range}". Use endereço/prefixo, como 173.245.48.0/20.`)
  }
  return [...new Set(list.map((r) => r.toLowerCase()))]
}

/** A matcher for a list of ranges: (address) => true when the address is inside one of them. */
export function rangeMatcher(ranges = CLOUDFLARE_RANGES) {
  const blocks = new BlockList()
  for (const range of ranges) {
    const [net, prefix] = range.split('/')
    blocks.addSubnet(net, Number(prefix), isIPv4(net) ? 'ipv4' : 'ipv6')
  }
  return (address) => {
    const ip = plainAddress(address)
    return ip !== null && blocks.check(ip, isIPv4(ip) ? 'ipv4' : 'ipv6')
  }
}

/**
 * Wraps the "behind our proxy" origin function (`hopOf`, which returns the last X-Forwarded-For hop or the connection address).
 * When that hop is a Cloudflare edge and `Cf-Connecting-Ip` holds a valid IP, the origin is that IP; in every other case it is the hop.
 */
export function cloudflareOrigin(hopOf, ranges = CLOUDFLARE_RANGES) {
  const isCloudflare = rangeMatcher(ranges)
  return (req) => {
    const hop = hopOf(req)
    if (!isCloudflare(hop)) return hop
    return plainAddress(req.headers['cf-connecting-ip']) ?? hop
  }
}

/**
 * Reads `<PREFIX>_CLOUDFLARE` (`sim`, `nao` or absent) and the optional `<PREFIX>_CLOUDFLARE_RANGES` override.
 * Returns null when off, or { ranges } when on. Any other value stops the service from starting.
 */
export function readCloudflareConfig(env, prefix) {
  const flag = env[`${prefix}_CLOUDFLARE`]
  const override = env[`${prefix}_CLOUDFLARE_RANGES`]
  if (!['', undefined, 'sim', 'nao'].includes(flag)) throw new Error(`${prefix}_CLOUDFLARE aceita só \`sim\` ou \`nao\` (ou fique de fora).`)
  if (flag !== 'sim') {
    if (override !== undefined && override !== '') throw new Error(`${prefix}_CLOUDFLARE_RANGES só vale com ${prefix}_CLOUDFLARE=sim.`)
    return null
  }
  if (env[`${prefix}_TRUST_PROXY`] !== 'sim') {
    throw new Error(`${prefix}_CLOUDFLARE=sim precisa de ${prefix}_TRUST_PROXY=sim: só o salto escrito pelo seu proxy diz se o pedido veio da Cloudflare.`)
  }
  return { ranges: override === undefined || override === '' ? CLOUDFLARE_RANGES : parseRanges(override, `${prefix}_CLOUDFLARE_RANGES`) }
}
