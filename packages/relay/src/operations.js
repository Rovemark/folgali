// SPDX-License-Identifier: AGPL-3.0-or-later
// OPERATIONS layer of the hosted relay: what the reference relay leaves to whoever puts it behind a proxy.
// It does not touch the protocol rules or http.js. It wraps the server that `createRelayServer` returns and adds:
//   - the origin of each request from the proxy's X-Forwarded-For, so the per-origin burst limit does not fall into a single bucket (the proxy's),
//     and, behind Cloudflare (RELAY_CLOUDFLARE=sim), from Cf-Connecting-Ip when the last hop is one of its edges;
//   - closed CORS: only the listed origins get browser permission; the rest of the world (other servers, the app)
//     does not depend on CORS and goes on as normal;
//   - security headers on every response;
//   - administration (/v1/admin) disappears for whoever arrives through the proxy: it only answers whoever talks directly to the container;
//   - the discovery document /.well-known/rover-network.
// Nothing here reads a body, writes a log or stores an address.
import { ProtocolError, PROTOCOL_VERSION } from '../../protocol/src/index.js'
import { cloudflareOrigin, readCloudflareConfig } from '../../protocol/src/cloudflare.js'
import { originKey } from '../../protocol/src/origin.js'
import { videoStorageOf } from './storage.js'

const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i
const DISCOVERY_PATH = '/.well-known/rover-network'
const SIX_MONTHS_S = 15_552_000

/** Reads a comma-separated list of origins. An origin is scheme, host and port: no slash, no path, no wildcard. */
export function readOrigins(text) {
  const list = String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const o of list) {
    if (!ORIGIN_RE.test(o)) throw new Error(`origem de CORS inválida: "${o}". Use esquema e host, como https://rede.exemplo.com, sem barra no fim e sem curinga.`)
  }
  return [...new Set(list.map((o) => o.toLowerCase()))]
}

/**
 * Who the author of the request is, for the burst limit. Behind a trusted proxy, it is the LAST address in X-Forwarded-For (the one the nearest
 * proxy added: what came before may have been written by the client). Without the header, the connection counts.
 */
export function proxyOrigin(req) {
  const header = req.headers['x-forwarded-for']
  if (typeof header === 'string') {
    const last = header.split(',').pop().trim()
    if (last && last.length <= 64) return last
  }
  return req.socket.remoteAddress ?? 'desconhecida'
}

/**
 * The origin function for the hosted relay, from its environment:
 *   - without RELAY_TRUST_PROXY=sim: null (the relay keeps the connection address);
 *   - with it: the last X-Forwarded-For (proxyOrigin);
 *   - with RELAY_CLOUDFLARE=sim too: `Cf-Connecting-Ip` when that last hop is a Cloudflare edge (packages/protocol/src/cloudflare.js),
 *     and an IPv6 client counts by its /64 block, as the open issuer already does: behind Cloudflare each visitor has its own address,
 *     and one provider hands a whole /64 to each customer.
 * Throws (and the relay does not start) on a bad RELAY_CLOUDFLARE or RELAY_CLOUDFLARE_RANGES.
 */
export function relayOriginFrom(env) {
  const cloudflare = readCloudflareConfig(env, 'RELAY')
  if (env.RELAY_TRUST_PROXY !== 'sim') return null
  if (!cloudflare) return proxyOrigin
  const fromCloudflare = cloudflareOrigin(proxyOrigin, cloudflare.ranges)
  return (req) => originKey(fromCloudflare(req))
}

/** Whoever arrived through a proxy carries at least one of these headers; whoever talks directly to the container carries none. */
const cameViaProxy = (req) => ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded'].some((h) => req.headers[h] !== undefined)

const SECURITY_HEADERS = Object.freeze({
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-site',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
})

const json = (res, status, body, extra = {}) => {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-rover-protocolo': PROTOCOL_VERSION,
    ...extra
  })
  res.end(text)
}

/**
 * Wraps `server` (the `http.Server` from createRelayServer). Call it AFTER createRelayServer and before or after listen().
 * @param {import('node:http').Server} server
 * @param {object} o
 * @param {string[]} [o.allowedOrigins]   origins with CORS permission; empty = nobody (no CORS header is sent)
 * @param {boolean} [o.behindProxy]       true when the TLS and the public port belong to a proxy we control
 * @param {() => object} [o.descoberta]   returns the /.well-known/rover-network document; without it the route does not exist
 */
export function operate(server, { allowedOrigins = [], behindProxy = false, descoberta: discovery = null } = {}) {
  const allowed = new Set(allowedOrigins)
  const originals = server.listeners('request')
  server.removeAllListeners('request')

  server.on('request', (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value)
    if (behindProxy) res.setHeader('strict-transport-security', `max-age=${SIX_MONTHS_S}`)
    if (allowed.size) res.setHeader('vary', 'Origin')

    const origin = typeof req.headers.origin === 'string' ? req.headers.origin.toLowerCase() : null
    const originOk = origin !== null && allowed.has(origin)

    // Browser preflight: answers here, without touching the relay and without spending the burst.
    if (req.method === 'OPTIONS' && origin !== null && req.headers['access-control-request-method'] !== undefined) {
      if (!originOk) {
        return json(res, 403, { erro: { codigo: 'origem_nao_permitida', mensagem: 'Esta origem não pode chamar o relé pelo navegador.' } })
      }
      res.writeHead(204, {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-max-age': '600',
        vary: 'Origin'
      })
      return res.end()
    }
    if (originOk) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('access-control-expose-headers', 'retry-after, x-rover-protocolo')
    }

    const path = (req.url ?? '').split('?')[0]

    if (behindProxy && (path === '/v1/admin' || path.startsWith('/v1/admin/')) && cameViaProxy(req)) {
      return json(res, 404, new ProtocolError('nao_encontrado').toJson())
    }

    if (discovery && path === DISCOVERY_PATH) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, new ProtocolError('metodo_nao_permitido').toJson(), { allow: 'GET, HEAD' })
      const text = JSON.stringify(discovery())
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(text),
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'"
      })
      return res.end(req.method === 'HEAD' ? undefined : text)
    }

    for (const listener of originals) listener.call(server, req, res)
  })
  return server
}

/** 0.6.0: `RELAY_STANDING_AUTHORIZATION`: absent or `sim` turns it on (the 0.6.0 default), `nao` turns it off, any other value is an error. */
export function standingAuthorizationOf(env) {
  if (!['', undefined, 'sim', 'nao'].includes(env.RELAY_STANDING_AUTHORIZATION)) throw new Error('RELAY_STANDING_AUTHORIZATION aceita só `sim` ou `nao` (ou fique de fora: ligada).')
  return env.RELAY_STANDING_AUTHORIZATION !== 'nao'
}

/**
 * 0.6.0: `RELAY_AGENT_ISSUERS`: the keys of the OPEN issuers (services for outside agents), comma-separated. Each one must be in
 * `RELAY_ISSUERS`: the outside-agent badge only counts for whoever the relay already trusts. Absent or empty: none.
 */
export function agentIssuersOf(env, issuers) {
  const list = (env.RELAY_AGENT_ISSUERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const e of list) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(e)) throw new Error('RELAY_AGENT_ISSUERS tem uma chave que não é uma chave pública em base64url (43 caracteres).')
    if (!issuers.includes(e)) throw new Error('RELAY_AGENT_ISSUERS tem uma chave que não está em RELAY_ISSUERS.')
  }
  return [...new Set(list)]
}

/**
 * 0.7.0: `RELAY_PEOPLE_ISSUERS`: the keys of the PEOPLE ISSUERS (at folgali, the Rovemark login), comma-separated. Each one must
 * be in `RELAY_ISSUERS` and cannot also be an open agent issuer: an issuer attests a single kind. Absent or empty: none.
 */
export function personIssuersOf(env, issuers, agentIssuers = []) {
  const list = (env.RELAY_PEOPLE_ISSUERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const e of list) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(e)) throw new Error('RELAY_PEOPLE_ISSUERS tem uma chave que não é uma chave pública em base64url (43 caracteres).')
    if (!issuers.includes(e)) throw new Error('RELAY_PEOPLE_ISSUERS tem uma chave que não está em RELAY_ISSUERS.')
    if (agentIssuers.includes(e)) throw new Error('RELAY_PEOPLE_ISSUERS tem uma chave que também está em RELAY_AGENT_ISSUERS: um emissor atesta uma espécie só.')
  }
  return [...new Set(list)]
}

/**
 * 0.10.1: `RELAY_VERIFIED_ISSUERS`: issuers whose accounts skip the account-age wait and the new-account rate factor (on folgali,
 * the Rover Hangar issuer and the Rovemark person issuer), comma separated. Each one must be in `RELAY_ISSUERS` and must not be an
 * open issuer of outside agents. Missing or empty: none, every account waits.
 */
export function verifiedIssuersOf(env, issuers, agentIssuers = []) {
  const list = (env.RELAY_VERIFIED_ISSUERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const e of list) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(e)) throw new Error('RELAY_VERIFIED_ISSUERS tem uma chave que não é uma chave pública em base64url (43 caracteres).')
    if (!issuers.includes(e)) throw new Error('RELAY_VERIFIED_ISSUERS tem uma chave que não está em RELAY_ISSUERS.')
    if (agentIssuers.includes(e)) throw new Error('RELAY_VERIFIED_ISSUERS tem uma chave que também está em RELAY_AGENT_ISSUERS: emissor aberto não é verificado.')
  }
  return [...new Set(list)]
}

/**
 * 0.7.0: `RELAY_LEAK_FILTER`: absent or `sim` turns it on (the default), `nao` turns it off, any other value is an error.
 * Rovemark decision of 2026-11-24, evening (proposal 0009, question 7): turning it off is an option only for a THIRD-PARTY relay. The folgali
 * reference relay declares itself with `RELAY_REFERENCE=sim` and, with it, `nao` stops the relay from starting.
 */
export function leakFilterOf(env) {
  if (!['', undefined, 'sim', 'nao'].includes(env.RELAY_LEAK_FILTER)) throw new Error('RELAY_LEAK_FILTER aceita só `sim` ou `nao` (ou fique de fora: ligado).')
  if (!['', undefined, 'sim', 'nao'].includes(env.RELAY_REFERENCE)) throw new Error('RELAY_REFERENCE aceita só `sim` ou `nao`.')
  if (env.RELAY_REFERENCE === 'sim' && env.RELAY_LEAK_FILTER === 'nao') {
    throw new Error('O relé de referência da folgali (RELAY_REFERENCE=sim) não desliga o filtro de vazamento: tire RELAY_LEAK_FILTER=nao.')
  }
  return env.RELAY_LEAK_FILTER !== 'nao'
}

/**
 * 0.11.0 part 3: `RELAY_VIDEO` and the video store, the same for `bin/relay.js` and `bin/hosted-relay.js`. Returns the `video` option of
 * the media (or null when video is off). `sim` needs `RELAY_MEDIA=sim`; another value is an error. The store is the disk
 * (`<RELAY_MEDIA_DIR>/video`) or, with `RELAY_MEDIA_S3_ENDPOINT`, `_BUCKET`, `_KEY` and `_SECRET`, an S3-compatible store (storage.js).
 * `RELAY_VIDEO_QUOTA_MB` is the ceiling of all the video kept (default 20480). Throws (and the relay does not start) on a bad value.
 * @param {Record<string, string | undefined>} env
 * @param {string} mediaDir
 * @param {(e: object) => void} [registrar]
 */
export function videoOf(env, mediaDir, register = () => {}) {
  if (!['', undefined, 'sim', 'nao'].includes(env.RELAY_VIDEO)) throw new Error('RELAY_VIDEO aceita só `sim` ou `nao` (ou fique de fora).')
  if (env.RELAY_VIDEO !== 'sim') return null
  if (env.RELAY_MEDIA !== 'sim') throw new Error('RELAY_VIDEO=sim precisa de RELAY_MEDIA=sim.')
  const quota = env.RELAY_VIDEO_QUOTA_MB === undefined || env.RELAY_VIDEO_QUOTA_MB === '' ? 20480 : Number(env.RELAY_VIDEO_QUOTA_MB)
  if (!Number.isSafeInteger(quota) || quota < 1) throw new Error('RELAY_VIDEO_QUOTA_MB precisa ser um número inteiro de MiB, de 1 para cima.')
  return {
    deposito: videoStorageOf(env, mediaDir),
    cotaBytes: quota * 1048576,
    onFail: (e) => register({ nivel: 'erro', evento: 'video_deposito', ...e })
  }
}

/** Checks the video store at start and logs it (never the key nor the secret): `video_deposito_ok` or `video_deposito_falhou`. */
export function checkVideoStorage(relay, register) {
  if (!relay.videos) return Promise.resolve()
  return relay.videos.deposito.check()
    .then(() => register({ nivel: 'info', evento: 'video_deposito_ok', ...relay.videos.deposito.descricao() }))
    .catch((e) => register({ nivel: 'erro', evento: 'video_deposito_falhou', destino: relay.videos.deposito.nome, erro: e?.message ?? String(e) }))
}
