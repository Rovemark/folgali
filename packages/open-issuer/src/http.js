// SPDX-License-Identifier: AGPL-3.0-or-later
// The HTTP layer of the open issuer service (node:http, no framework). The same rules as the relay:
//   - body with a byte ceiling, strict JSON, required content type, route by a closed table;
//   - an error always in the format { erro: { codigo, mensagem, campo? } }, with no stack and no echo of what was sent;
//   - the log receives only method, route (the pattern, never the path: the link's secret lives in the path), status and duration;
//   - per-origin burst limit in memory. No address goes to disk.
// Routes: /v1/agentes/... (registro, eu, atos, info, emissores.json, reivindicacoes/:segredo, :uid) and /saude.
import { createServer } from 'node:http'
import { ProtocolError, LIMITS, DEFAULT_BURST, PROTOCOL_VERSION } from '../../protocol/src/index.js'
import { cloudflareOrigin } from '../../protocol/src/cloudflare.js'

const URL_LIMIT = 2048

const send = (res, status, body, extra = {}) => {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-rover-protocolo': PROTOCOL_VERSION,
    ...extra
  })
  res.end(text)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\s*(;|$)/i.test(String(req.headers['content-type'] ?? ''))) return reject(new ProtocolError('tipo_de_conteudo'))
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > LIMITS.corpoHttpBytes) return reject(new ProtocolError('corpo_grande'))
    const chunks = []
    let total = 0
    req.on('data', (p) => {
      total += p.length
      if (total > LIMITS.corpoHttpBytes) { reject(new ProtocolError('corpo_grande')); req.destroy(); return }
      chunks.push(p)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new ProtocolError('json_invalido')) }
    })
    req.on('error', () => reject(new ProtocolError('json_invalido')))
  })
}

/** Token bucket per origin, in memory only: `capacidade` requests at once, refill of `perSecond`. */
export function tokenBucket({ capacity, perSecond, relogio: clock = () => Date.now() / 1000, teto: cap = 50_000 }) {
  const map = new Map()
  return (origin) => {
    const now = clock()
    const old = map.get(origin)
    const tokens = old ? Math.min(capacity, old.fichas + (now - old.em) * perSecond) : capacity
    map.delete(origin)
    if (map.size >= cap) map.delete(map.keys().next().value)
    if (tokens < 1) { map.set(origin, { fichas: tokens, em: now }); return Math.ceil((1 - tokens) / perSecond) }
    map.set(origin, { fichas: tokens - 1, em: now })
    return 0
  }
}

/** The origin of a request: the connection address, or, behind a proxy of your own, the last X-Forwarded-For. */
export const directOrigin = (req) => req.socket.remoteAddress ?? 'desconhecida'
export const proxyOrigin = (req) => {
  const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return xff.at(-1) ?? directOrigin(req)
}

/**
 * The origin function for the service, from the configuration (readConfig): the connection address; behind our proxy, the last
 * X-Forwarded-For; behind Cloudflare too, `Cf-Connecting-Ip` when that last hop is a Cloudflare edge. The registration limit then
 * groups IPv6 by /64 (originKey), whichever address wins here.
 */
export function issuerOriginFrom({ trustProxy = false, cloudflare = null } = {}) {
  if (!trustProxy) return directOrigin
  return cloudflare ? cloudflareOrigin(proxyOrigin, cloudflare.ranges) : proxyOrigin
}

/**
 * The request handler (req, res). It is kept apart from the server so a test can put it behind https.
 * @param {import('./issuer.js').OpenIssuer} emissor
 */
export function issuerHandler(issuer, { registrar: register = () => {}, rajada: burst = DEFAULT_BURST, origemDe: originOf = directOrigin, burstClock } = {}) {
  const attempt = tokenBucket({ ...burst, relogio: burstClock })
  const credentialOf = (req) => (req.headers.authorization === undefined ? null : { header: req.headers.authorization, metodo: req.method, alvo: req.url })
  const routes = [
    ['GET', /^\/saude$/, '/saude', () => [200, issuer.health()]],
    ['POST', /^\/v1\/agentes\/registro$/, '/v1/agentes/registro', async (req) => [201, await issuer.registrar(await readBody(req), { origem: originOf(req) })]],
    ['GET', /^\/v1\/agentes\/eu$/, '/v1/agentes/eu', (req) => [200, issuer.eu(credentialOf(req))]],
    ['POST', /^\/v1\/agentes\/atos$/, '/v1/agentes/atos', async (req) => [200, await issuer.agir(await readBody(req))]],
    ['GET', /^\/v1\/agentes\/info$/, '/v1/agentes/info', () => [200, issuer.info()]],
    ['GET', /^\/v1\/agentes\/emissores\.json$/, '/v1/agentes/emissores.json', () => [200, issuer.revokedList()]],
    ['GET', /^\/v1\/agentes\/reivindicacoes\/([^/]+)$/, '/v1/agentes/reivindicacoes/:segredo', (req, m) => [200, issuer.reivindicacao(m[1])]],
    ['GET', /^\/v1\/agentes\/([^/]+)$/, '/v1/agentes/:uid', (req, m) => [200, issuer.publico(m[1])]]
  ]
  return async (req, res) => {
    const home = process.hrtime.bigint()
    let routeName = '?'
    let status
    try {
      const wait = attempt(originOf(req))
      if (wait > 0) throw new ProtocolError('limite_de_taxa', { retryAfterS: wait })
      if (req.url.length > URL_LIMIT) throw new ProtocolError('nao_encontrado')
      let path
      try { path = new URL(req.url, 'http://emissor.local').pathname } catch { throw new ProtocolError('nao_encontrado') }
      const candidates = routes.filter(([, re]) => re.test(path))
      const route = candidates.find(([method]) => method === req.method)
      if (!route) throw new ProtocolError(candidates.length ? 'metodo_nao_permitido' : 'nao_encontrado')
      routeName = route[2]
      const m = route[1].exec(path).map((p, i) => {
        if (!i) return p
        try { return decodeURIComponent(p) } catch { throw new ProtocolError('nao_encontrado') }
      })
      const [code, body] = await route[3](req, m)
      status = code
      send(res, code, body)
    } catch (e) {
      const error = e instanceof ProtocolError ? e : null
      status = error?.status ?? 500
      if (!error) register({ nivel: 'erro', evento: 'erro_interno', tipo: e?.name ?? 'Error' })
      send(res, status, (error ?? new ProtocolError('erro_interno')).toJson(), error?.retryAfterS ? { 'retry-after': String(error.retryAfterS) } : {})
    } finally {
      register({ nivel: 'info', evento: 'pedido', metodo: req.method, rota: routeName, status, ms: Number((process.hrtime.bigint() - home) / 1_000_000n) })
    }
  }
}

export function createIssuerServer(issuer, options = {}) {
  const server = createServer(issuerHandler(issuer, options))
  server.requestTimeout = 10_000
  server.headersTimeout = 5_000
  server.keepAliveTimeout = 5_000
  return server
}
