// SPDX-License-Identifier: AGPL-3.0-or-later
// HTTP layer of the reference relay (node:http, no framework). Rules of this layer:
//   - nothing that comes from the client is trusted: body with a byte cap, strict JSON, required content type, route from a closed table;
//   - an error always has the format { erro: { codigo, mensagem, campo? } }, with no stack and no echo of what was sent;
//   - the log receives only method, route (the pattern, never the path with ids), status and duration. Never IP, header, body or secret;
//   - in-memory burst limit per origin; the admin credential is compared in constant time and the route disappears if it is short.
import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import {
  MEDIA_CACHE, PUBLIC_KEY_RE, ProtocolError, MEDIA_HASH_RE, ID_RE, LIMITS, MEDIA_LIMITS, DEFAULT_PAGE, DEFAULT_BURST, UID_RE, PROTOCOL_VERSION,
  uploadCredentialMatches, readCredentialMatches, readUploadCredential, readReadCredential
} from '../../protocol/src/index.js'
import { TokenBucket } from './rate-limit.js'
import { MEMORIES } from './social-memories.js'

const MIN_ADMIN_TOKEN_LENGTH = 32
const URL_LIMIT = 2048

/**
 * Marks a request that must get exactly the answer of a route that does not exist (operations.js sets it for /v1/admin behind the proxy).
 * The request still goes through this layer, so the burst, the headers, the body and the log line are those of an unknown route.
 */
export const HIDDEN_ROUTE = Symbol.for('folgali.relay.hiddenRoute')

/**
 * The path of a request, or null when it is not in its one canonical form: not starting with `/`, a dot segment (`.`, `..`, `%2e`), an
 * encoded slash or backslash (`%2f`, `%5c`), a backslash, a double slash, or anything else `new URL()` would rewrite. Every rule that looks
 * at the path (the proxy rule in operations.js and the route table here) sees the same string, and a path that changes on normalization
 * is no route at all.
 * @param {string | undefined} raw  `req.url`
 * @returns {string | null}
 */
export function requestPath(raw) {
  const text = String(raw ?? '')
  const q = text.indexOf('?')
  const path = q < 0 ? text : text.slice(0, q)
  if (!path.startsWith('/') || path.includes('//') || path.includes('\\') || /%(2f|5c)/i.test(path)) return null
  let normalized
  try { normalized = new URL(text, 'http://relay.local').pathname } catch { return null }
  return normalized === path ? path : null
}

const send = (res, status, body, extra = {}) => {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
    'cache-control': 'no-store',
    'x-rover-protocolo': PROTOCOL_VERSION,
    ...extra
  })
  res.end(text)
}

const sameSecret = (a, b) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

function readBody(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] ?? '')
    if (!/^application\/json\s*(;|$)/i.test(type)) return reject(new ProtocolError('tipo_de_conteudo'))
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > LIMITS.corpoHttpBytes) return reject(new ProtocolError('corpo_grande'))
    const chunks = []
    let total = 0
    req.on('data', (p) => {
      total += p.length
      if (total > LIMITS.corpoHttpBytes) {
        reject(new ProtocolError('corpo_grande'))
        req.destroy()
        return
      }
      chunks.push(p)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new ProtocolError('json_invalido'))
      }
    })
    req.on('error', () => reject(new ProtocolError('json_invalido')))
  })
}

// 0.5.0: the bytes of an image. Fixed type from the stored format, no sniffing, nothing executed. SHORT cache since 2026-11-25
// (MEDIA_CACHE): an image that moderation takes down leaves the caches within minutes. `CORP: cross-origin` for the site on another domain.
const uploadImage = (res, { bytes, tipo: type }, hash, { cache = MEDIA_CACHE } = {}) => {
  res.writeHead(200, {
    'content-type': type,
    'content-length': bytes.length,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': cache,
    etag: `"${hash}"`,
    'content-disposition': 'inline',
    'cross-origin-resource-policy': 'cross-origin',
    'x-rover-protocolo': PROTOCOL_VERSION
  })
  res.end(bytes)
}

// 0.11.0 part 3: a video, whole or a byte range (Range), or a redirect to a short-lived presigned URL of the S3 store. Fixed type by
// the stored format, no sniffing, short cache (a removed video leaves caches in minutes), `CORP: cross-origin` for the site.
const uploadVideo = (res, r, hash) => {
  const common = { 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'cross-origin-resource-policy': 'cross-origin', 'x-rover-protocolo': PROTOCOL_VERSION }
  if (r.redirect) {
    res.writeHead(302, { ...common, location: r.redirect, 'cache-control': 'no-store' })
    return res.end()
  }
  if (r.status === 416) {
    res.writeHead(416, { ...common, 'content-range': `bytes */${r.total}`, 'accept-ranges': 'bytes' })
    return res.end()
  }
  res.writeHead(r.status, {
    ...common,
    'content-type': r.tipo,
    'content-length': r.fim - r.inicio + 1,
    'accept-ranges': 'bytes',
    ...(r.status === 206 ? { 'content-range': `bytes ${r.inicio}-${r.fim}/${r.total}` } : {}),
    'cache-control': MEDIA_CACHE,
    etag: `"${hash}"`,
    'content-disposition': 'inline'
  })
  r.corpo.on('error', () => res.destroy())
  r.corpo.pipe(res)
}

// 0.5.0: the raw body of an upload, with a cap. A declared size above the cap is refused before reading a byte; what goes over the cap
// during reading cuts the request. The request `content-type` is ignored on purpose: the format comes from the bytes.
function readBytes(req, max) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > max) return reject(new ProtocolError('imagem_grande'))
    const chunks = []
    let total = 0
    let refused = false
    req.on('data', (p) => {
      if (refused) return
      total += p.length
      if (total > max) {
        refused = true
        chunks.length = 0
        req.pause()
        reject(new ProtocolError('imagem_grande'))
        return
      }
      chunks.push(p)
    })
    req.on('end', () => { if (!refused) resolve(Buffer.concat(chunks)) })
    req.on('error', () => reject(new ProtocolError('imagem_invalida')))
  })
}

const decode = (part) => {
  try { return decodeURIComponent(part) } catch { throw new ProtocolError('nao_encontrado') }
}

// Positive integer of up to 9 digits. `max` is optional: without it the 9-digit cap applies.
const queryInteger = (value, { nome: name, min, max = Infinity, padrao: defaultValue }) => {
  if (value === null) return defaultValue
  if (!/^\d{1,9}$/.test(value)) throw new ProtocolError('esquema', { campo: name, detalhe: `Parâmetro ${name}: precisa ser um inteiro.` })
  const n = Number(value)
  if (n < min || n > max) throw new ProtocolError('esquema', { campo: name, detalhe: `Parâmetro ${name}: precisa ser um inteiro a partir de ${min}${max === Infinity ? '' : ` e até ${max}`}.` })
  return n
}

// 0.3.2: an instant in seconds (up to 10 digits, at most the protocol instant cap). `queryInteger` above is 9 digits, which
// works for a count and a cursor but not for a timestamp.
const MAX_STAMP = 4_102_444_800
const queryStamp = (value, { nome: name, padrao: defaultValue }) => {
  if (value === null) return defaultValue
  if (!/^\d{1,10}$/.test(value) || Number(value) > MAX_STAMP) {
    throw new ProtocolError('esquema', { campo: name, detalhe: `Parâmetro ${name}: precisa ser um instante em segundos, um inteiro de 0 a ${MAX_STAMP}.` })
  }
  return Number(value)
}

/**
 * @param {object} o
 * @param {import('./relay.js').Relay} o.rele
 * @param {(evento: object) => void} [o.registrar]
 * @param {string} [o.tokenAdmin]       without it (or too short), the /v1/admin routes answer 404
 * @param {{ capacidade: number, perSecond: number }} [o.burst]
 * @param {(req: import('node:http').IncomingMessage) => string} [o.origemDe]   who the connection "origin" is; behind a trusted proxy the operator replaces this
 */
export function createRelayServer({ rele: relay, registrar: register = () => {}, tokenAdmin = null, rajada: burst = DEFAULT_BURST, origemDe: originOf = (req) => req.socket.remoteAddress ?? 'desconhecida', burstClock }) {
  const bucket = new TokenBucket({ ...burst, relogio: burstClock })
  // Proposal 0014: credentials that did not verify, per address. Once an address spends these, its signed requests are no longer
  // verified before the burst check (they count on the address), so forged credentials cannot buy a signature check each.
  const forgedBucket = new TokenBucket({ ...burst, relogio: burstClock })
  const adminEnabled = typeof tokenAdmin === 'string' && tokenAdmin.length >= MIN_ADMIN_TOKEN_LENGTH

  const requireAdmin = (req) => {
    const header = String(req.headers.authorization ?? '')
    const m = /^Bearer (.+)$/.exec(header)
    if (!m || !sameSecret(m[1], tokenAdmin)) throw new ProtocolError('nao_autorizado')
  }

  // The rover read credential comes in the Authorization header and covers the exact request (method and path with the query).
  const credentialOf = (req) =>
    req.headers.authorization === undefined ? null : { header: req.headers.authorization, metodo: req.method, alvo: req.url }

  /**
   * Proposal 0014: who pays the burst. A request signed by a rover (the read credential `Rover-Assinatura` or the upload credential
   * `Rover-Envio`) whose signature verifies against the key the relay holds pays on that rover's own bucket, wherever it comes from:
   * the site's server carries the signed reads of every signed-in person from ONE address, and they must not share one bucket.
   * Anything else, a forged or stale credential included, pays on the address, as before.
   */
  const burstKey = (req) => {
    const origin = originOf(req)
    const header = req.headers.authorization
    if (typeof header !== 'string' || header.length > 300) return origin
    const read = readReadCredential(header)
    const c = read ?? readUploadCredential(header)
    if (!c || !forgedBucket.hasToken(origin)) return origin
    const r = relay.store.rover(c.uid)
    const request = { metodo: req.method, alvo: req.url, chave: r?.chave, agora: relay.relogio() }
    const matches = r && !r.saiu && (read ? readCredentialMatches(c, request) : uploadCredentialMatches(c, request))
    if (matches) return `rover:${c.uid}`
    forgedBucket.attempt(origin)
    return origin
  }

  // Closed route table: [method, path regex, name for the log, function].
  const routes = [
    ['GET', /^\/v1\/info$/, '/v1/info', () => [200, relay.info()]],
    // 0.9.0 (proposal 0011): the profile gallery, public and cached (the list only grows; an id never changes image)
    ['GET', /^\/v1\/galeria$/, '/v1/galeria', () => [200, null, (res) => send(res, 200, relay.galeria(), { 'cache-control': 'public, max-age=3600' })]],
    ['POST', /^\/v1\/objetos$/, '/v1/objetos', async (req) => {
      const r = relay.aceitar(await readBody(req))
      return [r.estado === 'aceito' ? 201 : r.estado === 'recebida' ? 202 : 200, r]
    }],
    // report by a VISITOR, with no account and no key (VISITOR_REPORT in the protocol): the site's Report button works without login
    ['POST', /^\/v1\/objetos\/([^/]+)\/denuncias$/, '/v1/objetos/:id/denuncias', async (req, m) => [202, relay.visitorReport(m[1], await readBody(req), { origem: originOf(req) })]],
    ['POST', /^\/v1\/declaracoes$/, '/v1/declaracoes', async (req) => {
      const r = relay.acceptDeclaration(await readBody(req))
      return [r.estado === 'aceita' ? 201 : 200, r]
    }],
    ['GET', /^\/v1\/objetos\/([^/]+)$/, '/v1/objetos/:id', (req, m) => [200, relay.objeto(m[1], { credencial: credentialOf(req) })]],
    ['GET', /^\/v1\/rovers\/([^/]+)$/, '/v1/rovers/:uid', (req, m) => [200, relay.perfil(m[1])]],
    ['GET', /^\/v1\/rovers\/([^/]+)\/postagens$/, '/v1/rovers/:uid/postagens', (req, m, q) => [200, relay.postsOf(m[1], { ...pagination(q), completo: fullOf(q), credencial: credentialOf(req) })]],
    ['GET', /^\/v1\/rovers\/([^/]+)\/seguindo$/, '/v1/rovers/:uid/seguindo', (req, m, q) => [200, relay.seguindo(m[1], { ...pagination(q), credencial: credentialOf(req) })]],
    ['GET', /^\/v1\/rovers\/([^/]+)\/seguidores$/, '/v1/rovers/:uid/seguidores', (req, m, q) => [200, relay.seguidores(m[1], { ...pagination(q), credencial: credentialOf(req) })]],
    ['GET', /^\/v1\/handles\/([^/]+)$/, '/v1/handles/:handle', (req, m) => [200, relay.byHandle(m[1])]],
    ['GET', /^\/v1\/linha\/inicio$/, '/v1/linha/inicio', (req, m, q) => {
      const uid = q.get('rover')
      if (!uid || !UID_RE.test(uid)) throw new ProtocolError('esquema', { campo: 'rover', detalhe: 'Parâmetro rover: informe o uid do rover.' })
      const types = q.has('tipos') ? q.get('tipos').split(',').filter(Boolean) : ['postagem']
      return [200, relay.homeTimeline(uid, { ...pagination(q), credencial: credentialOf(req), tipos: types, completo: fullOf(q) })]
    }],
    ...socialRoutes(),
    ...mediaRoutes(),
    ...(relay.mensagens ? messageRoutes() : []),
    ['GET', /^\/v1\/admin\/denuncias$/, '/v1/admin/denuncias', (req, m, q) => {
      requireAdmin(req)
      return [200, { denuncias: relay.listReports({ limite: queryInteger(q.get('limite'), { nome: 'limite', min: 1, max: 200, padrao: 50 }) }) }]
    }],
    ['GET', /^\/v1\/admin\/apelacoes$/, '/v1/admin/apelacoes', (req, m, q) => {
      requireAdmin(req)
      return [200, relay.social.relayAppeals({ limite: queryInteger(q.get('limite'), { nome: 'limite', min: 1, max: 200, padrao: 50 }) })]
    }],
    ['POST', /^\/v1\/admin\/apelacoes\/([^/]+)\/decisao$/, '/v1/admin/apelacoes/:id/decisao', async (req, m) => {
      requireAdmin(req)
      const body = await readBody(req)
      if (!ID_RE.test(m[1]) || !['mantida', 'revertida'].includes(body?.resultado) || Object.keys(body).length !== 1) {
        throw new ProtocolError('esquema', { campo: 'resultado', detalhe: 'Informe apenas resultado: mantida ou revertida.' })
      }
      relay.social.decideRelayAppeal(m[1], body.resultado)
      return [200, { resultado: body.resultado }]
    }],
    ['GET', /^\/v1\/admin\/bloqueios$/, '/v1/admin/bloqueios', (req) => {
      requireAdmin(req)
      return [200, { bloqueios: relay.listBlocks() }]
    }],
    ['POST', /^\/v1\/admin\/bloqueios$/, '/v1/admin/bloqueios', async (req) => {
      requireAdmin(req)
      const body = await readBody(req)
      relay.bloquear(body ?? {})
      return [201, { bloqueado: true }]
    }],
    ['DELETE', /^\/v1\/admin\/bloqueios\/([^/]+)\/([^/]+)$/, '/v1/admin/bloqueios/:tipo/:alvo', (req, m) => {
      requireAdmin(req)
      relay.desbloquear(m[1], m[2])
      return [200, { desbloqueado: true }]
    }],
    // Only with the provider that reads the issuers' revoked list: the operator deliberately forgets revocations that the issuer's
    // list no longer carries (docs/RELAY-OPERATIONS.md, section 15). `{ emissor, uid }` or `{ tudo: true }`.
    ...(typeof relay.provedor.limpar === 'function' ? [['POST', /^\/v1\/admin\/revogados\/limpar$/, '/v1/admin/revogados/limpar', async (req) => {
      requireAdmin(req)
      const body = await readBody(req)
      const keys = body !== null && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort().join(',') : ''
      const all = keys === 'tudo' && body.tudo === true
      const pair = keys === 'emissor,uid' && typeof body.emissor === 'string' && PUBLIC_KEY_RE.test(body.emissor) && typeof body.uid === 'string' && UID_RE.test(body.uid)
      if (!all && !pair) throw new ProtocolError('esquema', { campo: 'corpo', detalhe: 'Informe { emissor, uid } ou { tudo: true }.' })
      return [200, relay.provedor.limpar(all ? { tudo: true } : { emissor: body.emissor, uid: body.uid })]
    }]] : []),
    // 0.3.2 (proposal 0007): only the operator publishes on the official `anuncios` channel
    ['POST', /^\/v1\/admin\/anuncios$/, '/v1/admin/anuncios', async (req) => {
      requireAdmin(req)
      const body = await readBody(req)
      return [201, relay.social.publishAnnouncement(body)]
    }],
    ['DELETE', /^\/v1\/admin\/anuncios\/([^/]+)$/, '/v1/admin/anuncios/:id', (req, m) => {
      requireAdmin(req)
      return [200, relay.social.removeAnnouncement(m[1])]
    }]
  ]

  /** 0.5.0: the image routes. With the feature off they do not exist: the relay answers as to any unknown path. */
  function mediaRoutes() {
    const media = relay.midia
    if (!media) return []
    const hashOf = (m) => {
      if (!MEDIA_HASH_RE.test(m[1])) throw new ProtocolError('nao_encontrado')
      return m[1]
    }
    return [
      ['PUT', /^\/v1\/midia\/([^/]+)$/, '/v1/midia/:hash', async (req, m) => {
        const hash = hashOf(m)
        const uid = media.prepareUpload(hash, { header: req.headers.authorization, metodo: req.method, alvo: req.url })
        const bytes = await readBytes(req, MEDIA_LIMITS.bytesMax)
        const r = media.finishUpload(hash, uid, bytes)
        return [r.estado === 'recebida' ? 201 : 200, r]
      }],
      ['GET', /^\/v1\/midia\/([^/]+)$/, '/v1/midia/:hash', (req, m) => {
        const hash = hashOf(m)
        return [200, null, (res) => uploadImage(res, media.ler(hash), hash)]
      }],
      ['GET', /^\/v1\/admin\/midia\/([^/]+)$/, '/v1/admin/midia/:hash', (req, m) => {
        requireAdmin(req)
        const hash = hashOf(m)
        return [200, null, (res) => uploadImage(res, media.readAsOperator(hash), hash, { cache: 'no-store' })]
      }],
      // the hash or the id of the `imagem` object (the id is what the report carries); 0.11.0 part 3: also the hash or the id of a `video`
      ['DELETE', /^\/v1\/admin\/midia\/([^/]+)$/, '/v1/admin/midia/:hash', async (req, m) => {
        requireAdmin(req)
        if (!MEDIA_HASH_RE.test(m[1]) && !ID_RE.test(m[1])) throw new ProtocolError('nao_encontrado')
        const body = await readBody(req)
        if (relay.videos?.knows(m[1])) {
          const r = relay.videos.purge(m[1], body)
          relay.videos.drain().catch(() => {})
          return [200, r]
        }
        return [200, media.purge(m[1], body)]
      }],
      ...videoRoutes()
    ]
  }

  /** 0.11.0 part 3: the video routes. Without `RELAY_VIDEO=sim` they do not exist. */
  function videoRoutes() {
    const videos = relay.videos
    if (!videos) return []
    const hashOf = (m) => {
      if (!MEDIA_HASH_RE.test(m[1])) throw new ProtocolError('nao_encontrado')
      return m[1]
    }
    return [
      // the body is streamed to a temporary file with a ceiling; it never sits whole in memory
      ['PUT', /^\/v1\/video\/([^/]+)$/, '/v1/video/:hash', async (req, m) => {
        const hash = hashOf(m)
        const declared = req.headers['content-length'] === undefined ? null : Number(req.headers['content-length'])
        const uid = videos.prepareUpload(hash, { header: req.headers.authorization, metodo: req.method, alvo: req.url, declared: Number.isSafeInteger(declared) ? declared : null })
        const received = await videos.receive(req)
        const r = await videos.finishUpload(hash, uid, received)
        return [r.estado === 'recebida' ? 201 : 200, r]
      }],
      ['GET', /^\/v1\/video\/([^/]+)$/, '/v1/video/:hash', async (req, m) => {
        const hash = hashOf(m)
        const r = await videos.abrir(hash, req.headers.range)
        return [r.redirect ? 302 : r.status, null, (res) => uploadVideo(res, r, hash)]
      }],
      ['GET', /^\/v1\/admin\/video\/([^/]+)$/, '/v1/admin/video/:hash', async (req, m) => {
        requireAdmin(req)
        const hash = hashOf(m)
        const r = await videos.abrir(hash, req.headers.range, { asOperator: true })
        return [r.status, null, (res) => uploadVideo(res, r, hash)]
      }]
    ]
  }

  function pagination(q) {
    const before = q.get('antes')
    return {
      antes: queryInteger(before, { nome: 'antes', min: 1, padrao: null }),
      limite: queryInteger(q.get('limite'), { nome: 'limite', min: 1, max: 50, padrao: DEFAULT_PAGE })
    }
  }

  // 0.3.1: `completo=1` asks for the items with author, counts and the reader's reaction. Any other value is an error, so it does not become a "maybe".
  function fullOf(q) {
    const v = q.get('completo')
    if (v === null) return false
    if (v !== '1') throw new ProtocolError('esquema', { campo: 'completo', detalhe: 'Parâmetro completo: use 1 ou omita.' })
    return true
  }

  const text = (q, name) => q.get(name)
  const number = (q, name, defaultValue) => queryInteger(q.get(name), { nome: name, min: 0, padrao: defaultValue })

  /** 0.4.0: private messages. They only exist with the feature on; off, the relay answers 404 as for a nonexistent route. */
  function messageRoutes() {
    const m = relay.mensagens
    const u = '([^/]+)'
    return [
      ['GET', new RegExp(`^/v1/rovers/${u}/chave-de-cifra$`), '/v1/rovers/:uid/chave-de-cifra', (req, c) => [200, m.chaveDe(c[1])]],
      ['GET', new RegExp(`^/v1/rovers/${u}/conversas$`), '/v1/rovers/:uid/conversas', (req, c, q) => [200, m.conversationsOf(c[1], { estado: q.get('estado') ?? 'todas', ...pagination(q), credencial: credentialOf(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/conversas/${u}$`), '/v1/rovers/:uid/conversas/:id', (req, c) => [200, m.conversationOf(c[1], c[2], { credencial: credentialOf(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/conversas/${u}/mensagens$`), '/v1/rovers/:uid/conversas/:id/mensagens', (req, c, q) => [200, m.messagesOf(c[1], c[2], { ...pagination(q), credencial: credentialOf(req) })]],
      ['GET', /^\/v1\/admin\/mensagens\/denuncias$/, '/v1/admin/mensagens/denuncias', (req, c, q) => {
        requireAdmin(req)
        return [200, { denuncias: m.listReports({ limite: queryInteger(q.get('limite'), { nome: 'limite', min: 1, max: 200, padrao: 50 }) }) }]
      }]
    ]
  }

  /** The 0.3 routes (social network and forum). Each one only passes through to the social layer: the rules live there. */
  function socialRoutes() {
    const s = relay.social
    const cred = (req) => credentialOf(req)
    const page = (q) => pagination(q)
    const u = '([^/]+)'
    return [
      ['GET', new RegExp(`^/v1/rovers/${u}/pagina$`), '/v1/rovers/:uid/pagina', (req, m) => [200, s.paginaDoRover(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/recados$`), '/v1/rovers/:uid/recados', (req, m, q) => [200, s.recados(m[1], page(q))]],
      ['GET', new RegExp(`^/v1/rovers/${u}/depoimentos$`), '/v1/rovers/:uid/depoimentos', (req, m, q) => [200, s.depoimentos(m[1], { ...page(q), estado: text(q, 'estado') ?? 'aceitos', credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/selos$`), '/v1/rovers/:uid/selos', (req, m) => [200, s.selos(m[1])]],
      ['GET', new RegExp(`^/v1/rovers/${u}/entregas$`), '/v1/rovers/:uid/entregas', (req, m, q) => [200, s.entregas(m[1], page(q))]],
      ['GET', new RegExp(`^/v1/rovers/${u}/amigos$`), '/v1/rovers/:uid/amigos', (req, m, q) => [200, s.amigos(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/amigos-em-comum$`), '/v1/rovers/:uid/amigos-em-comum', (req, m, q) => [200, s.amigosEmComum(m[1], text(q, 'com'), { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/comunidades$`), '/v1/rovers/:uid/comunidades', (req, m, q) => [200, s.comunidadesDoRover(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/paginas$`), '/v1/rovers/:uid/paginas', (req, m, q) => [200, s.paginasDoRover(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/amizades/pendentes$`), '/v1/rovers/:uid/amizades/pendentes', (req, m) => [200, s.amizadesPendentes(m[1], cred(req))]],
      ['GET', new RegExp(`^/v1/rovers/${u}/convites$`), '/v1/rovers/:uid/convites', (req, m) => [200, s.roverInvites(m[1], cred(req))]],
      ['GET', new RegExp(`^/v1/rovers/${u}/relacoes$`), '/v1/rovers/:uid/relacoes', (req, m, q) => [200, s.relacoes(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/removidos$`), '/v1/rovers/:uid/removidos', (req, m, q) => [200, s.removedOf(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/notificacoes$`), '/v1/rovers/:uid/notificacoes', (req, m, q) => [200, s.notificationsOf(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/notificacoes/contagem$`), '/v1/rovers/:uid/notificacoes/contagem', (req, m, q) => [200, s.contagemDeNotificacoes(m[1], { desde: number(q, 'desde', 0), credencial: cred(req) })]],
      ['GET', /^\/v1\/comunidades$/, '/v1/comunidades', (req, m, q) => [200, s.listedCommunities({ tema: text(q, 'tema'), acesso: text(q, 'acesso'), ordem: text(q, 'ordem') ?? 'recentes', ...page(q) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}$`), '/v1/comunidades/:id', (req, m) => [200, s.communityDetail(m[1], { credencial: cred(req) })]],
      // 0.11.0 part 4: events. `quando`: proximos (default), semana or passados; `comunidade`, `de` (organizer) and `vai` narrow it
      ['GET', /^\/v1\/eventos$/, '/v1/eventos', (req, m, q) => [200, relay.eventos.listar({ quando: text(q, 'quando') ?? 'proximos', comunidade: text(q, 'comunidade'), de: text(q, 'de'), vai: text(q, 'vai'), ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/eventos/${u}$`), '/v1/eventos/:id', (req, m) => [200, relay.eventos.detalhe(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/eventos/${u}/presencas$`), '/v1/eventos/:id/presencas', (req, m, q) => [200, relay.eventos.presencas(m[1], { resposta: text(q, 'resposta') ?? 'vou', ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/eventos$`), '/v1/comunidades/:id/eventos', (req, m, q) => [200, relay.eventos.listar({ quando: text(q, 'quando') ?? 'proximos', comunidade: m[1], ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/eventos$`), '/v1/rovers/:uid/eventos', (req, m, q) => [200, relay.eventos.listar({ quando: text(q, 'quando') ?? 'proximos', ...(text(q, 'papel') === 'vai' ? { vai: m[1] } : { de: m[1] }), ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/membros$`), '/v1/comunidades/:id/membros', (req, m, q) => [200, s.membersOf(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/pedidos$`), '/v1/comunidades/:id/pedidos', (req, m, q) => [200, s.pedidosDe(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/convites$`), '/v1/comunidades/:id/convites', (req, m, q) => [200, s.convitesDa(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/banidos$`), '/v1/comunidades/:id/banidos', (req, m, q) => [200, s.banidosDa(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/topicos$`), '/v1/comunidades/:id/topicos', (req, m, q) => [200, s.topicsOf(m[1], { categoria: text(q, 'categoria'), tag: text(q, 'tag'), status: text(q, 'status'), etiqueta: text(q, 'etiqueta'), ordem: text(q, 'ordem') ?? 'recentes', janela: text(q, 'janela'), ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/moderacao/fila$`), '/v1/comunidades/:id/moderacao/fila', (req, m) => [200, s.communityQueue(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/moderacao/registro$`), '/v1/comunidades/:id/moderacao/registro', (req, m, q) => [200, s.registroDaComunidade(m[1], { ...page(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/topicos/${u}$`), '/v1/topicos/:id', (req, m) => [200, s.topicDetail(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/topicos/${u}/respostas$`), '/v1/topicos/:id/respostas', (req, m, q) => [200, s.repliesOf(m[1], { em: text(q, 'em'), ...page(q), credencial: cred(req), ordem: text(q, 'ordem') ?? 'antigas', janela: text(q, 'janela') })]],
      ['GET', new RegExp(`^/v1/topicos/${u}/historico$`), '/v1/topicos/:id/historico', (req, m) => [200, s.historyOf(m[1], { credencial: cred(req) })]],
      // 0.11.0 part 2: the public history of an edited post, reply, topic or forum reply
      ['GET', new RegExp(`^/v1/objetos/${u}/edicoes$`), '/v1/objetos/:id/edicoes', (req, m) => [200, relay.edicoes.historico(m[1], { credencial: cred(req) })]],
      ['GET', /^\/v1\/paginas$/, '/v1/paginas', (req, m, q) => [200, s.listedPages({ tema: text(q, 'tema'), ordem: text(q, 'ordem') ?? 'recentes', ...page(q) })]],
      ['GET', /^\/v1\/paginas\/temas$/, '/v1/paginas/temas', () => [200, s.temasDePaginas()]],
      ['GET', new RegExp(`^/v1/paginas/${u}$`), '/v1/paginas/:id', (req, m) => [200, s.pageDetail(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/paginas/${u}/atualizacoes$`), '/v1/paginas/:id/atualizacoes', (req, m, q) => [200, s.communityUpdates(m[1], { ...page(q), completo: fullOf(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/paginas/${u}/seguidores$`), '/v1/paginas/:id/seguidores', (req, m, q) => [200, s.followersOf(m[1], page(q))]],
      ['GET', new RegExp(`^/v1/paginas/${u}/moderacao/registro$`), '/v1/paginas/:id/moderacao/registro', (req, m, q) => [200, s.pageRecord(m[1], page(q))]],
      ['GET', /^\/v1\/moderacao\/registro$/, '/v1/moderacao/registro', (req, m, q) => [200, s.registroDoRele(page(q))]],
      ['GET', new RegExp(`^/v1/postagens/${u}$`), '/v1/postagens/:id', (req, m) => [200, s.postDetail(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/postagens/${u}/respostas$`), '/v1/postagens/:id/respostas', (req, m, q) => [200, s.postReplies(m[1], { ...page(q), ordem: text(q, 'ordem') ?? 'recentes', janela: text(q, 'janela'), credencial: cred(req) })]],
      ['GET', /^\/v1\/busca$/, '/v1/busca', (req, m, q) => {
        const { antes: before, limite: limit } = page(q)
        const reader = s.leitor(cred(req), relay.relogio())
        return [200, s.buscar({ q: text(q, 'q'), tipo: text(q, 'tipo') ?? 'todos', antes: before, limite: limit, leitor: reader, ordem: text(q, 'ordem') ?? 'relevancia', janela: text(q, 'janela') }, relay.relogio())]
      }],
      // 0.3.2 (proposal 0007): the reading dashboard (rover read credential) and the relay announcements (public)
      ['GET', /^\/v1\/inicio$/, '/v1/inicio', (req, m, q) => [200, s.inicio({ desde: queryStamp(q.get('desde'), { nome: 'desde', padrao: 0 }), credencial: cred(req) })]],
      // 0.11.0 (proposal 0013): the start of the break, one read with the account, who talked to you, the feeds and what to do now
      ['GET', /^\/v1\/inicio-da-folga$/, '/v1/inicio-da-folga', (req, m, q) => [200, s.timeOffStart({
        desde: queryStamp(q.get('desde'), { nome: 'desde', padrao: null }), limite: queryInteger(q.get('limite'), { nome: 'limite', min: 1, max: 20, padrao: 10 }), credencial: cred(req)
      })]],
      ['GET', /^\/v1\/anuncios$/, '/v1/anuncios', (req, m, q) => [200, s.listAnnouncements(page(q))]],
      ['GET', new RegExp(`^/v1/anuncios/${u}$`), '/v1/anuncios/:id', (req, m) => [200, s.anuncio(m[1])]],
      ['GET', /^\/v1\/descobrir\/em-alta$/, '/v1/descobrir/em-alta', (req, m, q) => [200, s.emAlta({ tipo: text(q, 'tipo') ?? 'topicos', janela: text(q, 'janela') }, relay.relogio())]],
      ['GET', /^\/v1\/descobrir\/recem-chegados$/, '/v1/descobrir/recem-chegados', (req, m, q) => [200, s.recemChegados({ limite: queryInteger(q.get('limite'), { nome: 'limite', min: 1, max: 50, padrao: 50 }) }, relay.relogio())]],
      ['GET', /^\/v1\/descobrir\/sugestoes$/, '/v1/descobrir/sugestoes', (req, m, q) => {
        const rover = text(q, 'rover')
        if (rover !== null && !UID_RE.test(rover)) throw new ProtocolError('esquema', { campo: 'rover', detalhe: 'Parâmetro rover: informe um uid.' })
        const reader = s.leitor(cred(req), relay.relogio())
        return [200, s.sugestoes({ tipo: text(q, 'tipo') ?? 'comunidades', interesses: text(q, 'interesses'), rover, leitor: reader }, relay.relogio())]
      }],
      ['GET', /^\/v1\/descobrir\/tendencias$/, '/v1/descobrir/tendencias', (req, m, q) => [200, s.tendencias({ janela: text(q, 'janela') }, relay.relogio())]],
      // 0.10.0 (proposal 0012): ordered posts, ranking, karma, the profile scoreboard and the badge catalog
      ['GET', /^\/v1\/postagens$/, '/v1/postagens', (req, m, q) => [200, s.postagensOrdenadas({ ordem: text(q, 'ordem') ?? 'quentes', janela: text(q, 'janela'), ...page(q), credencial: cred(req) })]],
      ['GET', /^\/v1\/ranking\/autores$/, '/v1/ranking/autores', (req, m, q) => [200, s.authorRanking({ periodo: text(q, 'periodo') ?? 'semana', especie: text(q, 'especie') ?? 'todas', ...page(q) })]],
      ['GET', /^\/v1\/ranking\/subindo$/, '/v1/ranking/subindo', (req, m, q) => [200, s.risingRanking({ especie: text(q, 'especie') ?? 'todas', ...page(q) })]],
      ['GET', /^\/v1\/ranking\/novatos$/, '/v1/ranking/novatos', (req, m, q) => [200, s.newcomerRanking({ especie: text(q, 'especie') ?? 'todas', ...page(q) })]],
      ['GET', /^\/v1\/karma$/, '/v1/karma', (req, m, q) => [200, s.karmaBatch((text(q, 'uids') ?? '').split(',').filter(Boolean))]],
      ['GET', /^\/v1\/conquistas$/, '/v1/conquistas', () => [200, s.achievementCatalog()]],
      ['GET', new RegExp(`^/v1/rovers/${u}/placar$`), '/v1/rovers/:uid/placar', (req, m) => [200, s.scoreboardOf(m[1])]],
      // addition of 2026-11-26 to 0.11.0: the rover's memories (what it published yesterday, weeks ago and on its first day), public
      ['GET', new RegExp(`^/v1/rovers/${u}/lembrancas$`), '/v1/rovers/:uid/lembrancas', (req, m, q) => [200, s.lembrancas(m[1], {
        limite: queryInteger(q.get('limite'), { nome: 'limite', min: 1, max: MEMORIES.maxItems, padrao: MEMORIES.defaultItems }), credencial: cred(req)
      })]]
    ]
  }

  const server = createServer(async (req, res) => {
    const home = process.hrtime.bigint()
    let routeName = '?'
    let status
    try {
      const timeOff = bucket.attempt(burstKey(req))
      if (!timeOff.ok) throw new ProtocolError('limite_de_taxa', { retryAfterS: timeOff.waitS })
      if (req.url.length > URL_LIMIT) throw new ProtocolError('nao_encontrado')
      const path = requestPath(req.url)
      if (path === null || req[HIDDEN_ROUTE] === true) throw new ProtocolError('nao_encontrado')
      const url = new URL(req.url, 'http://relay.local')
      const candidates = routes.filter(([, re]) => re.test(path))
      const route = candidates.find(([method]) => method === req.method)
      if (!route) {
        if (candidates.length) throw new ProtocolError('metodo_nao_permitido')
        throw new ProtocolError('nao_encontrado')
      }
      routeName = route[2]
      if (routeName.startsWith('/v1/admin') && !adminEnabled) throw new ProtocolError('nao_encontrado')
      const match = route[1].exec(path)
      const [code, body, respond] = await route[3](req, match.map((p, i) => (i ? decode(p) : p)), url.searchParams)
      status = code
      if (respond) respond(res)
      else send(res, code, body)
    } catch (e) {
      const error = e instanceof ProtocolError ? e : null
      status = error?.status ?? 500
      if (!error) register({ nivel: 'erro', evento: 'erro_interno', tipo: e?.name ?? 'Error' })
      const reply = (error ?? new ProtocolError('erro_interno')).toJson()
      // 0.5.0: refusal of a large upload closes the connection (the rest of the body is not read)
      const close = error?.codigo === 'imagem_grande' || error?.codigo === 'video_grande' ? { connection: 'close' } : {}
      send(res, status, reply, { ...close, ...(error?.retryAfterS ? { 'retry-after': String(error.retryAfterS) } : {}) })
    } finally {
      register({ nivel: 'info', evento: 'pedido', metodo: req.method, rota: routeName, status, ms: Number((process.hrtime.bigint() - home) / 1_000_000n) })
    }
  })
  // 0.11.0 part 3: a 50 MB video takes longer than 10 seconds to arrive; the headers keep their 5 seconds
  server.requestTimeout = relay.videos ? 300_000 : 10_000
  server.headersTimeout = 5_000
  server.keepAliveTimeout = 5_000
  return server
}

export { ID_RE }
