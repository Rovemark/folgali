// SPDX-License-Identifier: AGPL-3.0-or-later
// A small S3 client for the media store of the relay (0.11.0, proposal 0013): put, get with Range, head, delete and a presigned GET.
// Signature Version 4 made with `node:crypto`, requests made with `node:http` and `node:https`: the relay has no npm dependency and
// this file keeps it that way. Path-style addressing (`<endpoint>/<bucket>/<key>`), which is what MinIO and every S3-compatible
// store accept. Nothing here logs a key, a secret or a signed URL.
import { createHash, createHmac } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'

const ALGORITHM = 'AWS4-HMAC-SHA256'
const SERVICE = 's3'
export const WITHOUT_SIGNING_BODY = 'UNSIGNED-PAYLOAD'
export const EMPTY_HASH = createHash('sha256').update('').digest('hex')

const hex = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hmac = (key, text) => createHmac('sha256', key).update(text).digest()
/** RFC 3986: everything but the unreserved characters is percent-encoded, in upper case. */
const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const canonicalPath = (path) => path.split('/').map(encode).join('/')
const canonicalQuery = (pairs) => [...pairs].map(([k, v]) => [encode(k), encode(v)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')

/** `20130524T000000Z` and `20130524` from a Date. */
export function datesV4(data) {
  const iso = data.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return { longa: iso, curta: iso.slice(0, 8) }
}

function signature({ segredo: secret, regiao: region, curta: short, longa: long, canonicalRequest }) {
  const scope = `${short}/${region}/${SERVICE}/aws4_request`
  const toSign = [ALGORITHM, long, scope, hex(canonicalRequest)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, short), region), SERVICE), 'aws4_request')
  return { escopo: scope, valor: createHmac('sha256', key).update(toSign).digest('hex') }
}

/**
 * The headers of a signed request (Signature Version 4, header form). `cabecalhos` are the ones to sign besides `host`,
 * `x-amz-content-sha256` and `x-amz-date`, which are always added and signed.
 * @returns {Record<string, string>} every header to send, with `authorization`
 */
export function signV4({ metodo: method, host, caminho: path, consulta: query = [], cabecalhos: headers = {}, bodyHash, regiao: region, chave: key, segredo: secret, data }) {
  const { longa: long, curta: short } = datesV4(data)
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host, 'x-amz-content-sha256': bodyHash, 'x-amz-date': long }
  const names = Object.keys(all).sort()
  const canonicalRequest = [method, canonicalPath(path), canonicalQuery(query), names.map((n) => `${n}:${all[n]}\n`).join(''), names.join(';'), bodyHash].join('\n')
  const { escopo: scope, valor: value } = signature({ segredo: secret, regiao: region, curta: short, longa: long, canonicalRequest })
  return { ...all, authorization: `${ALGORITHM} Credential=${key}/${scope}, SignedHeaders=${names.join(';')}, Signature=${value}` }
}

/** A presigned GET (Signature Version 4, query form): whoever holds the URL reads the object until it expires. */
export function signedUrlV4({ base, host, caminho: path, expiresS, regiao: region, chave: key, segredo: secret, data }) {
  const { longa: long, curta: short } = datesV4(data)
  const scope = `${short}/${region}/${SERVICE}/aws4_request`
  const query = [['X-Amz-Algorithm', ALGORITHM], ['X-Amz-Credential', `${key}/${scope}`], ['X-Amz-Date', long], ['X-Amz-Expires', String(expiresS)], ['X-Amz-SignedHeaders', 'host']]
  const canonicalRequest = ['GET', canonicalPath(path), canonicalQuery(query), `host:${host}\n`, 'host', WITHOUT_SIGNING_BODY].join('\n')
  const { valor: value } = signature({ segredo: secret, regiao: region, curta: short, longa: long, canonicalRequest })
  return `${base}${canonicalPath(path)}?${canonicalQuery(query)}&X-Amz-Signature=${value}`
}

export class S3Error extends Error {
  constructor(status, operation) {
    super(`o armazenamento S3 respondeu ${status} em ${operation}`)
    this.name = 'ErroDoS3'
    this.status = status
    this.operacao = operation
  }
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/
const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/

export class S3 {
  /**
   * @param {object} o
   * @param {string} o.endpoint   `http(s)://host[:porta]`, without a path (MinIO: the API address, not the console)
   * @param {string} o.bucket
   * @param {string} [o.regiao]   `us-east-1` when the store does not care (MinIO)
   * @param {string} o.chave      access key
   * @param {string} o.segredo    secret key
   * @param {string} [o.publicAddress]  the address a BROWSER reaches the store at, for presigned URLs; missing: no presigned URL
   * @param {() => Date} [o.agora]
   * @param {number} [o.prazoMs]  how long a request may take to answer (the body may take longer)
   */
  constructor({ endpoint, bucket, regiao: region = 'us-east-1', chave: key, segredo: secret, publicAddress = null, agora: now = () => new Date(), prazoMs: deadlineMs = 30_000 }) {
    const url = readAddress(endpoint, 'o endpoint do S3')
    if (typeof bucket !== 'string' || !BUCKET_RE.test(bucket)) throw new Error('o bucket do S3 precisa ter de 3 a 63 caracteres: letras minúsculas, algarismos, ponto e hífen')
    if (typeof region !== 'string' || !/^[a-z0-9-]{1,32}$/.test(region)) throw new Error('a região do S3 é inválida')
    if (typeof key !== 'string' || key.length < 3 || /\s/.test(key)) throw new Error('falta a chave de acesso do S3')
    if (typeof secret !== 'string' || secret.length < 8) throw new Error('falta o segredo do S3 (pelo menos 8 caracteres)')
    this.url = url
    this.bucket = bucket
    this.regiao = region
    this.chave = key
    this.publico = publicAddress ? readAddress(publicAddress, 'o endereço público do S3') : null
    this.agora = now
    this.prazoMs = deadlineMs
    // the secret is kept out of the enumerable fields: an object printed by mistake does not show it
    Object.defineProperty(this, '_segredo', { value: secret, enumerable: false })
  }

  _path(objectKey) {
    if (typeof objectKey !== 'string' || !KEY_RE.test(objectKey) || objectKey.includes('..')) throw new Error('chave de objeto inválida')
    return `/${this.bucket}/${objectKey}`
  }

  /** One request. Resolves with the response (status, headers and the body stream, not consumed). */
  _request(method, path, { cabecalhos: headers = {}, bodyHash = EMPTY_HASH, corpo: body = null, consulta: query = [] } = {}) {
    const signed = signV4({ metodo: method, host: this.url.host, caminho: path, consulta: query, cabecalhos: headers, bodyHash, regiao: this.regiao, chave: this.chave, segredo: this._segredo, data: this.agora() })
    const { host: _host, ...send } = signed
    const ask = this.url.protocol === 'https:' ? requestHttps : requestHttp
    return new Promise((ok, failed) => {
      const req = ask({
        method: method, hostname: this.url.hostname, port: this.url.port || (this.url.protocol === 'https:' ? 443 : 80),
        path: `${canonicalPath(path)}${query.length ? `?${canonicalQuery(query)}` : ''}`, headers: { ...send, host: this.url.host }
      }, ok)
      req.setTimeout(this.prazoMs, () => req.destroy(new Error('o armazenamento S3 não respondeu a tempo')))
      req.on('error', failed)
      if (body === null) req.end()
      else if (Buffer.isBuffer(body)) req.end(body)
      else {
        body.on('error', (e) => req.destroy(e))
        body.pipe(req)
      }
    })
  }

  /** Reads and throws away a response body, so the connection is released. */
  static async _discard(res) {
    for await (const _ of res) { /* drained */ }
  }

  /**
   * Stores an object. The SHA-256 of the body is signed with the request: the store refuses bytes that are not the ones announced.
   * @param {string} objectKey
   * @param {{ caminho?: string, bytes?: Buffer, tamanho: number, sha256: string, tipo: string }} o   a file on disk or bytes in memory
   */
  async por(objectKey, { caminho: path = null, bytes = null, tamanho: size, sha256, tipo: type }) {
    if (!Number.isSafeInteger(size) || size < 0 || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error('o envio ao S3 precisa do tamanho e do SHA-256 do corpo')
    const res = await this._request('PUT', this._path(objectKey), {
      cabecalhos: { 'content-length': String(size), 'content-type': type }, bodyHash: sha256, corpo: bytes ?? createReadStream(path)
    })
    await S3._discard(res)
    if (res.statusCode !== 200) throw new S3Error(res.statusCode, 'PUT')
  }

  /**
   * Opens an object for reading, whole or a range (`faixa`: the value of a Range header, already validated by who calls).
   * @returns {Promise<{ status: 200 | 206, tamanho: number | null, faixa: string | null, corpo: import('node:http').IncomingMessage }>}
   */
  async abrir(objectKey, { faixa: band = null } = {}) {
    const res = await this._request('GET', this._path(objectKey), { cabecalhos: band ? { range: band } : {} })
    if (res.statusCode !== 200 && res.statusCode !== 206) {
      await S3._discard(res)
      throw new S3Error(res.statusCode, 'GET')
    }
    const size = Number(res.headers['content-length'])
    return { status: res.statusCode, tamanho: Number.isSafeInteger(size) ? size : null, faixa: res.headers['content-range'] ?? null, corpo: res }
  }

  /** The size of the object, or null when it is not there. */
  async sizeOf(objectKey) {
    const res = await this._request('HEAD', this._path(objectKey))
    await S3._discard(res)
    if (res.statusCode === 404) return null
    if (res.statusCode !== 200) throw new S3Error(res.statusCode, 'HEAD')
    return Number(res.headers['content-length'])
  }

  /** Deletes an object. Deleting what is not there is not an error (S3 answers 204 either way). */
  async apagar(objectKey) {
    const res = await this._request('DELETE', this._path(objectKey))
    await S3._discard(res)
    if (res.statusCode !== 204 && res.statusCode !== 200 && res.statusCode !== 404) throw new S3Error(res.statusCode, 'DELETE')
  }

  /** Is the bucket there and does this key reach it? Used when the relay starts and by the smoke script. */
  async check() {
    const res = await this._request('HEAD', `/${this.bucket}`)
    await S3._discard(res)
    if (res.statusCode !== 200) throw new S3Error(res.statusCode, 'HEAD do bucket')
  }

  /** A presigned GET on the PUBLIC address, valid for `expiresS` seconds; null when no public address was configured. */
  readUrl(objectKey, expiresS) {
    if (!this.publico) return null
    if (!Number.isSafeInteger(expiresS) || expiresS < 1 || expiresS > 604800) throw new Error('a validade de uma URL assinada vai de 1 segundo a 7 dias')
    return signedUrlV4({ base: this.publico.origin, host: this.publico.host, caminho: this._path(objectKey), expiresS, regiao: this.regiao, chave: this.chave, segredo: this._segredo, data: this.agora() })
  }
}

function readAddress(text, what) {
  let url
  try { url = new URL(String(text)) } catch { throw new Error(`${what} precisa ser um endereço http(s)`) }
  if (!['http:', 'https:'].includes(url.protocol) || (url.pathname !== '/' && url.pathname !== '') || url.search || url.username || url.password) {
    throw new Error(`${what} precisa ser só esquema, host e porta, como https://s3.exemplo.com`)
  }
  return url
}
