// SPDX-License-Identifier: AGPL-3.0-or-later
// A local S3 double for the tests: object PUT, GET (with Range), HEAD and DELETE, bucket HEAD and presigned GET, in memory.
// It CHECKS what a real store checks: the Signature Version 4 of every request (computed here from the request as it arrived, with
// code that does not import the client under test), the clock skew, the SHA-256 of the body against `x-amz-content-sha256`, and
// the Content-Length. A request the real MinIO would refuse is refused here with the same status.
import { createHash, createHmac } from 'node:crypto'
import { createServer } from 'node:http'

const sha = (b) => createHash('sha256').update(b).digest('hex')
const mac = (k, t) => createHmac('sha256', k).update(t).digest()
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

function expectedSignature({ segredo: secret, regiao: region, data, metodo: method, caminho: path, consulta: query, cabecalhos: headers, signed, bodyHash }) {
  const short = data.slice(0, 8)
  const canonical = [...query].map(([k, v]) => `${enc(k)}=${enc(v)}`).sort().join('&')
  const request = [method, path, canonical, signed.map((n) => `${n}:${String(headers[n]).trim()}\n`).join(''), signed.join(';'), bodyHash].join('\n')
  const scope = `${short}/${region}/s3/aws4_request`
  const key = mac(mac(mac(mac(`AWS4${secret}`, short), region), 's3'), 'aws4_request')
  return createHmac('sha256', key).update(['AWS4-HMAC-SHA256', data, scope, sha(request)].join('\n')).digest('hex')
}

const instant = (long) => Date.parse(`${long.slice(0, 4)}-${long.slice(4, 6)}-${long.slice(6, 8)}T${long.slice(9, 11)}:${long.slice(11, 13)}:${long.slice(13, 15)}Z`)

/**
 * @param {{ bucket?: string, chave?: string, segredo?: string, regiao?: string, agora?: () => number, cotaBytes?: number }} [o]
 * `agora` in milliseconds (the double refuses a request more than 15 minutes away from it, as S3 does).
 */
export async function startS3({ bucket = 'folgali-midia', chave: key = 'chave-de-teste', segredo: secret = 'segredo-de-teste-0123456789', regiao: region = 'us-east-1', agora: now = () => Date.now() } = {}) {
  const objects = new Map()
  const requests = []
  let fail = null
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://s3.local')
    const parts = []
    for await (const p of req) parts.push(p)
    const body = Buffer.concat(parts)
    const respond = (status, header = {}, data = null) => { res.writeHead(status, header); res.end(data ?? undefined) }
    requests.push({ metodo: req.method, caminho: url.pathname, faixa: req.headers.range ?? null, bytes: body.length })
    if (fail) { const s = fail; return respond(s, { 'content-type': 'application/xml' }, '<Error/>') }
    // ---- signature ----
    const headers = req.headers
    const query = [...url.searchParams]
    let ok = false
    const auth = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(headers.authorization ?? '')
    if (auth) {
      const [, c, , r, signed, sig] = auth
      const data = headers['x-amz-date'] ?? ''
      const list = signed.split(';')
      const fresh = Math.abs(instant(data) - now()) <= 15 * 60_000
      const required = ['host', 'x-amz-content-sha256', 'x-amz-date'].every((n) => list.includes(n))
      const bodyHash = headers['x-amz-content-sha256']
      ok = c === key && r === region && fresh && required && bodyHash === sha(body) &&
        sig === expectedSignature({ segredo: secret, regiao: region, data, metodo: req.method, caminho: url.pathname, consulta: query, cabecalhos: headers, signed: list, bodyHash })
    } else if (url.searchParams.get('X-Amz-Signature')) {
      const sig = url.searchParams.get('X-Amz-Signature')
      const withoutSig = query.filter(([k]) => k !== 'X-Amz-Signature')
      const data = url.searchParams.get('X-Amz-Date') ?? ''
      const expires = Number(url.searchParams.get('X-Amz-Expires'))
      const current = now() >= instant(data) - 60_000 && now() <= instant(data) + expires * 1000
      ok = req.method === 'GET' && current && url.searchParams.get('X-Amz-SignedHeaders') === 'host' &&
        url.searchParams.get('X-Amz-Credential') === `${key}/${data.slice(0, 8)}/${region}/s3/aws4_request` &&
        sig === expectedSignature({ segredo: secret, regiao: region, data, metodo: 'GET', caminho: url.pathname, consulta: withoutSig, cabecalhos: headers, signed: ['host'], bodyHash: 'UNSIGNED-PAYLOAD' })
    }
    if (!ok) return respond(403, { 'content-type': 'application/xml' }, '<Error><Code>SignatureDoesNotMatch</Code></Error>')
    // ---- routes ----
    const m = /^\/([^/]+)(?:\/(.+))?$/.exec(decodeURIComponent(url.pathname))
    if (!m || m[1] !== bucket) return respond(404, {}, '<Error><Code>NoSuchBucket</Code></Error>')
    const name = m[2]
    if (!name) return respond(req.method === 'HEAD' ? 200 : 405)
    if (req.method === 'PUT') {
      if (Number(headers['content-length']) !== body.length) return respond(400)
      objects.set(name, { bytes: body, tipo: headers['content-type'] ?? 'application/octet-stream' })
      return respond(200, { etag: `"${sha(body).slice(0, 32)}"` })
    }
    if (req.method === 'DELETE') { objects.delete(name); return respond(204) }
    const o = objects.get(name)
    if (!o) return respond(404, {}, req.method === 'HEAD' ? null : '<Error><Code>NoSuchKey</Code></Error>')
    const base = { 'content-type': o.tipo, 'accept-ranges': 'bytes', etag: `"${sha(o.bytes).slice(0, 32)}"` }
    if (req.method === 'HEAD') return respond(200, { ...base, 'content-length': o.bytes.length })
    if (req.method !== 'GET') return respond(405)
    const f = /^bytes=(\d*)-(\d*)$/.exec(headers.range ?? '')
    if (!f) return respond(200, { ...base, 'content-length': o.bytes.length }, o.bytes)
    const total = o.bytes.length
    let [ini, end] = [f[1] === '' ? null : Number(f[1]), f[2] === '' ? null : Number(f[2])]
    if (ini === null) { ini = Math.max(0, total - end); end = total - 1 } else if (end === null || end >= total) end = total - 1
    if (ini > end || ini >= total) return respond(416, { 'content-range': `bytes */${total}` })
    return respond(206, { ...base, 'content-length': end - ini + 1, 'content-range': `bytes ${ini}-${end}/${total}` }, o.bytes.subarray(ini, end + 1))
  })
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
  const endpoint = `http://127.0.0.1:${server.address().port}`
  return {
    endpoint, bucket, chave: key, segredo: secret, regiao: region, objetos: objects, pedidos: requests,
    /** Makes every request answer this status (a store that is down or out of space); `null` goes back to normal. */
    failWith: (status) => { fail = status },
    fechar: () => new Promise((end) => { server.closeAllConnections(); server.close(end) })
  }
}
